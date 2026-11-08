/*
 * עין טובה — A small set of line icons (24×24, stroke = currentColor), drawn for this app so they
 * work everywhere without loading a font. Usage: <i data-icon="book"></i> → DA.icons.apply(root)
 */
(function (root) {
  'use strict';
  var DA = (root.DA = root.DA || {});
  var P = {
    book: '<path d="M2 5.5C4.5 4 8 4 12 6c4-2 7.5-2 10-.5V19c-2.5-1.5-6-1.5-10 .5C8 17.5 4.5 17.5 2 19z"/><path d="M12 6v13.5"/>',
    eye: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    camera: '<path d="M3 8a2 2 0 0 1 2-2h2.2l1.6-2h6.4l1.6 2H19a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><circle cx="12" cy="13" r="3.6"/>',
    game: '<rect x="2" y="7" width="20" height="11" rx="5.5"/><path d="M7 11v3M5.5 12.5h3"/><circle cx="15.5" cy="11.5" r=".9"/><circle cx="17.5" cy="13.8" r=".9"/>',
    target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.3"/>',
    grid: '<rect x="3" y="3" width="18" height="18" rx="3"/><path d="M3 9h18M3 15h18M9 3v18M15 3v18"/>',
    scan: '<path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2"/><circle cx="12" cy="12" r="3"/>',
    sliders: '<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>',
    timer: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2.5M9.5 2h5"/>',
    map: '<path d="M3 6.5 9 4l6 2.5L21 4v13.5L15 20l-6-2.5L3 20z"/><path d="M9 4v13.5M15 6.5V20"/>',
    ruler: '<path d="M3 17 17 3l4 4L7 21z"/><path d="M7 13l2 2M10 10l2 2M13 7l2 2"/>',
    flask: '<path d="M9 3h6M10 3v6L4.5 18.5A1.7 1.7 0 0 0 6 21h12a1.7 1.7 0 0 0 1.5-2.5L14 9V3"/><path d="M7 15h10"/>',
    chart: '<path d="M3 3v18h18"/><path d="M7 15l4-4 3 3 5-6"/>',
    star: '<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/>',
    pin: '<path d="M9 4h6l-1 5 3 3H7l3-3z"/><path d="M12 12v8"/>',
    plane: '<path d="M10.5 13.5 3 11l1.5-1.5 8 1L17 6c1.2-1.2 2.8-1.6 3.5-.9s.3 2.3-.9 3.5l-4.5 4.5 1 8L14.5 22l-2.5-7.5-3 3V20l-2 1-1-3.5L2.5 16l1-2h2.5z"/>',
    compass: '<circle cx="12" cy="12" r="9"/><path d="M15.5 8.5 13.5 13.5 8.5 15.5 10.5 10.5z"/>',
    check: '<path d="M5 12.5 10 17.5 19 7"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 7.8v.2"/>',
    glasses: '<circle cx="6.5" cy="14" r="3.5"/><circle cx="17.5" cy="14" r="3.5"/><path d="M10 14h4M3 14 4.5 7.5 7 6M21 14l-1.5-6.5L17 6"/>',
    device: '<rect x="2" y="4" width="14" height="10" rx="1.5"/><path d="M6 18h6M9 14v4"/><rect x="17" y="8" width="5" height="12" rx="1.2"/>',
    text: '<path d="M4 7V5h16v2M12 5v14M9 19h6"/>',
    spacing: '<path d="M3 12h18M6 9l-3 3 3 3M18 9l3 3-3 3"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    palette: '<path d="M12 3a9 9 0 1 0 0 18c1.2 0 1.6-.9 1.6-1.7 0-1.4-1.1-1.5-1.1-2.6 0-.9.7-1.4 1.6-1.4H17a4 4 0 0 0 4-4C21 6.6 17 3 12 3z"/><circle cx="7.5" cy="11" r="1"/><circle cx="10" cy="7" r="1"/><circle cx="15" cy="7" r="1"/>',
    log: '<path d="M6 3h11a2 2 0 0 1 2 2v16l-3-2-3 2-3-2-3 2V5a2 2 0 0 1 2-2z"/><path d="M9 8h6M9 12h6"/>',
    arrow: '<path d="M19 12H5M11 6l-6 6 6 6"/>',
    sound: '<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/>',
    mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21"/>',
    folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
    more: '<circle cx="5" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="19" cy="12" r="1.4"/>',
    edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>',
    sparkle: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/>'
  };

  function svg(name, cls) {
    var body = P[name];
    if (!body) return '';
    return '<svg class="ic' + (cls ? ' ' + cls : '') + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + body + '</svg>';
  }
  /** Replace every <i data-icon="name"> under an element with its SVG. */
  function apply(el) {
    (el || document).querySelectorAll('i[data-icon]').forEach(function (i) { i.outerHTML = svg(i.getAttribute('data-icon'), i.className); });
  }

  DA.icons = { svg: svg, apply: apply, names: Object.keys(P) };
})(typeof window !== 'undefined' ? window : globalThis);
