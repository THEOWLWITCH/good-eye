/*
 * DA — Geometric deformation engine (spec §4.1, §9 "שדה גאומטרי").
 *
 * Coordinates are normalized to the stimulus square: (0,0) top-left, (1,1) bottom-right.
 * This keeps every saved calibration independent of window size, so it restores exactly.
 *
 * A calibration is a sequence of local "drag" operations. Each operation moves the point it
 * grabbed (anchor) by delta, and the surroundings follow with a smooth compact kernel
 * (Wendland C2) inside radius r. The composite of all operations is a continuous 2D
 * displacement field:  P(x) = f_n( ... f_2( f_1(x) ) ).
 *
 * Fold guarantee: det J_i = 1 + delta·∇w ≥ 1 − (|delta|/r)·KERNEL_MAX_SLOPE.
 * If every op keeps |delta|/r below FOLD_RATIO, every det is > 0, and by the chain rule the
 * composite map has no folds or tears.
 */
(function (root) {
  'use strict';
  var DA = (root.DA = root.DA || {});

  // Wendland C2 kernel: w(0)=1, w(1)=0, C2-smooth, zero outside the radius.
  function kernel(t) {
    if (t >= 1) return 0;
    var a = 1 - t;
    return a * a * a * a * (4 * t + 1);
  }
  // dw/dt
  function kernelDeriv(t) {
    if (t >= 1) return 0;
    var a = 1 - t;
    return -20 * t * a * a * a;
  }
  // max |dw/dt| is reached at t = 1/4
  var KERNEL_MAX_SLOPE = 20 * 0.25 * Math.pow(0.75, 3); // ≈ 2.109
  var FOLD_RATIO = 1 / KERNEL_MAX_SLOPE; // ≈ 0.474: |delta|/r at which a fold starts
  // Local area scale (det J) outside this range is reported as "extreme" (strong local squeeze/stretch).
  var EXTREME_MIN_DET = 0.15, EXTREME_MAX_DET = 5;

  function applyOne(op, x, y) {
    var ex = x - op.ax, ey = y - op.ay;
    var d = Math.sqrt(ex * ex + ey * ey);
    if (d >= op.r) return [x, y];
    var w = kernel(d / op.r);
    return [x + op.dx * w, y + op.dy * w];
  }

  function apply(ops, x, y) {
    var p = [x, y];
    for (var i = 0; i < ops.length; i++) p = applyOne(ops[i], p[0], p[1]);
    return p;
  }

  function applyToPolyline(ops, pts) {
    var out = new Array(pts.length);
    for (var i = 0; i < pts.length; i++) out[i] = apply(ops, pts[i][0], pts[i][1]);
    return out;
  }

  // Jacobian of the composite map at (x,y), analytic, via chain rule.
  function jacobian(ops, x, y) {
    var a = 1, b = 0, c = 0, d = 1; // accumulated J = [[a,b],[c,d]]
    var px = x, py = y;
    for (var i = 0; i < ops.length; i++) {
      var op = ops[i];
      var ex = px - op.ax, ey = py - op.ay;
      var dist = Math.sqrt(ex * ex + ey * ey);
      var j11 = 1, j12 = 0, j21 = 0, j22 = 1;
      if (dist < op.r && dist > 1e-12) {
        var g = kernelDeriv(dist / op.r) / (op.r * dist); // ∇w = g * e
        j11 = 1 + op.dx * g * ex; j12 = op.dx * g * ey;
        j21 = op.dy * g * ex;     j22 = 1 + op.dy * g * ey;
      }
      var na = j11 * a + j12 * c, nb = j11 * b + j12 * d;
      var nc = j21 * a + j22 * c, nd = j21 * b + j22 * d;
      a = na; b = nb; c = nc; d = nd;
      var p = applyOne(op, px, py); px = p[0]; py = p[1];
    }
    return [[a, b], [c, d]];
  }

  function det(J) { return J[0][0] * J[1][1] - J[0][1] * J[1][0]; }

  /** Inverse mapping (screen → original), for future pixel warping (§9 "מיפוי פיקסלים הפוך"). */
  function invert(ops, tx, ty, iterations) {
    var x = tx, y = ty, n = iterations || 30;
    for (var k = 0; k < n; k++) {
      var p = apply(ops, x, y);
      var rx = p[0] - tx, ry = p[1] - ty;
      if (rx * rx + ry * ry < 1e-20) break;
      var J = jacobian(ops, x, y), D = det(J);
      if (Math.abs(D) < 1e-9) { x -= rx; y -= ry; continue; }
      x -= (J[1][1] * rx - J[0][1] * ry) / D;
      y -= (-J[1][0] * rx + J[0][0] * ry) / D;
    }
    return [x, y];
  }

  /** Smallest possible det for one op (analytic lower bound). */
  function opMinDetBound(op) {
    var mag = Math.sqrt(op.dx * op.dx + op.dy * op.dy);
    return 1 - (mag / op.r) * KERNEL_MAX_SLOPE;
  }

  /** Clamp a delta so the op stays fold-free (with safety margin). */
  function clampDelta(dx, dy, r, safety) {
    var max = r * FOLD_RATIO * (safety == null ? 0.9 : safety);
    var mag = Math.sqrt(dx * dx + dy * dy);
    if (mag <= max) return { dx: dx, dy: dy, clamped: false };
    return { dx: dx * max / mag, dy: dy * max / mag, clamped: true };
  }

  /**
   * Quality check of the whole field: folds (det ≤ 0) and extreme local scaling.
   * Samples det J on an n×n lattice and also uses the analytic per-op bound.
   */
  function analyze(ops, n) {
    n = n || 41;
    var minDet = Infinity, maxDet = -Infinity, minAt = null, maxDisp = 0;
    for (var i = 0; i < n; i++) {
      for (var j = 0; j < n; j++) {
        var x = i / (n - 1), y = j / (n - 1);
        var D = det(jacobian(ops, x, y));
        if (D < minDet) { minDet = D; minAt = [x, y]; }
        if (D > maxDet) maxDet = D;
        var p = apply(ops, x, y);
        var disp = Math.hypot(p[0] - x, p[1] - y);
        if (disp > maxDisp) maxDisp = disp;
      }
    }
    var bound = 1, foldOps = [];
    for (var k = 0; k < ops.length; k++) {
      var b = opMinDetBound(ops[k]);
      bound *= Math.max(b, 0);
      if (b <= 0) foldOps.push(k);
    }
    var fold = foldOps.length > 0 || minDet <= 0;
    var extreme = !fold && (minDet < EXTREME_MIN_DET || maxDet > EXTREME_MAX_DET);
    return {
      foldFree: !fold,
      fold: fold,
      extreme: extreme,
      foldOps: foldOps,
      minDet: ops.length ? minDet : 1,
      maxDet: ops.length ? maxDet : 1,
      minDetAt: minAt,
      maxDisplacement: maxDisp,
      sampleN: n
    };
  }

  /** Sample the displacement field on an n×n lattice (stored with each trial as the fitted model). */
  function sampleField(ops, n) {
    n = n || 33;
    var dx = [], dy = [];
    for (var j = 0; j < n; j++) {
      for (var i = 0; i < n; i++) {
        var x = i / (n - 1), y = j / (n - 1);
        var p = apply(ops, x, y);
        dx.push(round6(p[0] - x));
        dy.push(round6(p[1] - y));
      }
    }
    return { n: n, layout: 'row-major, y then x, normalized units', dx: dx, dy: dy };
  }

  function round6(v) { return Math.round(v * 1e6) / 1e6; }

  DA.deformation = {
    kernel: kernel,
    kernelDeriv: kernelDeriv,
    KERNEL_MAX_SLOPE: KERNEL_MAX_SLOPE,
    FOLD_RATIO: FOLD_RATIO,
    applyOne: applyOne,
    apply: apply,
    applyToPolyline: applyToPolyline,
    jacobian: jacobian,
    det: det,
    invert: invert,
    opMinDetBound: opMinDetBound,
    clampDelta: clampDelta,
    analyze: analyze,
    sampleField: sampleField
  };
})(typeof window !== 'undefined' ? window : globalThis);
