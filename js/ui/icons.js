/*
 * עין טובה — "Lumen" glyphs: an original icon set drawn for this app.
 * One geometric language built from optics and flight: a thin gradient line (ice → lavender),
 * a translucent facet, and one glowing focal node (champagne). 24×24, drawn on a 1.4px line.
 * Usage: <i data-icon="book"></i> → DA.icons.apply(root); DA.icons.svg('book').
 * The gradients use userSpaceOnUse so straight lines render too.
 */
(function (root) {
  'use strict';
  var DA = (root.DA = root.DA || {});

  // s = line, f = facet (translucent fill), n = focal node, k = knob (filled with the surface colour), d = dashed line
  var P = {
    mute: '<path class="f" d="M4 9.4h3.4L12 5.6v12.8l-4.6-3.8H4z"/><path d="M4 9.4h3.4L12 5.6v12.8l-4.6-3.8H4z"/><path d="M15.5 9.5l5 5M20.5 9.5l-5 5"/>',
    owl: '<path class="f" d="M5 9.6c0-3.6 3.1-6 7-6s7 2.4 7 6v5.1c0 3.9-3.1 6.8-7 6.8s-7-2.9-7-6.8z"/>' +
      '<path d="M5 9.6c0-3.6 3.1-6 7-6s7 2.4 7 6v5.1c0 3.9-3.1 6.8-7 6.8s-7-2.9-7-6.8zM5.7 6.3 4.5 3.1l3.4 1.7M18.3 6.3l1.2-3.2-3.4 1.7"/>' +
      '<circle cx="9.2" cy="10.3" r="2.6"/><circle cx="14.8" cy="10.3" r="2.6"/><path d="M11.2 13.1l.8 1.4.8-1.4z"/>' +
      '<path d="M7.8 16.4c1.2 1.5 2.6 2.2 4.2 2.2s3-.7 4.2-2.2" opacity=".55"/><circle class="n" cx="9.2" cy="10.3" r="1"/><circle class="n" cx="14.8" cy="10.3" r="1"/>',
    home: '<path class="f" d="M4.5 10.6 12 4l7.5 6.6v9.9h-15z"/><path d="M3 11.9 12 4l9 7.9M5.5 10.2v10.3h13V10.2"/><path d="M10 20.5v-5.2h4v5.2"/><circle class="n" cx="12" cy="11.6" r="1"/>',
    gear: '<circle class="f" cx="12" cy="12" r="3.4"/><circle cx="12" cy="12" r="3.4"/>' +
      '<path d="M12 2.8v2.6M12 18.6v2.6M2.8 12h2.6M18.6 12h2.6M5.5 5.5l1.8 1.8M16.7 16.7l1.8 1.8M5.5 18.5l1.8-1.8M16.7 7.3l1.8-1.8"/><circle cx="12" cy="12" r="6.6" opacity=".55"/>',
    sync: '<path d="M19.5 9.5A7.8 7.8 0 0 0 5.6 7.4M4.5 14.5a7.8 7.8 0 0 0 13.9 2.1"/><path d="M5.2 3.6v4.2h4.2M18.8 20.4v-4.2h-4.2"/><circle class="n" cx="12" cy="12" r="1.2"/>',
    save: '<path class="f" d="M7.5 3.5h9v6h-9z"/><path d="M4.5 5.5a2 2 0 0 1 2-2h9.8l3.2 3.2v11.8a2 2 0 0 1-2 2h-11a2 2 0 0 1-2-2z"/><path d="M7.5 3.5v6h9v-6M8 20.5v-6h8v6" opacity=".8"/>',
    restore: '<path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3"/><path d="M4.2 3.8v4h4"/><path d="M12 8v4.4l3 1.8"/><circle class="n" cx="12" cy="12.4" r="1"/>',
    trash: '<path d="M4.5 6.5h15M9.5 6.5V4h5v2.5M6.5 6.5l.9 13.2a1 1 0 0 0 1 .8h7.2a1 1 0 0 0 1-.8l.9-13.2"/><path d="M10.2 10v7M13.8 10v7" opacity=".7"/>',
    logo: '<path class="f" d="M2.5 12c2.6-4.3 5.8-6.5 9.5-6.5s6.9 2.2 9.5 6.5c-2.6 4.3-5.8 6.5-9.5 6.5S5.1 16.3 2.5 12z"/>' +
      '<path d="M2.5 12c2.6-4.3 5.8-6.5 9.5-6.5s6.9 2.2 9.5 6.5c-2.6 4.3-5.8 6.5-9.5 6.5S5.1 16.3 2.5 12z"/>' +
      '<circle cx="12" cy="12" r="3.9"/><path d="M12 8.1l1.9 3.3M15.4 13.1l-3.8.1M10.1 15.4l-1.9-3.3M8.6 10.9l3.8-.1M13.9 8.6l-1.9 3.3M10.1 8.6l1.9 3.3" opacity=".75"/>' +
      '<circle class="n" cx="12" cy="12" r="1.2"/>',
    eye: '<path class="f" d="M2.5 12c2.6-4.3 5.8-6.5 9.5-6.5s6.9 2.2 9.5 6.5c-2.6 4.3-5.8 6.5-9.5 6.5S5.1 16.3 2.5 12z"/>' +
      '<path d="M2.5 12c2.6-4.3 5.8-6.5 9.5-6.5s6.9 2.2 9.5 6.5c-2.6 4.3-5.8 6.5-9.5 6.5S5.1 16.3 2.5 12z"/><circle cx="12" cy="12" r="3.6"/>' +
      '<path d="M13.6 10.2a2.2 2.2 0 0 1 .9 1.4" opacity=".7"/><circle class="n" cx="12" cy="12" r="1.2"/>',
    book: '<path class="f" d="M12 7.3c-3-1.9-6-2.1-9-.8v12.2c3-1.3 6-1.1 9 .8z"/>' +
      '<path d="M12 7.3c-3-1.9-6-2.1-9-.8v12.2c3-1.3 6-1.1 9 .8M12 7.3c3-1.9 6-2.1 9-.8v12.2c-3-1.3-6-1.1-9 .8M12 7.3v12.2"/>' +
      '<path d="M5.4 10.3c1.5-.4 3.1-.2 4.5.5M5.4 13.3c1.5-.4 3.1-.2 4.5.5" opacity=".6"/>' +
      '<circle cx="16.4" cy="12.2" r="2.5" opacity=".7"/><circle class="n" cx="16.4" cy="12.2" r="1.1"/>',
    camera: '<circle cx="12" cy="12" r="8.6"/><path class="f" d="M12 8l3.46 2v4L12 16l-3.46-2v-4z"/>' +
      '<path d="M12 8l3.46 2v4L12 16l-3.46-2v-4zM12 8l4.9-4M15.46 10l4.9 1.6M15.46 14l1.9 4.9M12 16l-4.9 4M8.54 14l-4.9-1.6M8.54 10L6.6 5.1"/>' +
      '<circle class="n" cx="12" cy="12" r="1.1"/>',
    game: '<path class="f" d="M12 3.6l6.4 13.6L12 14.6l-6.4 2.6z"/><path d="M12 3.6l6.4 13.6L12 14.6l-6.4 2.6z"/>' +
      '<path class="d" d="M2.8 21c3.8-.6 6.9-2.3 9.2-5"/><circle class="n" cx="12" cy="3.9" r="1.2"/>',
    grid: '<rect x="3.5" y="3.5" width="17" height="17" rx="3.2"/><path class="f" d="M9.2 9.2h5.4c-.9 1.8-.9 3.6 0 5.4H9.2z"/>' +
      '<path d="M3.5 9.2h17M3.5 14.6h17M9.2 3.5v17" opacity=".75"/><path d="M14.8 3.5c-1.8 2.9-1.8 5.6 0 8.5s1.8 5.6 0 8.5"/>' +
      '<circle class="n" cx="13.9" cy="12" r="1.2"/>',
    scan: '<path class="f" d="M3.5 12c2.2-3.4 5-5.1 8.5-5.1s6.3 1.7 8.5 5.1c-2.2 3.4-5 5.1-8.5 5.1S5.7 15.4 3.5 12z"/>' +
      '<path d="M3.5 12c2.2-3.4 5-5.1 8.5-5.1s6.3 1.7 8.5 5.1c-2.2 3.4-5 5.1-8.5 5.1S5.7 15.4 3.5 12z"/><circle cx="12" cy="12" r="2.6"/>' +
      '<path d="M2.5 6.2V3.5h2.7M18.8 3.5h2.7v2.7M21.5 17.8v2.7h-2.7M5.2 20.5H2.5v-2.7" opacity=".8"/><circle class="n" cx="12" cy="12" r="1"/>',
    sliders: '<path d="M3.5 7h17M3.5 12h17M3.5 17h17" opacity=".55"/>' +
      '<circle class="k" cx="8.5" cy="7" r="2"/><circle class="k" cx="15.5" cy="12" r="2"/><circle class="k" cx="6.8" cy="17" r="2"/>' +
      '<circle class="n" cx="15.5" cy="12" r="1"/>',
    timer: '<path class="f" d="M12 13V5.6a7.4 7.4 0 0 1 6.4 3.7z"/><circle cx="12" cy="13" r="7.4"/>' +
      '<path d="M10 2.8h4M12 2.8v2.8M12 13l3.6-3.6M18.6 5.4l1.3-1.3"/><circle class="n" cx="12" cy="13" r="1.2"/>',
    map: '<circle cx="12" cy="12" r="8.6"/><circle cx="12" cy="12" r="4.6" opacity=".6"/>' +
      '<path class="d" d="M12 3.4v17.2M3.4 12h17.2"/><path class="f" d="M14.2 6.6c2.4.6 3.6 2.6 3 4.6-.5 1.8-2.3 2.2-3.6 1.4-1.4-.9-1.9-2.6-1.6-4 .2-1.3 1-2.2 2.2-2z"/>' +
      '<path d="M14.2 6.6c2.4.6 3.6 2.6 3 4.6-.5 1.8-2.3 2.2-3.6 1.4-1.4-.9-1.9-2.6-1.6-4 .2-1.3 1-2.2 2.2-2z"/><circle class="n" cx="12" cy="12" r="1.1"/>',
    target: '<circle cx="12" cy="12" r="7.8"/><circle class="f" cx="12" cy="12" r="3.4"/><circle cx="12" cy="12" r="3.4"/>' +
      '<path d="M12 1.8v3M12 19.2v3M1.8 12h3M19.2 12h3"/><circle class="n" cx="12" cy="12" r="1.1"/>',
    flask: '<path class="f" d="M6.9 15.4h10.2l1.4 2.6a1.7 1.7 0 0 1-1.5 2.5H7a1.7 1.7 0 0 1-1.5-2.5z"/>' +
      '<path d="M9.4 3.5h5.2M10.4 3.5v5.4l-5 9.1A1.7 1.7 0 0 0 6.9 20.5h10.2a1.7 1.7 0 0 0 1.5-2.5l-5-9.1V3.5"/>' +
      '<circle cx="10.6" cy="17.6" r=".7" opacity=".7"/><circle class="n" cx="13.6" cy="13.1" r="1"/>',
    ruler: '<rect x="3.5" y="8" width="17" height="11" rx="2.2"/><path class="f" d="M3.5 11.2h17v2.4h-17z"/>' +
      '<path d="M3.5 4.5h17M3.5 3.3v2.4M20.5 3.3v2.4" opacity=".8"/><circle class="n" cx="17" cy="16.4" r="1"/>',
    chart: '<path d="M3.5 20.5h17" opacity=".5"/><path class="f" d="M3.5 17.5l4.6-4.6 3.6 2.6 6-7.4v12.4H3.5z"/>' +
      '<path d="M3.5 17.5l4.6-4.6 3.6 2.6 6-7.4"/><circle class="n" cx="17.7" cy="8.1" r="1.3"/>',
    star: '<path class="f" d="M12 3c.8 4.7 2.3 6.3 6.8 9-4.5 2.7-6 4.3-6.8 9-.8-4.7-2.3-6.3-6.8-9 4.5-2.7 6-4.3 6.8-9z"/>' +
      '<path d="M12 3c.8 4.7 2.3 6.3 6.8 9-4.5 2.7-6 4.3-6.8 9-.8-4.7-2.3-6.3-6.8-9 4.5-2.7 6-4.3 6.8-9z"/><circle class="n" cx="19" cy="4.8" r="1.1"/>',
    pin: '<path class="f" d="M7 3.5h10v17l-5-3.7-5 3.7z"/><path d="M7 3.5h10v17l-5-3.7-5 3.7z"/><path d="M12 7.5v5M9.5 10h5" opacity=".8"/>',
    plane: '<path class="f" d="M12 2.8c.9 0 1.4 1 1.4 2.3v4.3l7.1 4.2v1.9l-7.1-2.1v4.1l2.2 1.7v1.6L12 19.9l-3.6.9v-1.6l2.2-1.7v-4.1l-7.1 2.1v-1.9l7.1-4.2V5.1c0-1.3.5-2.3 1.4-2.3z"/>' +
      '<path d="M12 2.8c.9 0 1.4 1 1.4 2.3v4.3l7.1 4.2v1.9l-7.1-2.1v4.1l2.2 1.7v1.6L12 19.9l-3.6.9v-1.6l2.2-1.7v-4.1l-7.1 2.1v-1.9l7.1-4.2V5.1c0-1.3.5-2.3 1.4-2.3z"/>' +
      '<circle class="n" cx="12" cy="6.2" r=".9"/>',
    rocket: '<path class="f" d="M12 2.6c3 2.3 4.5 5.6 4.5 9.4l-1.8 3.8H9.3L7.5 12c0-3.8 1.5-7.1 4.5-9.4z"/>' +
      '<path d="M12 2.6c3 2.3 4.5 5.6 4.5 9.4l-1.8 3.8H9.3L7.5 12c0-3.8 1.5-7.1 4.5-9.4zM9 13.3l-2.6 2.2v3.6l3-1.9M15 13.3l2.6 2.2v3.6l-3-1.9"/>' +
      '<path class="d" d="M12 18.3v3.4"/><circle class="n" cx="12" cy="9" r="1.5"/>',
    compass: '<circle cx="12" cy="12" r="8.6"/><path class="f" d="M15.6 8.4l-2.1 5.1-5.1 2.1 2.1-5.1z"/><path d="M15.6 8.4l-2.1 5.1-5.1 2.1 2.1-5.1z"/><circle class="n" cx="12" cy="12" r="1"/>',
    check: '<path d="M5 12.6l4.4 4.4L19 7.4"/>',
    once: '<circle cx="12" cy="12" r="8.4"/><path class="f" d="M12 3.6a8.4 8.4 0 0 1 8.4 8.4H12z"/><path d="M8.2 12.3l2.6 2.6 5-5.2"/><circle class="n" cx="20.4" cy="12" r="1.1"/>',
    info: '<circle cx="12" cy="12" r="8.6"/><path d="M12 10.8v5.6"/><circle class="n" cx="12" cy="7.6" r="1.1"/>',
    glasses: '<circle class="f" cx="7" cy="13.6" r="3.6"/><circle class="f" cx="17" cy="13.6" r="3.6"/>' +
      '<circle cx="7" cy="13.6" r="3.6"/><circle cx="17" cy="13.6" r="3.6"/><path d="M10.6 13.2c.9-.8 1.9-.8 2.8 0M3.4 13.2l1-4.4 2.2-1.3M20.6 13.2l-1-4.4-2.2-1.3"/>' +
      '<path d="M5.4 12.2a2 2 0 0 1 1.4-1" opacity=".8"/><circle class="n" cx="18.4" cy="12" r=".8"/>',
    device: '<rect x="2.5" y="4.5" width="13.5" height="10" rx="1.6"/><path d="M6.2 18.5h6M9.2 14.5v4" opacity=".8"/>' +
      '<rect class="f" x="17.5" y="8" width="4.5" height="12.5" rx="1.2"/><rect x="17.5" y="8" width="4.5" height="12.5" rx="1.2"/><circle class="n" cx="19.75" cy="18.4" r=".6"/>',
    text: '<path d="M3.5 19.5L8 5.5l4.5 14M5.2 14.6h5.6"/><circle class="f" cx="17.4" cy="16.4" r="2.9"/><circle cx="17.4" cy="16.4" r="2.9"/><path d="M20.3 13.2v6.3"/>' +
      '<circle class="n" cx="8" cy="5.5" r="1"/>',
    spacing: '<path d="M4.5 4.5v15M19.5 4.5v15"/><path class="f" d="M7 9h10v6H7z"/><path d="M8 12h8M10.4 9.6 8 12l2.4 2.4M13.6 9.6 16 12l-2.4 2.4"/>',
    sun: '<circle cx="12" cy="12" r="4.4"/><path class="f" d="M12 7.6a4.4 4.4 0 0 1 0 8.8z"/>' +
      '<path d="M12 2.6v2M12 19.4v2M2.6 12h2M19.4 12h2M5.4 5.4l1.4 1.4M17.2 17.2l1.4 1.4M5.4 18.6l1.4-1.4M17.2 6.8l1.4-1.4" opacity=".75"/><circle class="n" cx="12" cy="12" r="1"/>',
    palette: '<circle class="f" cx="12" cy="8.7" r="4.7"/><circle cx="12" cy="8.7" r="4.7"/><circle class="f" cx="8.9" cy="14.3" r="4.7"/><circle cx="8.9" cy="14.3" r="4.7"/>' +
      '<circle class="f" cx="15.1" cy="14.3" r="4.7"/><circle cx="15.1" cy="14.3" r="4.7"/><circle class="n" cx="12" cy="12.4" r="1"/>',
    log: '<path d="M6.5 3.5h11v17l-2.75-1.8L12 20.5l-2.75-1.8L6.5 20.5z"/><path d="M9.2 8h5.6M9.2 11.6h5.6" opacity=".7"/>',
    arrow: '<path d="M19.5 12h-15M10 6.5L4.5 12l5.5 5.5"/>',
    sound: '<path class="f" d="M4 9.4h3.4L12 5.6v12.8l-4.6-3.8H4z"/><path d="M4 9.4h3.4L12 5.6v12.8l-4.6-3.8H4z"/>' +
      '<path d="M15.4 9.2a4 4 0 0 1 0 5.6M17.9 6.7a7.6 7.6 0 0 1 0 10.6"/>',
    mic: '<rect class="f" x="9" y="3" width="6" height="11" rx="3"/><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21"/>',
    folder: '<path d="M5 6.2v14.3h10.5" opacity=".55"/><path class="f" d="M7.5 3.5h7l4 4v11h-11z"/><path d="M7.5 3.5h7l4 4v11h-11zM14.5 3.5v4h4"/>' +
      '<path d="M10 11.6h6M10 14.6h4" opacity=".7"/>',
    more: '<circle class="n" cx="5.5" cy="12" r="1.5"/><circle class="n" cx="12" cy="12" r="1.5"/><circle class="n" cx="18.5" cy="12" r="1.5"/>',
    edit: '<path class="f" d="M4 20l1-4.2L15.6 5.2l3.2 3.2L8.2 19z"/><path d="M4 20l1-4.2L15.6 5.2l3.2 3.2L8.2 19zM13.6 7.2l3.2 3.2"/>',
    sparkle: '<path class="f" d="M10 3.5c.7 3.9 1.9 5.2 5.6 7.5-3.7 2.3-4.9 3.6-5.6 7.5-.7-3.9-1.9-5.2-5.6-7.5 3.7-2.3 4.9-3.6 5.6-7.5z"/>' +
      '<path d="M10 3.5c.7 3.9 1.9 5.2 5.6 7.5-3.7 2.3-4.9 3.6-5.6 7.5-.7-3.9-1.9-5.2-5.6-7.5 3.7-2.3 4.9-3.6 5.6-7.5z"/>' +
      '<path d="M18.3 14.5c.3 1.7.8 2.2 2.4 3.2-1.6 1-2.1 1.5-2.4 3.2-.3-1.7-.8-2.2-2.4-3.2 1.6-1 2.1-1.5 2.4-3.2z"/>',
    lines: '<rect x="3.5" y="3.5" width="17" height="17" rx="2.6"/><path d="M3.5 9.2h17M3.5 14.8h17M9.2 3.5v17M14.8 3.5v17" opacity=".55"/>' +
      '<path class="f" d="M9.2 9.2h5.6v5.6H9.2z"/><circle class="n" cx="12" cy="12" r="1.3"/>',
    search: '<circle class="f" cx="10.5" cy="10.5" r="6.4"/><circle cx="10.5" cy="10.5" r="6.4"/><path d="M15.2 15.2l5.3 5.3"/>' +
      '<path d="M8.2 12.6l2.3-5 2.3 5M9 11h3" opacity=".8"/>',
    fog: '<path d="M3.5 7.5c2.8-1.4 5.7-1.4 8.5 0s5.7 1.4 8.5 0"/><path d="M3.5 12c2.8-1.4 5.7-1.4 8.5 0s5.7 1.4 8.5 0" opacity=".65"/>' +
      '<path d="M3.5 16.5c2.8-1.4 5.7-1.4 8.5 0s5.7 1.4 8.5 0" opacity=".35"/><circle class="n" cx="12" cy="12" r="1.1"/>',
    trophy: '<path class="f" d="M7.5 3.5h9v4.8a4.5 4.5 0 0 1-9 0z"/><path d="M7.5 3.5h9v4.8a4.5 4.5 0 0 1-9 0zM7.5 5.5H4.6v1.2a3.4 3.4 0 0 0 3.2 3.4M16.5 5.5h2.9v1.2a3.4 3.4 0 0 1-3.2 3.4M12 12.8v3.6M8.6 20.5h6.8M9.6 16.4h4.8v4.1H9.6z"/>' +
      '<circle class="n" cx="12" cy="7.4" r="1.1"/>',
    drop: '<path class="f" d="M12 3.5c3 3.6 6 7 6 10.3a6 6 0 0 1-12 0C6 10.5 9 7.1 12 3.5z"/><path d="M12 3.5c3 3.6 6 7 6 10.3a6 6 0 0 1-12 0C6 10.5 9 7.1 12 3.5z"/>'
  };
  P.child = P.rocket; P.adult = P.plane;

  var defsDone = false;
  /** Shared gradients (once per document). */
  function defs() {
    if (defsDone || typeof document === 'undefined' || !document.body) return;
    defsDone = true;
    var d = document.createElement('div');
    d.setAttribute('aria-hidden', 'true');
    d.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden';
    d.innerHTML = '<svg width="0" height="0"><defs>' +
      '<linearGradient id="lumenLine" gradientUnits="userSpaceOnUse" x1="3" y1="3" x2="21" y2="21"><stop offset="0" stop-color="#9ff1ff"/><stop offset=".55" stop-color="#8fd2ff"/><stop offset="1" stop-color="#b9a8ff"/></linearGradient>' +
      '<linearGradient id="lumenFacet" gradientUnits="userSpaceOnUse" x1="3" y1="21" x2="21" y2="3"><stop offset="0" stop-color="#7ce7ff" stop-opacity=".05"/><stop offset="1" stop-color="#a99bff" stop-opacity=".42"/></linearGradient>' +
      '</defs></svg>';
    document.body.insertBefore(d, document.body.firstChild);
  }

  function svg(name, cls) {
    var body = P[name];
    if (!body) return '';
    defs();
    return '<svg class="ic lumen' + (cls ? ' ' + cls : '') + '" viewBox="0 0 24 24" fill="none" stroke="url(#lumenLine)" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + body + '</svg>';
  }
  /** Replace every <i data-icon="name"> under an element with its SVG. */
  function apply(el) {
    (el || document).querySelectorAll('i[data-icon]').forEach(function (i) { i.outerHTML = svg(i.getAttribute('data-icon'), i.className); });
  }

  DA.icons = { svg: svg, apply: apply, names: Object.keys(P) };
})(typeof window !== 'undefined' ? window : globalThis);
