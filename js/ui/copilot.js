/*
 * עין טובה — The navigator (נווט): Yanshufi the owl 🦉 guides every step in very few words, can read the
 * guidance aloud, highlights the button to press, and offers one big "next" button.
 * It follows what is on screen (screen + stage) and speaks only when something changes.
 * Readers (or an adult) can hide it or turn the voice off in the settings.
 */
(function (root) {
  'use strict';
  var DA = root.DA;
  var $ = DA.ui.$, esc = DA.ui.esc;
  var ctx, lastKey = null, minimized = false, target = null;
  // on screens with content (reading, calibration, tools…) the navigator must never cover it:
  // it waits as a small owl with a dot, and opens only when tapped
  var COMPACT = { 'read-view': 1, 'read-sources': 1, 'read-see': 1, calibrate: 1, tools: 1, lab: 1, history: 1, home: 1, 'hub-ready': 1, 'learn-end': 1, 'learn-setup': 1 };

  function visible(id) { var e = $(id); return !!(e && e.offsetParent !== null && getComputedStyle(e).display !== 'none'); }
  function settings() { var p = ctx.profile(); return p ? p.settings : {}; }
  function on() { var p = ctx.profile(); return !p || p.settings.copilot !== false; }

  /** Where are we? One short key per screen and stage. */
  function stateKey() {
    var s = ctx.current();
    if (s === 'learn') return visible('learnPlay') ? 'learn-play' : visible('learnEnd') ? 'learn-end' : 'learn-setup';
    if (s === 'read') return visible('readView') ? 'read-view' : ($('readSources').classList.contains('see') ? 'read-see' : 'read-sources');
    if (s === 'readtest') return visible('rtPlay') ? 'readtest-play' : visible('rtEnd') ? 'readtest-end' : 'readtest-setup';
    if (s === 'fieldtest') return visible('ftStage') ? 'fieldtest-play' : visible('ftEnd') ? 'fieldtest-end' : 'fieldtest-setup';
    if (s === 'hub') {
      var p = ctx.profile();
      if (!p) return 'hub';
      var played = ctx.profiles.sessionsFor(p.id).some(function (x) { return !x.kind || x.kind === 'learn'; });
      var hasCal = !!ctx.opsFor(p.settings);
      return !played ? 'hub-first' : (p.kind === 'adult' && !hasCal && !ctx.store.getPref('copilot.skipCal.' + p.id, false)) ? 'hub-cal' : 'hub-ready';
    }
    if (s === 'home') return ctx.profiles.list().length ? 'home' : 'home-empty';
    return s;
  }

  /** Messages: text, optional highlighted element, and buttons. */
  function message(key) {
    var p = ctx.profile(), name = p ? p.name : '';
    switch (key) {
      case 'home-empty': return { text: T('שלום! אני ינשוף, הנווט שלך. בוא נרשום את הטייס הראשון.'), target: 'newChildBtn',
        buttons: [{ label: T('טייס/ת צעיר/ה'), go: function () { $('newChildBtn').click(); } }, { label: T('מבוגר/ת'), go: function () { $('newAdultBtn').click(); } }] };
      case 'home': return { text: T('מי טס היום? לוחצים על הכרטיס שלך.'), target: 'profileGrid' };
      case 'hub-first': return { text: T('היי ') + name + T('! לפני ההמראה עושים טיסת ניסוי קצרה, כדי שאדע מה הכי ברור לך.'), target: 'tileLearn',
        buttons: [{ label: T('▶ לטיסת הניסוי'), main: true, go: function () { ctx.go('learn'); setTimeout(function () { $('quickGame').click(); }, 250); } }] };
      case 'hub-cal': return { text: T('רואים קווים עקומים או גלים? אפשר לכייל. אם לא, ממריאים ישר!'), target: 'tileCalibrate',
        buttons: [{ label: T('לכייל'), go: function () { ctx.go('calibrate'); } }, { label: T('לקרוא'), main: true, go: function () { ctx.store.setPref('copilot.skipCal.' + p.id, true); $('tileRead').click(); } }] };
      case 'hub-ready': return { text: T('הכול מוכן להמראה! לאן טסים: לקרוא או לראות?'), target: 'tileRead',
        buttons: [{ label: T('לקרוא'), main: true, go: function () { $('tileRead').click(); } }, { label: T('לראות'), go: function () { $('tileSee').click(); } }] };
      case 'learn-setup': return { text: T('אראה לך מספרים, ציורים ומילים. רק בוחרים מה ראית. אין טעויות!'), target: 'quickGame',
        buttons: [{ label: T('▶ מתחילים'), main: true, go: function () { $('quickGame').click(); } }] };
      case 'learn-end': return { text: T('כל הכבוד, טייס! לשמור את זה כמצב שלך?'), target: 'learnApplyBest',
        buttons: [{ label: T('לשמור'), main: true, go: function () { $('learnApplyBest').click(); } }] };
      case 'read-sources': return { text: T('מה נקרא? אפשר להדביק טקסט, לבחור קובץ, או לנסות דוגמה.'), target: 'srcSample',
        buttons: [{ label: T('דוגמה'), main: true, go: function () { $('srcSample').click(); } }, { label: T('קובץ'), go: function () { $('srcFileBtn').click(); } }] };
      case 'read-see': return { text: T('מצלמים דף או תמונה, ואני אראה אותם ברור יותר.'), target: 'srcPhotoBtn',
        buttons: [{ label: T('לצלם'), main: true, go: function () { $('srcPhotoBtn').click(); } }, { label: T('תמונה מהמכשיר'), go: function () { $('srcFileBtn').click(); } }] };
      case 'read-view': return { text: T('קטן מדי? לוחצים A+. רוצים לשמוע? לוחצים 🔊. הכוכב ⭐ מחזיר למצב שלך.'), target: 'rBigger' };
      case 'calibrate': return { text: T('מביטים ברשת. קו נראה עקום? תופסים אותו וגוררים עד שהוא ישר. בסוף לוחצים שמירה.'), target: 'canvas' };
      case 'tools': return { text: T('בוחרים כלי למעלה, ומזיזים את הנקודות או הצורות עד שהן נראות נכון. בסוף: שמירה.'), target: 'tlMode' };
      case 'lab': return { text: T('כאן מכוונים בדיוק: טשטוש, חידוד, פסים ועוד. בוחרים לשונית ומנסים.'), target: 'labTabs' };
      case 'readtest-setup': return { text: T('נקרא משפטים קצרים בקול, והם יילכו ויקטנו. מי שמקשיב יסמן טעויות.'), target: 'rtStart',
        buttons: [{ label: T('▶ מתחילים'), main: true, go: function () { $('rtStart').click(); } }] };
      case 'readtest-end': return { text: T('סיימנו! אפשר לקבוע את גודל האותיות שנמצא.'), target: 'rtApply' };
      case 'fieldtest-setup': return { text: T('מביטים רק בצלב האדום. כשנקודה מהבהבת, לוחצים. לא מזיזים את העיניים!'), target: 'ftStart',
        buttons: [{ label: T('▶ מתחילים'), main: true, go: function () { $('ftStart').click(); } }] };
      case 'fieldtest-end': return { text: T('הנה המפה. אפשר להפעיל את ההמלצות בקריאה.'), target: 'ftApply' };
      case 'history': return { text: T('כאן רואים איך ההתאמות השתנו לאורך זמן.') };
    }
    return null;   // stay quiet (e.g. while playing)
  }

  // ---------------- rendering ----------------
  function init(c) {
    ctx = c;
    $('copilotMini').onclick = function () { minimized = false; render(true); };
    $('copilotClose').onclick = function () { minimized = true; render(); };
    $('copilotSpeak').onclick = function () { DA.speech.say(currentText); };
    setInterval(tick, 900);
  }

  var currentText = '';
  function tick() {
    if (!ctx.current()) return;
    var key = stateKey();
    if (key !== lastKey) { lastKey = key; minimized = !!COMPACT[key]; render(!COMPACT[key]); }
  }
  /** Force a refresh (e.g. after settings change). */
  function update() { lastKey = null; tick(); }

  function render(changed) {
    var box = $('copilot'), mini = $('copilotMini');
    clearTarget();
    var m = on() ? message(lastKey) : null;
    if (!m) { box.classList.remove('show'); mini.style.display = 'none'; return; }
    currentText = m.text;
    mini.style.display = minimized ? '' : 'none';
    mini.classList.toggle('has-msg', minimized && !!COMPACT[lastKey]);
    mini.title = m.text;
    box.classList.toggle('show', !minimized);
    if (minimized) return;
    $('copilotText').textContent = m.text;
    var bb = $('copilotButtons');
    bb.innerHTML = '';
    (m.buttons || []).forEach(function (b) {
      var el = document.createElement('button');
      el.className = b.main ? 'primary' : '';
      el.textContent = b.label;
      el.onclick = function () { minimized = true; render(); b.go(); };
      bb.appendChild(el);
    });
    var ok = document.createElement('button');
    ok.textContent = T('הבנתי');
    ok.onclick = function () { minimized = true; render(); };
    bb.appendChild(ok);
    if (m.target) setTarget($(m.target));
    if (changed && settings().copilotVoice) DA.speech.say(m.text);
  }

  function setTarget(el) {
    if (!el || el.offsetParent === null) return;
    target = el;
    el.classList.add('guide-target');
  }
  function clearTarget() { if (target) target.classList.remove('guide-target'); target = null; }

  function speak(text, force) {
    var synth = root.speechSynthesis;
    if (!synth || !text) return;
    if (!force && synth.speaking) return;
    synth.cancel();
    var u = new SpeechSynthesisUtterance(text.replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, ''));
    var he = DA.i18n.content !== 'en';
    u.lang = he ? 'he-IL' : 'en-US';
    var v = synth.getVoices().filter(function (x) { return x.lang && x.lang.toLowerCase().indexOf(he ? 'he' : 'en') === 0; })[0];
    if (v) u.voice = v;
    u.rate = (settings().speechRate || 0.9);
    synth.speak(u);
  }

  DA.copilot = { init: init, update: update };
})(typeof window !== 'undefined' ? window : globalThis);
