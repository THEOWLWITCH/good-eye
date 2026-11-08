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
  var MAP_N = 112;
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
    this.ops = ops || null;
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
    this.el.classList.toggle('reversed', !!t.reversed);
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

  // ---------- SVG filter: sharpen + warp ----------
  Lens.prototype._updateFilter = function () {
    var s = this.settings;
    var w = this.el.clientWidth, h = this.el.clientHeight;
    var useWarp = this.ops && this.ops.length && s.warpStrength > 0 && w > 0 && h > 0;
    var useSharp = s.sharpen > 0.01;
    if (!useWarp && !useSharp) { this.el.style.filter = ''; return; }

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
      var m = this._warpMap(w, h);
      var img = document.createElementNS(SVGNS, 'feImage');
      img.setAttribute('href', m.url);
      img.setAttributeNS('http://www.w3.org/1999/xlink', 'xlink:href', m.url);
      img.setAttribute('x', '0'); img.setAttribute('y', '0');
      img.setAttribute('width', String(w)); img.setAttribute('height', String(h));
      img.setAttribute('preserveAspectRatio', 'none');
      img.setAttribute('result', 'map');
      f.appendChild(img);
      var dm = document.createElementNS(SVGNS, 'feDisplacementMap');
      dm.setAttribute('in', input);
      dm.setAttribute('in2', 'map');
      dm.setAttribute('scale', String(m.scale));
      dm.setAttribute('xChannelSelector', 'R');
      dm.setAttribute('yChannelSelector', 'G');
      f.appendChild(dm);
    }
    this.el.style.filter = 'url(#' + this.id + ')';
  };

  /** Displacement map (data URL) for a w×h viewport. Cached per ops/strength/size. */
  Lens.prototype._warpMap = function (w, h) {
    var k = this.settings.warpStrength;
    var key = JSON.stringify(this.ops) + '|' + k + '|' + w + 'x' + h;
    if (key === this._mapKey) return this._map;
    var ops = this.ops.map(function (o) { return { ax: o.ax, ay: o.ay, dx: o.dx * k, dy: o.dy * k, r: o.r }; });
    var Q = Math.min(w, h), ox = (w - Q) / 2, oy = (h - Q) / 2;
    var nx = MAP_N, ny = MAP_N;
    var dxs = new Float32Array(nx * ny), dys = new Float32Array(nx * ny), maxAbs = 0.5;
    for (var j = 0; j < ny; j++) {
      for (var i = 0; i < nx; i++) {
        var px = (i + 0.5) / nx * w, py = (j + 0.5) / ny * h;
        var u = (px - ox) / Q, v = (py - oy) / Q;
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

  DA.Lens = Lens;
})(typeof window !== 'undefined' ? window : globalThis);
