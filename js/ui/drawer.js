/*
 * DA — Advanced settings drawer (for an adult). All display parameters with a live preview.
 * Children normally never open it: the learning game sets these values for them.
 */
(function (root) {
  'use strict';
  function PACE_OPTS() { return [['slow', T('🐢 לאט ובנחת')], ['normal', T('🚶 רגיל')], ['fast', T('🙂 קצת יותר זריז')], ['manual', T('✋ בקצב שלי (כפתור הבא)')]]; }
  var DA = root.DA;
  var $ = DA.ui.$, esc = DA.ui.esc;
  var ctx, previewLens, work;

  var GROUPS = [
    { title: T('🦉 הנווט והקראת הנחיות'), items: [
      { k: 'copilot', label: T('להציג את הנווט, שמסביר כל צעד'), type: 'check' },
      { k: 'gamePace', label: T('קצב המשחק'), type: 'select', options: function () { return PACE_OPTS(); } },
      { k: 'gameVoice', label: T('קול במשחק: שאלות, עידוד ומה קורה בסוף'), type: 'check' },
      { k: 'copilotVoice', label: T('להקריא את כל ההנחיות אוטומטית (הנווט, המשחק, הכלים והשאלות)'), type: 'check' }
    ] },
    { title: T('טקסט'), items: [
      { k: 'fontSize', label: T('גודל אותיות'), type: 'range', min: 12, max: 96, step: 1, fmt: function (v) { return v + 'px'; } },
      { k: 'font', label: T('גופן'), type: 'select', options: function () { return DA.settings.FONTS.map(function (f) { return [f.id, f.label]; }); } },
      { k: 'bold', label: T('אותיות עבות'), type: 'check' },
      { k: 'letterSpacing', label: T('ריווח בין אותיות'), type: 'range', min: -0.02, max: 0.4, step: 0.01, fmt: f2 },
      { k: 'wordSpacing', label: T('ריווח בין מילים'), type: 'range', min: 0, max: 1.2, step: 0.05, fmt: f2 },
      { k: 'lineHeight', label: T('ריווח בין שורות'), type: 'range', min: 1.1, max: 3, step: 0.05, fmt: f2 },
      { k: 'lineChars', label: T('אורך שורה (תווים)'), type: 'range', min: 15, max: 90, step: 1, fmt: String },
      { k: 'nikud', label: T('טקסטים חדשים עם ניקוד'), type: 'check' }
    ] },
    { title: T('צבעים וניגודיות'), items: [
      { k: 'theme', label: T('צבע רקע וטקסט'), type: 'themes' },
      { k: 'imageContrast', label: T('ניגודיות תמונות'), type: 'range', min: 0.6, max: 2.2, step: 0.05, fmt: f2 },
      { k: 'imageInvert', label: T('היפוך תמונות ברקע כהה'), type: 'check' }
    ] },
    { title: T('נוחות ורגישויות'), items: [
      { k: 'brightness', label: T('בהירות (עמעום לסנוור ורגישות לאור)'), type: 'range', min: 0.4, max: 1, step: 0.05, fmt: pct },
      { k: 'warmth', label: T('אור חם (פחות כחול)'), type: 'range', min: 0, max: 1, step: 0.05, fmt: pct },
      { k: 'cvd', label: T('עזרה בהבחנה בין צבעים (בתמונות ובתרשימים)'), type: 'select', options: function () { return [['none', T('כבוי')], ['protan', T('אדום־ירוק')], ['deutan', T('ירוק־אדום (הנפוץ ביותר)')], ['tritan', T('כחול־צהוב')]]; } },
      { k: 'cvi', label: T('מצב פשוט וממוקד: צבע בולט אחד, בלי עומס, שתי תשובות ויותר זמן (מתאים ל־CVI)'), type: 'check' },
      { k: 'calm', label: T('מצב רגוע: ניגודיות רכה ובלי פסים צפופים (מיגרנה, רגישות לדגמים)'), type: 'check' }
    ] },
    { title: T('תיקון עיוות וחדות'), items: [
      { k: 'calibrationId', label: T('כיול רשת פעיל'), type: 'select', options: calibrationOptions },
      { k: 'warpStrength', label: T('עוצמת תיקון העיוות'), type: 'range', min: 0, max: 1.5, step: 0.05, fmt: pct },
      { k: 'sharpen', label: T('חידוד'), type: 'range', min: 0, max: 1.5, step: 0.05, fmt: f2 },
      { k: 'zoom', label: T('הגדלת תמונות ועמודים'), type: 'range', min: 0.5, max: 4, step: 0.1, fmt: function (v) { return '×' + (+v).toFixed(1); } }
    ] },
    { title: T('עזרי קריאה'), items: [
      { k: 'ruler', label: T('סרגל קריאה'), type: 'select', options: function () { return [['off', T('כבוי')], ['band', T('פס מודגש')], ['mask', T('חלון (מחשיך את השאר)')]]; } },
      { k: 'lineMarker', label: T('סימון תחילת שורה'), type: 'check' },
      { k: 'shiftX', label: T('הזזת הטקסט לצדדים'), type: 'range', min: -0.35, max: 0.35, step: 0.01, fmt: pct },
      { k: 'shiftY', label: T('הזזת הטקסט למעלה/למטה'), type: 'range', min: -0.35, max: 0.35, step: 0.01, fmt: pct },
      { k: 'syllables', label: T('הברות בצבעים מתחלפים (בקירוב, לעברית מנוקדת ולאנגלית)'), type: 'check' },
      { k: 'dictionary', label: T('לחיצה כפולה על מילה מראה תמונה ומקריאה אותה'), type: 'check' },
      { k: 'speechHighlight', label: T('להדגיש כל מילה בזמן ההקראה'), type: 'check' },
      { k: 'speechRate', label: T('מהירות הקראה'), type: 'range', min: 0.5, max: 1.5, step: 0.05, fmt: f2 }
    ] },
    { title: T('👁️ מעקב עיניים (באתר העצמאי, לא חובה)'), items: [
      { k: 'eyesKeepAngle', label: T('לשמור על גודל אותיות קבוע לעין, גם כשמתקרבים או מתרחקים'), type: 'check' }
    ] }
  ];
  function f2(v) { return (+v).toFixed(2); }
  function pct(v) { return Math.round(v * 100) + '%'; }

  function calibrationOptions() {
    var p = ctx.profile(), out = [['', T('— ללא —')]];
    ctx.store.listTrials().forEach(function (s) {
      var t = ctx.store.getTrial(s.id);
      if (!t || !t.actions || !t.actions.length) return;
      if (t.profileId && p && t.profileId !== p.id) return;
      var d = new Date(s.savedAt);
      out.push([s.id, (s.label || T('כיול')) + ' · ' + d.toLocaleDateString(DA.i18n.locale) + ' · ' + s.actions + T(' תיקונים')]);
    });
    return out;
  }

  function init(c) {
    ctx = c;
    previewLens = new DA.Lens($('drawerPreview'));
    $('drawerClose').onclick = close;
    $('drawerBest').onclick = function () {
      ctx.profiles.setBest(ctx.profile(), work);
      DA.ui.toast(T('⭐ נשמר כ"המצב שלי" — אפשר לחזור אליו בלחיצה'));
    };
    $('drawerPin').onclick = function () {
      DA.ui.prompt(T('שם למצב הזה:'), '').then(function (n) { if (n) { ctx.profiles.pin(ctx.profile(), n, work); DA.ui.toast(T('📌 נשמר: ') + n); } });
    };
    $('drawerReset').onclick = function () {
      DA.ui.ask(T('להחזיר את כל ההגדרות לברירת המחדל? (הכיול הפעיל נשאר)'), T('איפוס')).then(function (y) {
        if (!y) return;
        var keep = work.calibrationId;
        work = DA.settings.normalize({ calibrationId: keep });
        ctx.updateSettings(work); render();
      });
    };
    $('drawerScrim').onclick = close;
    $('drawerEyes').onclick = function () { close(); DA.eyePanel.open(); };
  }

  function open() {
    if (!ctx.profile()) return;
    work = DA.settings.normalize(ctx.profile().settings);
    render();
    document.body.classList.add('drawer-open');
  }
  function close() { document.body.classList.remove('drawer-open'); }

  function render() {
    var box = $('drawerBody');
    box.innerHTML = '';
    GROUPS.forEach(function (g) {
      var sec = document.createElement('section');
      sec.innerHTML = '<h3>' + esc(g.title) + '</h3>';
      g.items.forEach(function (it) { sec.appendChild(control(it)); });
      box.appendChild(sec);
    });
    preview();
  }

  function control(it) {
    var wrap = document.createElement('label');
    var v = work[it.k];
    if (it.type === 'range') {
      wrap.innerHTML = esc(it.label) + ' <output></output><input type="range">';
      var inp = wrap.querySelector('input'), out = wrap.querySelector('output');
      inp.min = it.min; inp.max = it.max; inp.step = it.step; inp.value = v;
      out.textContent = it.fmt(v);
      inp.oninput = function () { work[it.k] = +inp.value; out.textContent = it.fmt(+inp.value); preview(true); };
      inp.onchange = commit;
    } else if (it.type === 'check') {
      wrap.className = 'check';
      wrap.innerHTML = '<input type="checkbox"> ' + esc(it.label);
      var cb = wrap.querySelector('input');
      cb.checked = !!v;
      cb.onchange = function () {
        work[it.k] = cb.checked;
        if (it.k === 'eyesKeepAngle' && cb.checked) {
          if (!DA.eyes.state.running) { DA.ui.toast(T('צריך קודם להפעיל מעקב עיניים')); }
          else if (DA.eyes.state.distanceCm) work.refDistanceCm = DA.eyes.state.distanceCm;
        }
        preview(true); commit();
      };
    } else if (it.type === 'select') {
      wrap.innerHTML = esc(it.label) + '<select></select>';
      var sel = wrap.querySelector('select');
      it.options().forEach(function (o) {
        var op = document.createElement('option'); op.value = o[0]; op.textContent = o[1]; sel.appendChild(op);
      });
      sel.value = v == null ? '' : v;
      sel.onchange = function () { work[it.k] = sel.value || null; preview(true); commit(); };
    } else if (it.type === 'themes') {
      wrap.innerHTML = esc(it.label) + '<div class="themes"></div>';
      var tb = wrap.querySelector('.themes');
      DA.settings.THEMES.forEach(function (t) {
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'theme-swatch' + (t.id === v ? ' sel' : '');
        b.style.background = t.bg; b.style.color = t.fg;
        b.title = t.label; b.textContent = T('אב');
        b.onclick = function () {
          work.theme = t.id;
          tb.querySelectorAll('.theme-swatch').forEach(function (x) { x.classList.remove('sel'); });
          b.classList.add('sel');
          preview(true); commit();
        };
        tb.appendChild(b);
      });
    }
    return wrap;
  }

  function preview(live) {
    previewLens.apply(work, null); // typography/colour preview; the warp is shown in the real view
    if (live) ctx.previewSettings(work);
  }
  function commit() { ctx.updateSettings(work); }

  DA.drawer = { init: init, open: open, close: close };
})(typeof window !== 'undefined' ? window : globalThis);
