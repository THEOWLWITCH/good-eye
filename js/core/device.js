/*
 * עין טובה — Device geometry: real size of the screen (credit-card calibration) and conversion
 * between pixels, millimetres and visual angle, so tests can report sizes the way clinics do
 * (degrees, M-units, logMAR) instead of only pixels.
 */
(function (root) {
  'use strict';
  var DA = (root.DA = root.DA || {});
  var CARD_MM = 85.6;          // ISO/IEC 7810 ID-1 card width (credit card, ID card)
  var NOMINAL_PX_PER_MM = 96 / 25.4;
  var KEY = 'da.v1.device.pxPerMm';

  function deviceKey() {
    return root.screen ? (screen.width + 'x' + screen.height + '@' + (root.devicePixelRatio || 1)) : 'unknown';
  }

  function load() {
    try { var all = JSON.parse(localStorage.getItem(KEY) || '{}'); return all[deviceKey()] || null; } catch (e) { return null; }
  }
  function save(v) {
    try { var all = JSON.parse(localStorage.getItem(KEY) || '{}'); all[deviceKey()] = v; localStorage.setItem(KEY, JSON.stringify(all)); } catch (e) { /* ignore */ }
  }

  /** CSS pixels per millimetre on this screen (calibrated, or the nominal 96 dpi). */
  function pxPerMm() { var v = load(); return v ? v : NOMINAL_PX_PER_MM; }
  function isCalibrated() { return !!load(); }

  /** Viewing distance in cm: eye tracker if running, else the reader's stated distance, else 40. */
  function distanceCm(fallback) {
    var e = DA.eyes && DA.eyes.state;
    if (e && e.running && e.distanceCm) return e.distanceCm;
    return fallback || 40;
  }

  /** Pixels for a visual angle (degrees) at a distance (cm). */
  function degToPx(deg, distCm) { return Math.tan(deg * Math.PI / 180) * distCm * 10 * pxPerMm(); }
  function pxToDeg(px, distCm) { return Math.atan(px / pxPerMm() / (distCm * 10)) * 180 / Math.PI; }

  /**
   * Print size of a font (CSS px) as M-units and logMAR at a distance.
   * x-height ≈ 0.5 × font size (Latin; Hebrew letters are a little taller). 1M: x-height of
   * 1.454 mm at 1 m (5 arc-minutes).
   */
  function printSize(fontPx, distCm) {
    var xhMm = fontPx * 0.5 / pxPerMm();
    var m = xhMm / 1.454;                          // M-units (physical size)
    var arcmin = Math.atan(xhMm / (distCm * 10)) * 180 / Math.PI * 60;
    return { mUnits: Math.round(m * 100) / 100, logMAR: Math.round(Math.log10(arcmin / 5) * 100) / 100, xHeightMm: Math.round(xhMm * 10) / 10 };
  }

  /** Credit-card calibration dialog. Resolves true when saved. */
  function calibrate() {
    return new Promise(function (resolve) {
      var dlg = document.getElementById('cardDialog');
      var box = document.getElementById('cardBox'), slider = document.getElementById('cardSlider');
      var start = Math.round(CARD_MM * pxPerMm());
      slider.min = Math.round(start * 0.5); slider.max = Math.round(start * 1.8); slider.value = start;
      function upd() { box.style.width = slider.value + 'px'; box.style.height = Math.round(slider.value * 53.98 / 85.6) + 'px'; }
      slider.oninput = upd; upd();
      document.getElementById('cardMinus').onclick = function () { slider.value = +slider.value - 1; upd(); };
      document.getElementById('cardPlus').onclick = function () { slider.value = +slider.value + 1; upd(); };
      dlg.returnValue = '';
      dlg.onclose = function () {
        if (dlg.returnValue !== 'ok') { resolve(false); return; }
        save(+slider.value / CARD_MM);
        DA.ui.toast(T('גודל המסך נשמר במכשיר הזה'));
        resolve(true);
      };
      dlg.showModal();
    });
  }

  /** Font size (CSS px) whose x-height has a given logMAR at a distance (inverse of printSize). */
  function logmarToPx(L, distCm) {
    var arcmin = 5 * Math.pow(10, L);
    var xhMm = Math.tan(arcmin / 60 * Math.PI / 180) * distCm * 10;
    return xhMm / 0.5 * pxPerMm();
  }

  DA.device = { logmarToPx: logmarToPx, pxPerMm: pxPerMm, isCalibrated: isCalibrated, distanceCm: distanceCm, degToPx: degToPx, pxToDeg: pxToDeg, printSize: printSize, calibrate: calibrate, CARD_MM: CARD_MM };
})(typeof window !== 'undefined' ? window : globalThis);
