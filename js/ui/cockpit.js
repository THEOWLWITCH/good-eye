/*
 * עין טובה — Instrument panel: the reader's main settings as ring gauges with an icon inside.
 * Tapping a gauge opens fine tuning.
 */
(function (root) {
  'use strict';
  var DA = root.DA;
  var esc = DA.ui.esc;

  function ring(icon, label, v, text, color) {
    v = Math.max(0, Math.min(1, v));
    var r = 30, c = 2 * Math.PI * r;
    return '<button type="button" class="gauge2" data-gauge style="--g:' + color + '">' +
      '<span class="g2-ring"><svg viewBox="0 0 72 72" aria-hidden="true">' +
      '<circle cx="36" cy="36" r="' + r + '" class="g2-track"/>' +
      '<circle cx="36" cy="36" r="' + r + '" class="g2-fill" stroke-dasharray="' + (c * v).toFixed(1) + ' ' + c.toFixed(1) + '" transform="rotate(-90 36 36)"/>' +
      '</svg><span class="g2-icon">' + DA.icons.svg(icon) + '</span></span>' +
      '<span class="g2-val">' + esc(text) + '</span><span class="g2-label">' + esc(label) + '</span></button>';
  }

  function colorChip(label, theme) {
    return '<button type="button" class="gauge2" data-gauge style="--g:#c9b8ff">' +
      '<span class="g2-ring"><span class="g2-swatch" style="background:' + theme.bg + ';color:' + theme.fg + '">' + (DA.i18n.content === 'en' ? 'Ab' : T('אב')) + '</span></span>' +
      '<span class="g2-val">' + esc(theme.label) + '</span><span class="g2-label">' + esc(label) + '</span></button>';
  }

  function render(el, s, hasCal) {
    var t = DA.settings.theme(s.theme);
    el.innerHTML =
      ring('text', T('גודל אותיות'), (s.fontSize - 12) / 84, s.fontSize + 'px', '#8fe9ff') +
      ring('spacing', T('ריווח'), s.letterSpacing / 0.4, Math.round(s.letterSpacing * 100) + '%', '#b3a6ff') +
      ring('grid', T('תיקון עיוות'), hasCal ? s.warpStrength / 1.5 : 0, hasCal ? Math.round(s.warpStrength * 100) + '%' : T('אין כיול'), '#ffd59a') +
      ring('sun', T('בהירות'), (s.brightness - 0.4) / 0.6, Math.round(s.brightness * 100) + '%', '#ff9fc8') +
      colorChip(T('צבעים'), t);
    el.querySelectorAll('[data-gauge]').forEach(function (b) { b.onclick = function () { DA.drawer.open(); }; });
  }

  DA.cockpit = { render: render };
})(typeof window !== 'undefined' ? window : globalThis);
