/*
 * DA — Instrument 4.1: Flexible line grid (רשת קווים גמישה).
 *
 * Renders a straight grid, lets the user grab any point on any line and drag it.
 * A drag becomes a local smooth deformation op (see engine/deformation.js).
 * The instrument does not own history or storage: it reports finished drags through
 * onCommit(op, record) and the app decides what to do with them (modularity, spec §2).
 */
(function (root) {
  'use strict';
  var DA = (root.DA = root.DA || {});
  var DEF = DA.deformation;

  var MARGIN = 0.08;           // grid occupies [MARGIN, 1-MARGIN] of the stimulus square
  var SAMPLES = 161;           // points per line (smoothness of the drawn curve)
  var HIT_PX = { mouse: 10, pen: 10, touch: 22 };

  var DEFAULTS = {
    density: 7,
    mode: 'both',              // both | h | v | single
    singleOrient: 'h',
    singleIndex: 3,
    radius: 0.15,              // influence radius, normalized to stimulus size
    lineWidth: 2,
    showOriginal: false,
    showControls: true,
    clamp: true,               // prevent folds by limiting drag length relative to radius
    dark: false,               // false: black lines on white; true: white lines on black
    fixation: false
  };

  function GridInstrument(canvas, opts) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.settings = Object.assign({}, DEFAULTS, (opts && opts.settings) || {});
    this.ops = [];
    this.compareOps = null;
    this.live = null;          // op being dragged
    this.hover = null;
    this.onCommit = (opts && opts.onCommit) || function () {};
    this.onLive = (opts && opts.onLive) || function () {};
    this.S = 100; this.ox = 0; this.oy = 0;
    this._bind();
    this.resize();
  }

  GridInstrument.DEFAULTS = DEFAULTS;
  GridInstrument.MARGIN = MARGIN;

  GridInstrument.prototype.setOps = function (ops) { this.ops = ops || []; this.render(); };
  GridInstrument.prototype.setCompare = function (ops) { this.compareOps = ops; this.render(); };
  GridInstrument.prototype.setSettings = function (patch) {
    Object.assign(this.settings, patch);
    var n = this.settings.density;
    if (this.settings.singleIndex > n - 1) this.settings.singleIndex = n - 1;
    this.render();
  };

  // ---------- geometry ----------
  function linePositions(n) {
    var out = [];
    for (var i = 0; i < n; i++) out.push(MARGIN + (i * (1 - 2 * MARGIN)) / (n - 1));
    return out;
  }

  /** Original (undeformed) lines, filtered by the display mode. */
  GridInstrument.prototype.originalLines = function (all) {
    var s = this.settings, pos = linePositions(s.density), lines = [];
    var showH = all || s.mode === 'both' || s.mode === 'h';
    var showV = all || s.mode === 'both' || s.mode === 'v';
    for (var i = 0; i < pos.length; i++) {
      var single = !all && s.mode === 'single' && s.singleIndex === i;
      if (showH || (single && s.singleOrient === 'h')) lines.push(makeLine('h', i, pos[i]));
      if (showV || (single && s.singleOrient === 'v')) lines.push(makeLine('v', i, pos[i]));
    }
    return lines;
  };

  function makeLine(orient, index, c) {
    var pts = [];
    for (var k = 0; k < SAMPLES; k++) {
      var u = MARGIN + (k * (1 - 2 * MARGIN)) / (SAMPLES - 1);
      pts.push(orient === 'h' ? [u, c] : [c, u]);
    }
    return { id: orient + index, orient: orient, index: index, points: pts };
  }

  GridInstrument.prototype.currentOps = function () {
    return this.live ? this.ops.concat([this.live]) : this.ops;
  };

  /** Deformed geometry of all lines at current density (saved as "final geometry"). */
  GridInstrument.prototype.correctedGeometry = function (step) {
    step = step || 4;
    var ops = this.ops;
    return this.originalLines(true).map(function (L) {
      var pts = [];
      for (var k = 0; k < L.points.length; k += step) {
        var p = DEF.apply(ops, L.points[k][0], L.points[k][1]);
        pts.push([r6(p[0]), r6(p[1])]);
      }
      return { id: L.id, points: pts };
    });
  };

  function r6(v) { return Math.round(v * 1e6) / 1e6; }

  // ---------- layout ----------
  GridInstrument.prototype.resize = function () {
    var c = this.canvas, parent = c.parentElement;
    var w = parent.clientWidth, h = parent.clientHeight;
    var dpr = window.devicePixelRatio || 1;
    c.width = Math.round(w * dpr); c.height = Math.round(h * dpr);
    c.style.width = w + 'px'; c.style.height = h + 'px';
    this.dpr = dpr;
    this.S = Math.max(50, Math.floor(Math.min(w, h) - 16));
    this.ox = Math.floor((w - this.S) / 2);
    this.oy = Math.floor((h - this.S) / 2);
    this.render();
  };

  GridInstrument.prototype.toNorm = function (clientX, clientY) {
    var r = this.canvas.getBoundingClientRect();
    return [(clientX - r.left - this.ox) / this.S, (clientY - r.top - this.oy) / this.S];
  };

  // ---------- hit testing ----------
  GridInstrument.prototype.hitTest = function (nx, ny, pointerType) {
    var tol = (HIT_PX[pointerType] || 10) / this.S;
    var ops = this.ops, best = null, bestD = tol;
    var lines = this.originalLines(false);
    for (var li = 0; li < lines.length; li++) {
      var L = lines[li];
      var D = DEF.applyToPolyline(ops, L.points);
      for (var k = 0; k < D.length - 1; k++) {
        var ax = D[k][0], ay = D[k][1], bx = D[k + 1][0], by = D[k + 1][1];
        var vx = bx - ax, vy = by - ay, len2 = vx * vx + vy * vy;
        var u = len2 > 0 ? ((nx - ax) * vx + (ny - ay) * vy) / len2 : 0;
        u = u < 0 ? 0 : u > 1 ? 1 : u;
        var px = ax + u * vx, py = ay + u * vy;
        var d = Math.hypot(nx - px, ny - py);
        if (d < bestD) {
          bestD = d;
          var o0 = L.points[k], o1 = L.points[k + 1];
          best = {
            lineId: L.id, x: px, y: py,
            original: { x: o0[0] + u * (o1[0] - o0[0]), y: o0[1] + u * (o1[1] - o0[1]) },
            param: (k + u) / (L.points.length - 1)
          };
        }
      }
    }
    return best;
  };

  // ---------- pointer interaction (mouse, touch, pen) ----------
  GridInstrument.prototype._bind = function () {
    var self = this, c = this.canvas;
    c.style.touchAction = 'none';

    c.addEventListener('pointerdown', function (e) {
      if (e.button !== 0 && e.pointerType === 'mouse') return;
      var n = self.toNorm(e.clientX, e.clientY);
      var hit = self.hitTest(n[0], n[1], e.pointerType);
      if (!hit) return;
      e.preventDefault();
      c.setPointerCapture(e.pointerId);
      self.drag = { id: e.pointerId, hit: hit, start: n, t0: performance.now(), pointerType: e.pointerType, clamped: false };
      self.live = { ax: hit.x, ay: hit.y, dx: 0, dy: 0, r: self.settings.radius };
      c.style.cursor = 'grabbing';
      self.render();
      self.onLive(self.live, false);
    });

    c.addEventListener('pointermove', function (e) {
      var n = self.toNorm(e.clientX, e.clientY);
      if (self.drag && e.pointerId === self.drag.id) {
        var dx = n[0] - self.drag.start[0], dy = n[1] - self.drag.start[1];
        var clamped = false;
        if (self.settings.clamp) {
          var cl = DEF.clampDelta(dx, dy, self.live.r);
          dx = cl.dx; dy = cl.dy; clamped = cl.clamped;
        }
        self.drag.clamped = self.drag.clamped || clamped;
        self.live.dx = dx; self.live.dy = dy;
        self.render();
        self.onLive(self.live, clamped);
        return;
      }
      self.hover = self.hitTest(n[0], n[1], e.pointerType);
      c.style.cursor = self.hover ? 'grab' : 'crosshair';
      self.render();
    });

    function end(e, cancel) {
      if (!self.drag || e.pointerId !== self.drag.id) return;
      var d = self.drag, op = self.live;
      self.drag = null; self.live = null;
      c.style.cursor = 'grab';
      var minMove = 0.5 / self.S;
      if (!cancel && Math.hypot(op.dx, op.dy) >= minMove) {
        var s = self.settings;
        var record = {
          type: 'drag',
          lineId: d.hit.lineId,
          lineParam: r6(d.hit.param),
          original: { x: r6(d.hit.original.x), y: r6(d.hit.original.y) },
          from: { x: r6(op.ax), y: r6(op.ay) },
          to: { x: r6(op.ax + op.dx), y: r6(op.ay + op.dy) },
          dx: r6(op.dx), dy: r6(op.dy),
          distance: r6(Math.hypot(op.dx, op.dy)),
          directionDeg: Math.round((Math.atan2(op.dy, op.dx) * 180) / Math.PI * 10) / 10, // 0°=right, 90°=down (screen)
          radius: r6(op.r),
          gridDensity: s.density,
          displayMode: s.mode === 'single' ? 'single:' + s.singleOrient + s.singleIndex : s.mode,
          clamped: d.clamped,
          durationMs: Math.round(performance.now() - d.t0),
          pointerType: d.pointerType
        };
        self.onCommit({ ax: r6(op.ax), ay: r6(op.ay), dx: r6(op.dx), dy: r6(op.dy), r: r6(op.r) }, record);
      }
      self.render();
      self.onLive(null, false);
    }
    c.addEventListener('pointerup', function (e) { end(e, false); });
    c.addEventListener('pointercancel', function (e) { end(e, true); });
    c.addEventListener('pointerleave', function () { if (!self.drag) { self.hover = null; self.render(); } });
  };

  // ---------- rendering ----------
  GridInstrument.prototype.render = function () {
    var ctx = this.ctx, s = this.settings, S = this.S, dpr = this.dpr || 1;
    var fg = s.dark ? '#ffffff' : '#000000';
    var bg = s.dark ? '#000000' : '#ffffff';
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.setTransform(dpr, 0, 0, dpr, dpr * this.ox, dpr * this.oy);

    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, S, S);
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';

    var lines = this.originalLines(false);
    var self = this;

    if (s.showOriginal) {
      ctx.strokeStyle = s.dark ? 'rgba(255,255,255,0.22)' : 'rgba(0,0,0,0.16)';
      ctx.lineWidth = Math.max(1, s.lineWidth * 0.6);
      lines.forEach(function (L) { self._poly(L.points); });
    }

    if (this.compareOps) {
      ctx.strokeStyle = 'rgba(0,110,255,0.6)';
      ctx.lineWidth = Math.max(1, s.lineWidth * 0.8);
      var cops = this.compareOps;
      lines.forEach(function (L) { self._poly(DEF.applyToPolyline(cops, L.points)); });
    }

    var ops = this.currentOps();
    ctx.strokeStyle = fg;
    ctx.lineWidth = s.lineWidth;
    lines.forEach(function (L) { self._poly(DEF.applyToPolyline(ops, L.points)); });

    if (s.fixation) {
      ctx.fillStyle = '#e00000';
      ctx.beginPath(); ctx.arc(S / 2, S / 2, 4, 0, Math.PI * 2); ctx.fill();
    }

    if (s.showControls) {
      for (var i = 0; i < this.ops.length; i++) {
        var op = this.ops[i];
        var p = DEF.apply(this.ops.slice(i + 1), op.ax + op.dx, op.ay + op.dy);
        ctx.fillStyle = 'rgba(255,140,0,0.85)';
        ctx.beginPath(); ctx.arc(p[0] * S, p[1] * S, 3.5, 0, Math.PI * 2); ctx.fill();
      }
    }

    // live drag or hover: control point + influence radius
    var focus = this.live ? { x: this.live.ax + this.live.dx, y: this.live.ay + this.live.dy, r: this.live.r }
      : this.hover ? { x: this.hover.x, y: this.hover.y, r: s.radius } : null;
    if (focus) {
      var danger = this.live && DEF.opMinDetBound(this.live) <= 0;
      ctx.strokeStyle = danger ? 'rgba(220,0,0,0.8)' : 'rgba(0,150,90,0.55)';
      ctx.lineWidth = 1;
      ctx.setLineDash([5, 4]);
      ctx.beginPath(); ctx.arc(focus.x * S, focus.y * S, focus.r * S, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = danger ? '#d00000' : '#00a060';
      ctx.beginPath(); ctx.arc(focus.x * S, focus.y * S, 5, 0, Math.PI * 2); ctx.fill();
    }

    ctx.strokeStyle = s.dark ? '#333' : '#ccc';
    ctx.lineWidth = 1;
    ctx.strokeRect(0.5, 0.5, S - 1, S - 1);
  };

  GridInstrument.prototype._poly = function (pts) {
    var ctx = this.ctx, S = this.S;
    ctx.beginPath();
    ctx.moveTo(pts[0][0] * S, pts[0][1] * S);
    for (var k = 1; k < pts.length; k++) ctx.lineTo(pts[k][0] * S, pts[k][1] * S);
    ctx.stroke();
  };

  DA.GridInstrument = GridInstrument;
})(typeof window !== 'undefined' ? window : globalThis);
