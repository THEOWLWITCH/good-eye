/*
 * DA — The Lens: shows any content (text, pictures, math, photos) through the reader's settings.
 *
 * - Typography and colours are applied with CSS variables.
 * - Geometric pre-distortion (from the grid calibration) and sharpening are applied with an SVG
 *   filter on the fixed viewport element, so everything inside — including scrolled text — is
 *   corrected according to its position on the screen (the visual field), not in the document.
 *
 * Warp math: the user made the displayed grid P(x) look straight, so content must be displayed as
 * D(y) = C(P⁻¹(y)). feDisplacementMap samples   out(y) = in(y + s·(map(y) − ½)),
 * so map(y) encodes P⁻¹(y) − y. The calibration square is mapped onto the largest centred square
 * of the viewport.
 */
(function (root) {
  'use strict';
  var DA = (root.DA = root.DA || {});
  var SVGNS = 'http://www.w3.org/2000/svg';
  var MAP_N = 128;
  var WARP_MARGIN = 0.25;   // the map extends a quarter of the calibration square beyond each side
  var counter = 0;
  var defs = null;

  function ensureDefs() {
    if (defs) return defs;
    var svg = document.createElementNS(SVGNS, 'svg');
    svg.setAttribute('width', '0'); svg.setAttribute('height', '0');
    svg.setAttribute('aria-hidden', 'true');
    svg.style.position = 'absolute';
    defs = document.createElementNS(SVGNS, 'defs');
    svg.appendChild(defs);
    document.body.appendChild(svg);
    return defs;
  }

  function Lens(el) {
    this.el = el;
    this.id = 'daLens' + (++counter);
    el.classList.add('lens');
    this.content = el.querySelector('.lens-content') || el;
    this.ruler = document.createElement('div');
    this.ruler.className = 'lens-ruler';
    el.appendChild(this.ruler);
    this.rulerY = 0.3;
    this.settings = DA.settings.normalize({});
    this.ops = null;
    this._mapKey = '';
    var self = this;
    if (typeof ResizeObserver !== 'undefined') new ResizeObserver(function () { self._updateFilter(); self._placeRuler(); }).observe(el);
    el.addEventListener('pointermove', function (e) {
      if (self.settings.ruler === 'off' || e.pointerType !== 'mouse') return;
      self.moveRulerTo(e.clientY);
    });
    el.addEventListener('pointerdown', function (e) {
      if (self.settings.ruler === 'off') return;
      self.moveRulerTo(e.clientY);
    });
  }

  /** Apply settings. `ops` = the calibration's deformation ops (or null). */
  Lens.prototype.apply = function (settings, ops) {
    var s = this.settings = DA.settings.normalize(settings);
    // `ops` is either a plain ops array (legacy) or { ops, sizePx, fix, scale } from ctx.warpFor()
    var w = ops && !Array.isArray(ops) ? ops : null;
    this.ops = w ? w.ops : (ops || null);
    this.warpSize = w && w.sizePx ? w.sizePx * (w.scale || 1) : null;   // px of the calibration grid on this screen
    this.warpFix = w && w.fix ? w.fix : [0.5, 0.5];                     // where the eye looked during calibration (0..1)
    var t = DA.settings.theme(s.theme), st = this.el.style;
    st.setProperty('--fg', t.fg);
    st.setProperty('--bg', t.bg);
    st.setProperty('--font', DA.settings.font(s.font).family);
    st.setProperty('--fs', s.fontSize + 'px');
    st.setProperty('--fw', s.bold ? '700' : '400');
    st.setProperty('--ls', s.letterSpacing + 'em');
    st.setProperty('--ws', s.wordSpacing + 'em');
    st.setProperty('--lh', String(s.lineHeight));
    st.setProperty('--lc', s.lineChars + 'ch');
    st.setProperty('--imgc', String(s.imageContrast));
    st.setProperty('--inv', s.imageInvert && t.reversed ? '1' : '0');
    st.setProperty('--zoom', String(s.zoom));
    this.el.classList.toggle('line-marker', !!s.lineMarker);
    this.el.classList.toggle('line-marker-end', !!s.lineMarkerEnd);
    this.el.classList.toggle('reversed', !!t.reversed);
    // calm mode: softer text contrast and more air between lines
    this.el.classList.toggle('calm', !!s.calm);
    if (s.calm) st.setProperty('--lh', String(Math.max(s.lineHeight, 1.8)));
    // colour-vision help applies to pictures, photos, pages and drawings
    this.el.classList.remove('cvd-protan', 'cvd-deutan', 'cvd-tritan');
    if (s.cvd && s.cvd !== 'none') { ensureCvdFilters(); this.el.classList.add('cvd-' + s.cvd); }
    this.content.style.transform = (s.shiftX || s.shiftY)
      ? 'translate(' + (s.shiftX * 100) + '%, ' + (s.shiftY * 100) + '%)' : '';
    this.ruler.className = 'lens-ruler ' + (s.ruler === 'off' ? '' : 'on ' + s.ruler);
    this._placeRuler();
    this._updateFilter();
  };

  Lens.prototype.moveRulerTo = function (clientY) {
    var r = this.el.getBoundingClientRect();
    this.rulerY = Math.min(0.98, Math.max(0.02, (clientY - r.top) / r.height));
    this._placeRuler();
  };
  Lens.prototype.moveRuler = function (dir) {
    var r = this.el.getBoundingClientRect();
    var step = this.settings.fontSize * this.settings.lineHeight / Math.max(1, r.height);
    this.rulerY = Math.min(0.98, Math.max(0.02, this.rulerY + dir * step));
    this._placeRuler();
  };
  Lens.prototype._placeRuler = function () {
    var h = this.settings.fontSize * this.settings.lineHeight * 1.05;
    this.ruler.style.height = h + 'px';
    this.ruler.style.top = 'calc(' + (this.rulerY * 100) + '% - ' + h / 2 + 'px)';
  };

  /**
   * Where the eye is looking, in lens-local px (null: the middle of the lens). The correction is
   * centred there, so the calibration's fixation point lands on the point being looked at.
   * Moving the anchor only moves the map image: no recomputation.
   */
  Lens.prototype.setWarpAnchor = function (x, y) {
    this.anchor = x == null ? null : [x, y];
    if (!this._warpImg || !this._patch) return;
    var o = this._patchOrigin();
    this._warpImg.setAttribute('x', String(Math.round(o[0])));
    this._warpImg.setAttribute('y', String(Math.round(o[1])));
  };
  /** Anchor from screen (client) coordinates. */
  Lens.prototype.setWarpAnchorClient = function (cx, cy) {
    if (cx == null) { this.setWarpAnchor(null); return; }
    var r = this.el.getBoundingClientRect();
    this.setWarpAnchor(cx - r.left, cy - r.top);
  };
  Lens.prototype._patchOrigin = function () {
    var w = this.el.clientWidth, h = this.el.clientHeight, P = this._patch.size, m = WARP_MARGIN;
    var a = this.anchor || [w / 2, h / 2];
    return [a[0] - (this.warpFix[0] + m) * P, a[1] - (this.warpFix[1] + m) * P];
  };

  // ---------- SVG filter: sharpen + warp ----------
  Lens.prototype._updateFilter = function () {
    var s = this.settings;
    var w = this.el.clientWidth, h = this.el.clientHeight;
    var useWarp = this.ops && this.ops.length && s.warpStrength > 0 && w > 0 && h > 0;
    var useSharp = s.sharpen > 0.01;
    var comfort = comfortFilter(s);
    this._warpImg = null; this._patch = null;
    if (!useWarp && !useSharp) { this.el.style.filter = comfort; return; }

    var d = ensureDefs();
    var f = document.getElementById(this.id);
    if (!f) {
      f = document.createElementNS(SVGNS, 'filter');
      f.setAttribute('id', this.id);
      d.appendChild(f);
    }
    f.setAttribute('filterUnits', 'userSpaceOnUse');
    f.setAttribute('primitiveUnits', 'userSpaceOnUse');
    f.setAttribute('color-interpolation-filters', 'sRGB');
    f.setAttribute('x', '0'); f.setAttribute('y', '0');
    f.setAttribute('width', String(w)); f.setAttribute('height', String(h));
    while (f.firstChild) f.removeChild(f.firstChild);

    var input = 'SourceGraphic';
    if (useSharp) {
      var a = s.sharpen * 0.6;
      var cm = document.createElementNS(SVGNS, 'feConvolveMatrix');
      cm.setAttribute('order', '3');
      cm.setAttribute('kernelMatrix', [0, -a, 0, -a, 1 + 4 * a, -a, 0, -a, 0].join(' '));
      cm.setAttribute('preserveAlpha', 'true');
      cm.setAttribute('edgeMode', 'duplicate');
      cm.setAttribute('in', input);
      cm.setAttribute('result', 'sharp');
      f.appendChild(cm);
      input = 'sharp';
    }
    if (useWarp) {
      // the patch: the calibration square (plus a margin) at its real size, placed around the anchor;
      // outside it a neutral flood means "no displacement"
      var P = this.warpSize || Math.min(w, h);
      var m = this._warpMap(P);
      this._patch = { size: P };
      var full = P * (1 + 2 * WARP_MARGIN), o = this._patchOrigin();
      var fl = document.createElementNS(SVGNS, 'feFlood');
      fl.setAttribute('flood-color', 'rgb(128,128,128)');
      fl.setAttribute('x', '0'); fl.setAttribute('y', '0');
      fl.setAttribute('width', String(w)); fl.setAttribute('height', String(h));
      fl.setAttribute('result', 'neutral');
      f.appendChild(fl);
      var img = document.createElementNS(SVGNS, 'feImage');
      img.setAttribute('href', m.url);
      img.setAttributeNS('http://www.w3.org/1999/xlink', 'xlink:href', m.url);
      img.setAttribute('x', String(Math.round(o[0]))); img.setAttribute('y', String(Math.round(o[1])));
      img.setAttribute('width', String(Math.round(full))); img.setAttribute('height', String(Math.round(full)));
      img.setAttribute('preserveAspectRatio', 'none');
      img.setAttribute('result', 'patch');
      f.appendChild(img);
      this._warpImg = img;
      var comp = document.createElementNS(SVGNS, 'feComposite');
      comp.setAttribute('in', 'patch'); comp.setAttribute('in2', 'neutral'); comp.setAttribute('operator', 'over');
      comp.setAttribute('x', '0'); comp.setAttribute('y', '0');
      comp.setAttribute('width', String(w)); comp.setAttribute('height', String(h));
      comp.setAttribute('result', 'map');
      f.appendChild(comp);
      var dm = document.createElementNS(SVGNS, 'feDisplacementMap');
      dm.setAttribute('in', input);
      dm.setAttribute('in2', 'map');
      dm.setAttribute('scale', String(m.scale));
      dm.setAttribute('xChannelSelector', 'R');
      dm.setAttribute('yChannelSelector', 'G');
      f.appendChild(dm);
    }
    this.el.style.filter = 'url(#' + this.id + ')' + (comfort ? ' ' + comfort : '');
  };

  /**
   * Displacement map (data URL) for the calibration square of P px plus a margin on each side
   * (normalized −m … 1+m). Cached per ops/strength/size.
   */
  Lens.prototype._warpMap = function (P) {
    var k = this.settings.warpStrength;
    var key = JSON.stringify(this.ops) + '|' + k + '|' + Math.round(P);
    if (key === this._mapKey) return this._map;
    var ops = this.ops.map(function (o) { return { ax: o.ax, ay: o.ay, dx: o.dx * k, dy: o.dy * k, r: o.r }; });
    var Q = P, mg = WARP_MARGIN, span = 1 + 2 * mg;
    var nx = MAP_N, ny = MAP_N;
    var dxs = new Float32Array(nx * ny), dys = new Float32Array(nx * ny), maxAbs = 0.5;
    for (var j = 0; j < ny; j++) {
      for (var i = 0; i < nx; i++) {
        var u = -mg + (i + 0.5) / nx * span, v = -mg + (j + 0.5) / ny * span;
        var inv = DA.deformation.invert(ops, u, v, 20);
        var ddx = (inv[0] - u) * Q, ddy = (inv[1] - v) * Q;
        dxs[j * nx + i] = ddx; dys[j * nx + i] = ddy;
        maxAbs = Math.max(maxAbs, Math.abs(ddx), Math.abs(ddy));
      }
    }
    var scale = 2 * maxAbs * 1.02;
    var c = document.createElement('canvas');
    c.width = nx; c.height = ny;
    var ctx = c.getContext('2d'), im = ctx.createImageData(nx, ny);
    for (var p = 0; p < nx * ny; p++) {
      im.data[p * 4] = Math.round((dxs[p] / scale + 0.5) * 255);
      im.data[p * 4 + 1] = Math.round((dys[p] / scale + 0.5) * 255);
      im.data[p * 4 + 2] = 128;
      im.data[p * 4 + 3] = 255;
    }
    ctx.putImageData(im, 0, 0);
    this._map = { url: c.toDataURL('image/png'), scale: scale };
    this._mapKey = key;
    return this._map;
  };

  /** Dimming and warm light as CSS filters (applied after the SVG warp/sharpen filter). */
  function comfortFilter(s) {
    var f = [];
    if (s.brightness < 0.99) f.push('brightness(' + s.brightness.toFixed(2) + ')');
    if (s.warmth > 0.01) f.push('sepia(' + (s.warmth * 0.55).toFixed(2) + ')', 'saturate(' + (1 + s.warmth * 0.3).toFixed(2) + ')');
    return f.join(' ');
  }

  // ---------- colour-vision deficiency help ("daltonize") ----------
  // Simulation matrices of Machado, Oliveira & Fernandes (2009), severity 1.0, for LINEAR RGB
  // (the SVG filter runs in linearRGB), and the error-shift matrix of Fidaner et al.: colours a
  // person cannot tell apart are shifted into channels they can see.
  var CVD_SIM = {
    protan: [[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]],
    deutan: [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.011820, 0.042940, 0.968881]],
    tritan: [[1.255528, -0.076749, -0.178779], [-0.078411, 0.930809, 0.147602], [0.004733, 0.691367, 0.303900]]
  };
  var CVD_SHIFT = {
    protan: [[0, 0, 0], [0.7, 1, 0], [0.7, 0, 1]],
    deutan: [[0, 0, 0], [0.7, 1, 0], [0.7, 0, 1]],
    tritan: [[1, 0, 0.7], [0, 1, 0.7], [0, 0, 0]]
  };
  /** D = I + E·(I − S): one linear colour matrix per deficiency. */
  function daltonizeMatrix(type) {
    var S = CVD_SIM[type], E = CVD_SHIFT[type], D = [];
    for (var r = 0; r < 3; r++) {
      D.push([]);
      for (var c = 0; c < 3; c++) {
        var v = r === c ? 1 : 0;
        for (var k = 0; k < 3; k++) v += E[r][k] * ((k === c ? 1 : 0) - S[k][c]);
        D[r].push(Math.round(v * 1000) / 1000);
      }
    }
    return D;
  }
  var cvdReady = false;
  function ensureCvdFilters() {
    if (cvdReady) return;
    cvdReady = true;
    var d = ensureDefs();
    ['protan', 'deutan', 'tritan'].forEach(function (type) {
      var M = daltonizeMatrix(type);
      var f = document.createElementNS(SVGNS, 'filter');
      f.setAttribute('id', 'daCvd-' + type);
      f.setAttribute('color-interpolation-filters', 'linearRGB');
      var cm = document.createElementNS(SVGNS, 'feColorMatrix');
      cm.setAttribute('type', 'matrix');
      cm.setAttribute('values', [M[0].concat([0, 0]), M[1].concat([0, 0]), M[2].concat([0, 0]), [0, 0, 0, 1, 0]].map(function (r) { return r.join(' '); }).join(' '));
      f.appendChild(cm);
      d.appendChild(f);
    });
  }

  DA.Lens = Lens;
  DA.daltonizeMatrix = daltonizeMatrix;
})(typeof window !== 'undefined' ? window : globalThis);
