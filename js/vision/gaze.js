/*
 * עין טובה — Where on the screen the reader is looking, from the camera (coarse).
 *
 * The face tracker (eyes.js) gives where the irises sit inside the eye openings and the head
 * angles. A short calibration (9 dots to learn, 4 dots to check) fits a linear map from those to
 * screen coordinates:  x = a0 + a1·h + a2·yaw,  y = b0 + b1·v + b2·pitch.
 * The check dots give an honest accuracy in degrees. A webcam is typically 2–4° off, so the
 * result is used to find the LINE and the word being read (snapped to the text), not a precise
 * point; for a precise fixation the "word by word" mode with its fixed mark is better.
 */
(function (root) {
  'use strict';
  var DA = (root.DA = root.DA || {});

  // ---------- pure maths (unit-tested) ----------
  /** Solve a 3×3 system (Gaussian elimination with partial pivoting). */
  function solve3(A, b) {
    var M = A.map(function (r, i) { return r.concat([b[i]]); });
    for (var c = 0; c < 3; c++) {
      var p = c;
      for (var r = c + 1; r < 3; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
      var t = M[c]; M[c] = M[p]; M[p] = t;
      if (Math.abs(M[c][c]) < 1e-12) return null;
      for (var r2 = 0; r2 < 3; r2++) {
        if (r2 === c) continue;
        var f = M[r2][c] / M[c][c];
        for (var k = c; k < 4; k++) M[r2][k] -= f * M[c][k];
      }
    }
    return [M[0][3] / M[0][0], M[1][3] / M[1][1], M[2][3] / M[2][2]];
  }
  /** Least squares y ≈ c0 + c1·f1 + c2·f2, with a tiny ridge so a flat feature does not break it. */
  function fitLinear(rows, ys) {
    var A = [[0, 0, 0], [0, 0, 0], [0, 0, 0]], b = [0, 0, 0];
    rows.forEach(function (f, n) {
      var x = [1, f[0], f[1]];
      for (var i = 0; i < 3; i++) { b[i] += x[i] * ys[n]; for (var j = 0; j < 3; j++) A[i][j] += x[i] * x[j]; }
    });
    A[1][1] += 1e-6; A[2][2] += 1e-6;
    return solve3(A, b);
  }
  /** samples: [{ h, v, yaw, pitch, x, y }] (x, y: screen px of the dot) → model. */
  function fit(samples) {
    var cx = fitLinear(samples.map(function (s) { return [s.h, s.yaw]; }), samples.map(function (s) { return s.x; }));
    var cy = fitLinear(samples.map(function (s) { return [s.v, s.pitch]; }), samples.map(function (s) { return s.y; }));
    return cx && cy ? { cx: cx, cy: cy } : null;
  }
  function predict(m, f) {
    return { x: m.cx[0] + m.cx[1] * f.h + m.cx[2] * f.yaw, y: m.cy[0] + m.cy[1] * f.v + m.cy[2] * f.pitch };
  }
  /** Mean distance (px) between predictions and the true dots. */
  function meanError(m, samples) {
    if (!samples.length) return Infinity;
    return samples.reduce(function (a, s) { var p = predict(m, s); return a + Math.hypot(p.x - s.x, p.y - s.y); }, 0) / samples.length;
  }

  // ---------- live state ----------
  var model = null, errDeg = null, smooth = null, listening = false;
  var USABLE_DEG = 3;   // beyond this the camera cannot even tell the line apart reliably

  function features() {
    var s = DA.eyes.state;
    if (!s.running || !s.face || !s.gaze) return null;
    return { h: s.gaze.h, v: s.gaze.v, yaw: s.head ? s.head.yaw : 0, pitch: s.head ? s.head.pitch : 0 };
  }

  function listen() {
    if (listening) return;
    listening = true;
    DA.eyes.on(function () {
      if (!model) return;
      var f = features();
      if (!f) { smooth = null; return; }
      var p = predict(model, f);
      if (!smooth) { smooth = p; return; }
      // calm the jitter, but follow a real jump (a new line) quickly
      var jump = Math.hypot(p.x - smooth.x, p.y - smooth.y) > DA.device.degToPx(Math.max(2, errDeg || 2) * 1.5, DA.device.distanceCm(40));
      var a = jump ? 0.6 : 0.2;
      smooth = { x: smooth.x + (p.x - smooth.x) * a, y: smooth.y + (p.y - smooth.y) * a };
    });
  }

  /** Current estimated gaze point (client px), or null. */
  function point() { return model && smooth ? { x: smooth.x, y: smooth.y } : null; }

  /** Show a dot, wait for the eyes to land, then average the features while it is looked at. */
  function collect(overlay, x, y) {
    return new Promise(function (resolve) {
      var dot = overlay.querySelector('.gz-dot');
      dot.style.left = x + 'px'; dot.style.top = y + 'px';
      dot.classList.remove('go'); void dot.offsetWidth; dot.classList.add('go');
      var got = [];
      setTimeout(function () {
        var iv = setInterval(function () { var f = features(); if (f) got.push(f); }, 60);
        setTimeout(function () {
          clearInterval(iv);
          if (got.length < 5) { resolve(null); return; }
          var med = function (k) { var a = got.map(function (g) { return g[k]; }).sort(function (p, q) { return p - q; }); return a[a.length >> 1]; };
          resolve({ h: med('h'), v: med('v'), yaw: med('yaw'), pitch: med('pitch'), x: x, y: y });
        }, 1000);
      }, 750);
    });
  }

  /**
   * Run the calibration. Resolves { ok, errDeg } — ok only when the check dots were close enough.
   */
  function calibrate() {
    var start = DA.eyes.state.running ? Promise.resolve(true) : DA.eyes.start();
    return start.then(function () {
      var ov = document.createElement('div');
      ov.className = 'gz-overlay';
      ov.innerHTML = '<p class="gz-text">' + T('מסתכלים על הנקודה בכל פעם שהיא מופיעה, בלי להזיז את הראש. זה לוקח כחצי דקה.') + '</p><div class="gz-dot"></div>' +
        '<button type="button" class="gz-stop">' + T('ביטול') + '</button>';
      document.body.appendChild(ov);
      var cancelled = false;
      ov.querySelector('.gz-stop').onclick = function () { cancelled = true; };
      var W = innerWidth, H = innerHeight;
      var learn = [[.1, .12], [.5, .12], [.9, .12], [.1, .5], [.5, .5], [.9, .5], [.1, .88], [.5, .88], [.9, .88]];
      var check = [[.3, .3], [.7, .3], [.3, .7], [.7, .7]];
      var pts = learn.concat(check).map(function (p) { return [p[0] * W, p[1] * H]; });
      var res = [];
      var chain = new Promise(function (r) { setTimeout(r, 1800); });   // time to read the instruction
      pts.forEach(function (p) {
        chain = chain.then(function () { return cancelled ? null : collect(ov, p[0], p[1]); }).then(function (s) { res.push(s); });
      });
      return chain.then(function () {
        ov.remove();
        if (cancelled) return { ok: false, cancelled: true };
        var L = res.slice(0, 9).filter(Boolean), C = res.slice(9).filter(Boolean);
        if (L.length < 7 || C.length < 3) return { ok: false, errDeg: null };
        var m = fit(L);
        if (!m) return { ok: false, errDeg: null };
        var e = DA.device.pxToDeg(meanError(m, C), DA.device.distanceCm(40));
        errDeg = Math.round(e * 10) / 10;
        model = e <= USABLE_DEG ? m : null;
        smooth = null;
        if (model) listen();
        return { ok: !!model, errDeg: errDeg };
      });
    });
  }

  function forget() { model = null; smooth = null; }

  DA.gaze = { calibrate: calibrate, point: point, ready: function () { return !!model; }, accuracy: function () { return errDeg; }, forget: forget, USABLE_DEG: USABLE_DEG };
  DA.gazeMath = { solve3: solve3, fit: fit, predict: predict, meanError: meanError };
})(typeof window !== 'undefined' ? window : globalThis);
