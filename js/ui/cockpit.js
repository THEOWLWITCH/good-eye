/*
 * עין טובה — Cockpit gauges: the reader's main settings shown as instrument dials.
 * Tapping a gauge opens the tuning drawer.
 */
(function (root) {
  'use strict';
  var DA = root.DA;
  var esc = DA.ui.esc;

  /** One semicircular dial. v: 0..1. */
  function dial(label, v, text, color) {
    v = Math.max(0, Math.min(1, v));
    var a = Math.PI * (1 - v), cx = 60, cy = 58, r = 44;
    var x = cx + r * Math.cos(a), y = cy - r * Math.sin(a);
    var nx = cx + (r - 10) * Math.cos(a), ny = cy - (r - 10) * Math.sin(a);
    var arc = 'M' + (cx - r) + ' ' + cy + ' A' + r + ' ' + r + ' 0 0 1 ' + x.toFixed(1) + ' ' + y.toFixed(1);
    var ticks = '';
    for (var i = 0; i <= 10; i++) {
      var t = Math.PI * (1 - i / 10), r1 = r + 6, r2 = r + (i % 5 ? 9 : 12);
      ticks += '<line x1="' + (cx + r1 * Math.cos(t)).toFixed(1) + '" y1="' + (cy - r1 * Math.sin(t)).toFixed(1) + '" x2="' + (cx + r2 * Math.cos(t)).toFixed(1) + '" y2="' + (cy - r2 * Math.sin(t)).toFixed(1) + '" class="tick"/>';
    }
    return '<button type="button" class="gauge" data-gauge>' +
      '<svg viewBox="0 0 120 78" aria-hidden="true">' + ticks +
      '<path d="M' + (cx - r) + ' ' + cy + ' A' + r + ' ' + r + ' 0 0 1 ' + (cx + r) + ' ' + cy + '" class="track"/>' +
      '<path d="' + arc + '" class="fill" style="stroke:' + color + '"/>' +
      '<line x1="' + cx + '" y1="' + cy + '" x2="' + nx.toFixed(1) + '" y2="' + ny.toFixed(1) + '" class="needle"/>' +
      '<circle cx="' + cx + '" cy="' + cy + '" r="5" class="hub"/></svg>' +
      '<span class="g-val">' + esc(text) + '</span><span class="g-label">' + esc(label) + '</span></button>';
  }

  function colorDial(label, theme) {
    return '<button type="button" class="gauge" data-gauge><span class="g-swatch" style="background:' + theme.bg + ';color:' + theme.fg + '">' + (DA.i18n.content === 'en' ? 'Ab' : T('אב')) + '</span>' +
      '<span class="g-val">' + esc(theme.label) + '</span><span class="g-label">' + esc(label) + '</span></button>';
  }

  function render(el, s, hasCal) {
    var t = DA.settings.theme(s.theme);
    el.innerHTML =
      dial(T('גודל אותיות'), (s.fontSize - 12) / 84, s.fontSize + 'px', '#38d6ff') +
      dial(T('ריווח'), s.letterSpacing / 0.4, Math.round(s.letterSpacing * 100) + '%', '#3ddc84') +
      dial(T('תיקון עיוות'), hasCal ? s.warpStrength / 1.5 : 0, hasCal ? Math.round(s.warpStrength * 100) + '%' : T('אין כיול'), '#ffb000') +
      dial(T('בהירות'), (s.brightness - 0.4) / 0.6, Math.round(s.brightness * 100) + '%', '#ff5fa2') +
      colorDial(T('צבעים'), t);
    el.querySelectorAll('[data-gauge]').forEach(function (b) { b.onclick = function () { DA.drawer.open(); }; });
  }

  DA.cockpit = { render: render };
})(typeof window !== 'undefined' ? window : globalThis);
