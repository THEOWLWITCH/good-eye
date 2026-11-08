/*
 * DA — Personal display settings ("המשקפיים שלי").
 * One settings object describes how ANY content (text, pictures, math, photos) is shown to a reader.
 * It is learned in the learning game, fine-tuned by an adult, saved per profile, and applied by the Lens.
 */
(function (root) {
  'use strict';
  var DA = (root.DA = root.DA || {});

  var FONTS = [
    { id: 'rubik', label: T('רוביק'), family: "'Rubik', Arial, sans-serif" },
    { id: 'assistant', label: T('אסיסטנט'), family: "'Assistant', Arial, sans-serif" },
    { id: 'round', label: T('עגול'), family: "'Varela Round', 'Comic Neue', Arial, sans-serif" },
    { id: 'plex', label: T('פלקס (ברור ומודרני)'), family: "'IBM Plex Sans Hebrew', 'Heebo', Arial, sans-serif" },
    { id: 'atkinson', label: T('אטקינסון (לאנגלית בלבד)'), family: "'Atkinson Hyperlegible', 'Rubik', Arial, sans-serif" },
    { id: 'lexend', label: T('לקסנד (לאנגלית בלבד)'), family: "'Lexend', 'Heebo', Arial, sans-serif" },
    { id: 'serif', label: T('עם תגים (פרנק רוהל)'), family: "'Frank Ruhl Libre', 'Noto Serif', Georgia, serif" },
    { id: 'arial', label: T('אריאל'), family: 'Arial, sans-serif' }
  ];
  var FONTS_CSS = 'https://fonts.googleapis.com/css2?family=Rubik:wght@400;500;700&family=Assistant:wght@400;600;800' +
    '&family=Varela+Round&family=Comic+Neue:wght@400;700&family=Atkinson+Hyperlegible:wght@400;700' +
    '&family=Lexend:wght@400;600&family=Heebo:wght@400;500;600;700;800;900&family=Frank+Ruhl+Libre:wght@400;700' +
    '&family=Noto+Serif:wght@400;700&family=IBM+Plex+Sans+Hebrew:wght@300;400;500;600;700&display=swap';

  // Colour themes: polarity + tint. fg/bg used for text; "reversed" also inverts images on request.
  var THEMES = [
    { id: 'white', label: T('שחור על לבן'), fg: '#000000', bg: '#ffffff' },
    { id: 'cream', label: T('שחור על שמנת'), fg: '#1a1a1a', bg: '#fbf3dc' },
    { id: 'yellow', label: T('שחור על צהוב'), fg: '#000000', bg: '#fff3a0' },
    { id: 'blue', label: T('כחול כהה על תכלת'), fg: '#0b1f4d', bg: '#dcebff' },
    { id: 'green', label: T('שחור על ירוק בהיר'), fg: '#0d1f0d', bg: '#dff3df' },
    { id: 'gray', label: T('שחור על אפור בהיר'), fg: '#000000', bg: '#e6e6e6' },
    { id: 'dark', label: T('לבן על שחור'), fg: '#ffffff', bg: '#000000', reversed: true },
    { id: 'darkyellow', label: T('צהוב על שחור'), fg: '#ffe94d', bg: '#000000', reversed: true },
    { id: 'darkblue', label: T('לבן על כחול כהה'), fg: '#ffffff', bg: '#0b2a5c', reversed: true }
  ];

  var DEFAULTS = {
    // text
    fontSize: 28,          // px
    font: 'rubik',
    bold: false,
    letterSpacing: 0.02,   // em
    wordSpacing: 0.1,      // em
    lineHeight: 1.6,
    lineChars: 45,         // max characters per line
    nikud: false,          // prefer pointed Hebrew in generated texts
    // colour & contrast
    theme: 'white',
    imageContrast: 1,      // 1 = unchanged
    imageInvert: false,    // invert pictures in dark themes
    // geometry & sharpness
    warpStrength: 1,       // 0 = off, 1 = full personal grid correction
    calibrationId: null,   // which saved grid trial supplies the warp
    sharpen: 0,            // 0..1.5
    zoom: 1,               // extra magnification for pictures/pages
    // reading aids
    ruler: 'off',          // off | band | mask
    lineMarker: false,     // coloured bar at the start of each line (field loss)
    lineMarkerEnd: false,  // coloured bar at the end of each line (reading into the side seen less)
    shiftX: 0, shiftY: 0,  // move content within the view (eccentric viewing), fraction of view
    speechRate: 0.9,
    speechHighlight: true, // highlight each word while reading aloud
    // comfort & colour
    brightness: 1,         // 0.4..1 — dim the view (glare, light sensitivity)
    warmth: 0,             // 0..1 — warmer light (less blue)
    cvd: 'none',           // colour-vision help for pictures: none | protan | deutan | tritan
    calm: false,           // calm mode: softer contrast, no dense stripes (pattern glare, migraine)
    // personal blur shape and the sharpening method chosen in the lab (applied to pictures/pages)
    psf: null,             // { radius, stretch, angle, smear, tail, tailLen, halo, haloR }
    deblur: 'none',        // none | unsharp | directional | local | wiener | rl
    deblurAmount: 1, deblurRadius: 1.5, deblurK: 0.01, deblurIter: 10,
    cvi: false,            // simple & focused mode (CVI): one bright colour, uncluttered, two answers, gentle motion, more time
    syllables: false,      // colour syllables in alternating colours (approximate; pointed Hebrew and English)
    dictionary: true,      // double-tap a word for a picture and to hear it
    copilot: true,         // show the navigator (Yanshufi the owl) with short guidance
    copilotVoice: false,   // the navigator reads its guidance aloud
    uiContrast: 'auto',    // interface look: auto (follows the device) | high (light, high contrast) | normal
    uiScale: 1,            // interface size (buttons, labels): 1 | 1.15 | 1.3 | 1.5
    gamePace: 'normal',    // pause after each answer: slow | normal | fast | manual (a Next button)
    gameVoice: true,       // the game speaks: questions, praise, pause and what happens at the end
    // eye tracking (standalone version only)
    eyesKeepAngle: false,  // keep letters the same size for the eye when the reader moves closer/farther
    refDistanceCm: null    // viewing distance at which fontSize was chosen/learned
  };

  var RANGES = {
    fontSize: [12, 120], letterSpacing: [-0.02, 0.4], wordSpacing: [0, 1.2], lineHeight: [1.1, 3],
    lineChars: [15, 90], imageContrast: [0.6, 2.2], warpStrength: [0, 1], sharpen: [0, 1.5],
    brightness: [0.4, 1], warmth: [0, 1], uiScale: [1, 1.5],
    zoom: [0.5, 4], shiftX: [-0.35, 0.35], shiftY: [-0.35, 0.35], speechRate: [0.5, 1.5]
  };

  function normalize(s) {
    var out = Object.assign({}, DEFAULTS, s || {});
    Object.keys(RANGES).forEach(function (k) {
      var r = RANGES[k], v = Number(out[k]);
      out[k] = isNaN(v) ? DEFAULTS[k] : Math.min(r[1], Math.max(r[0], v));
    });
    if (!FONTS.some(function (f) { return f.id === out.font; })) out.font = DEFAULTS.font;
    if (!THEMES.some(function (t) { return t.id === out.theme; })) out.theme = DEFAULTS.theme;
    if (['none', 'protan', 'deutan', 'tritan'].indexOf(out.cvd) < 0) out.cvd = 'none';
    if (['none', 'unsharp', 'directional', 'local', 'wiener', 'rl'].indexOf(out.deblur) < 0) out.deblur = 'none';
    return out;
  }

  function font(id) { return FONTS.filter(function (f) { return f.id === id; })[0] || FONTS[0]; }
  function theme(id) { return THEMES.filter(function (t) { return t.id === id; })[0] || THEMES[0]; }

  /** Short human summary, for pinned states and reports. */
  function describe(s) {
    s = normalize(s);
    return [
      s.fontSize + 'px', font(s.font).label, theme(s.theme).label,
      s.letterSpacing > 0.06 ? T('ריווח אותיות ') + s.letterSpacing.toFixed(2) : null,
      s.warpStrength > 0 && s.calibrationId ? T('תיקון עיוות ') + Math.round(s.warpStrength * 100) + '%' : null,
      s.ruler !== 'off' ? T('סרגל קריאה') : null,
      s.brightness < 0.95 ? T('מעומעם') : null,
      s.warmth > 0.05 ? T('אור חם') : null,
      s.cvd !== 'none' ? T('צבעים לעיוורון צבעים') : null,
      s.calm ? T('מצב רגוע') : null,
      s.deblur !== 'none' ? T('חידוד תמונות אישי') : null,
      s.cvi ? T('מצב פשוט וממוקד') : null,
      s.syllables ? T('הברות בצבעים') : null
    ].filter(Boolean).join(' · ');
  }

  var loadedFonts = false;
  function loadFonts() {
    if (loadedFonts || typeof document === 'undefined') return;
    loadedFonts = true;
    var l = document.createElement('link');
    l.rel = 'stylesheet'; l.href = FONTS_CSS;
    document.head.appendChild(l);
  }

  DA.settings = {
    DEFAULTS: DEFAULTS, RANGES: RANGES, FONTS: FONTS, THEMES: THEMES,
    normalize: normalize, font: font, theme: theme, describe: describe, loadFonts: loadFonts
  };
})(typeof window !== 'undefined' ? window : globalThis);
