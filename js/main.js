/*
 * DA — Main: shared context, screen router (#home, #hub, #calibrate, #learn, #read) and header.
 */
(function (root) {
  'use strict';
  var DA = root.DA;
  var $ = DA.ui.$;
  var store = new DA.storage.Store();
  var profiles = new DA.ProfileStore(store);
  var SCREENS = ['home', 'hub', 'calibrate', 'learn', 'read', 'readtest', 'fieldtest', 'history', 'tools', 'lab'];
  var NEEDS_PROFILE = { hub: 1, calibrate: 1, learn: 1, read: 1, readtest: 1, fieldtest: 1, history: 1, tools: 1, lab: 1 };
  var cur = null;

  var ctx = {
    store: store,
    profiles: profiles,
    profile: function () { return profiles.get(profiles.currentId()); },
    setProfile: function (id) {
      profiles.setCurrent(id); renderHeader();
      var p = ctx.profile(); DA.eyes.setUsualDistance(p && p.settings.refDistanceCm);
    },
    current: function () { return cur; },
    go: function (name) { if (location.hash !== '#' + name) location.hash = name; else show(name); },
    /** Warp ops of the calibration a settings object points to (or null). */
    opsFor: function (s) {
      if (!s || !s.calibrationId) return null;
      var t = store.getTrial(s.calibrationId);
      return t && t.model && t.model.ops && t.model.ops.length ? t.model.ops : null;
    },
    /**
     * Everything the lens needs to place a calibration correctly: ops, the size the grid had on
     * screen (px), where the eye looked (0..1), and a scale for a different viewing distance.
     */
    warpFor: function (s) {
      var ops = ctx.opsFor(s);
      if (!ops) return null;
      var t = store.getTrial(s.calibrationId) || {}, st = t.stimulus || {}, d = t.display || {};
      var fix = st.fixationPoint && DA.GridInstrument && DA.GridInstrument.FIX[st.fixationPos] || [0.5, 0.5];
      var calDist = t.viewing && +t.viewing.distanceCm, nowDist = DA.eyes.state.running && DA.eyes.state.distanceCm;
      return { ops: ops, sizePx: d.stimulusSizePx || null, fix: fix, scale: calDist && nowDist ? calDist / nowDist : 1 };
    },
    /** The eye a calibration was made for ('right' | 'left' | 'both' | null). */
    calEye: function (s) {
      if (!s || !s.calibrationId) return null;
      var t = store.getTrial(s.calibrationId);
      return t && t.viewing ? t.viewing.eye || 'right' : 'right';
    },
    /** Merge a patch into the reader's settings, save, and refresh what is on screen. */
    updateSettings: function (patch) {
      var p = ctx.profile();
      if (!p) return;
      p.settings = DA.settings.normalize(Object.assign({}, p.settings, patch));
      profiles.save(p);
      refreshScreens();
    },
    /** Show settings live without saving (while a slider moves). */
    previewSettings: function (s) { if (cur === 'read') DA.screens.read.refresh(DA.settings.normalize(s)); }
  };

  function refreshScreens(preview) {
    if (cur === 'read') DA.screens.read.refresh(preview);
    if (cur === 'hub') DA.screens.hub.enter();
    renderHeader();
    DA.copilot.update();
  }

  function show(name) {
    if (SCREENS.indexOf(name) < 0) name = 'home';
    if (NEEDS_PROFILE[name] && !ctx.profile()) name = 'home';
    if (cur && cur !== name && DA.screens[cur].leave) DA.screens[cur].leave();
    cur = name;
    SCREENS.forEach(function (s) { $('screen-' + s).classList.toggle('active', s === name); });
    document.body.setAttribute('data-screen', name);
    renderHeader();
    DA.drawer.close();
    DA.screens[name].enter();
    glassesNotes();
    smallScreenNotes();
    setTimeout(function () { DA.copilot.update(); DA.speech.attach(); }, 60);
    root.scrollTo(0, 0);
    var scr = $('screen-' + name); if (scr && document.activeElement && document.activeElement.tagName === 'BODY') scr.focus({ preventScroll: true });
  }

  /** Interface look for low vision: high-contrast light mode and a larger interface. */
  function applyUi(p) {
    var s = p ? p.settings : {}, mode = s.uiContrast || 'auto';
    var hc = mode === 'high' || (mode === 'auto' && root.matchMedia && (matchMedia('(prefers-contrast: more)').matches || matchMedia('(forced-colors: active)').matches));
    document.documentElement.classList.toggle('hc', !!hc);
    document.documentElement.style.setProperty('--uiz', String(+s.uiScale || 1));
    document.documentElement.classList.toggle('ui-zoomed', (+s.uiScale || 1) > 1);
  }
  function renderHeader() {
    var p = ctx.profile();
    applyUi(p);
    $('whoChip').style.display = p ? '' : 'none';
    if (p) { $('whoEmoji').innerHTML = DA.ui.avatar(p, 'xs'); $('whoName').textContent = p.name; }
    $('navHome').style.display = cur === 'hub' || cur === 'home' ? 'none' : '';
  }

  function boot() {
    DA.i18n.apply(document.body);
    accessibility();
    document.querySelectorAll('.a11y-link').forEach(function (b) { b.onclick = function () { document.getElementById('a11yDialog').showModal(); }; });
    var openAbout = function () { var d = document.getElementById('aboutDialog'); d.querySelectorAll('details').forEach(function (x) { x.open = false; }); d.showModal(); d.scrollTop = 0; };
    document.querySelectorAll('.about-link, #aboutBtn').forEach(function (b) { b.onclick = openAbout; });
    var bar = document.querySelector('.topbar');
    var setHdr = function () { if (bar) document.documentElement.style.setProperty('--hdr', bar.offsetHeight + 'px'); };
    setHdr();
    window.addEventListener('resize', setHdr);
    if (root.ResizeObserver && bar) new ResizeObserver(setHdr).observe(bar);
    document.title = T('עין טובה · כלי עזר, לא מכשיר רפואי');
    $('langBtn').textContent = DA.i18n.lang === 'he' ? 'English' : String.fromCharCode(0x5E2, 0x5D1, 0x5E8, 0x5D9, 0x5EA); // "עברית" — always shown in Hebrew
    $('langBtn').onclick = function () { DA.i18n.setLang(DA.i18n.lang === 'he' ? 'en' : 'he'); };
    DA.settings.loadFonts();
    $('version').textContent = 'v' + DA.VERSION;
    $('whoChip').onclick = function () { ctx.go('home'); };
    $('navHome').onclick = function () { ctx.go(ctx.profile() ? 'hub' : 'home'); };
    DA.cloud.onStatus(function (msg, warn) {
      var el = $('cloudDot');
      el.title = msg; el.className = 'cloud-dot ' + (warn ? 'warn' : 'ok');
      var cs = $('cloudStatus'); if (cs) { cs.textContent = msg; cs.style.color = warn ? '#b26a00' : '#0a7a3f'; }
    });
    var localDot = function () { $('cloudDot').title = T('שמירה במכשיר הזה'); $('cloudDot').className = 'cloud-dot local'; };
    if (!DA.cloud.available()) localDot();
    else DA.cloud.connect().then(function (ok) { if (!ok) localDot(); });   // claude.ai without a shared store: data stays on this device

    DA.drawer.init(ctx);
    DA.eyePanel.init(ctx);
    DA.copilot.init(ctx);
    DA.icons.apply(document.body);
    DA.speech.init(ctx);
    SCREENS.forEach(function (s) { DA.screens[s].init(ctx); });
    var p0 = ctx.profile(); DA.eyes.setUsualDistance(p0 && p0.settings.refDistanceCm);
    profiles.sync();
    ctx.refresh = function () { if (DA.screens[cur] && DA.screens[cur].enter && (cur === 'home' || cur === 'hub' || cur === 'history')) DA.screens[cur].enter(); renderHeader(); };
    DA.sync.init(ctx, function (msg, warn) { var el = $('syncStatus'); if (el) { el.textContent = msg; el.style.color = warn ? '#b26a00' : ''; } });
    profiles.onChange(renderHeader);

    root.addEventListener('hashchange', function () { show(location.hash.slice(1)); });
    registerOffline();
    var start = location.hash.slice(1) || (ctx.profile() ? 'hub' : 'home');
    show(start);
  }

  /**
   * Glasses reminder: calibration and reading must use the same glasses (or lenses) the reader
   * normally reads with — otherwise the learned settings will not fit.
   */
  var GLASSES = { reading: T('משקפי קריאה'), distance: T('משקפי ראייה'), multifocal: T('מולטיפוקל'), contacts: T('עדשות מגע'), none: T('בלי משקפיים') };
  function glassesText(p) {
    var g = p && p.glasses;
    if (g === 'none') return '';
    var base = {
      reading: T('מרכיבים את משקפי הקריאה, כמו בקריאה רגילה.'),
      distance: T('מרכיבים את המשקפיים. אם יש משקפי קריאה או מסך, עדיף אותם.'),
      multifocal: T('מולטיפוקל: מסתכלים דרך החלק התחתון של העדשה (החלק של הקריאה), ומזיזים את הראש ולא רק את העיניים.'),
      contacts: T('מרכיבים את עדשות המגע, כמו בקריאה רגילה.')
    }[g] || T('מרכיבים משקפיים או עדשות? משתמשים בעין טובה איתם, כמו בקריאה רגילה.');
    return base + ' ' + T('חשוב: אותם משקפיים גם בטיסות הניסוי וגם בקריאה.');
  }
  function glassesNotes() {
    var t = glassesText(ctx.profile());
    document.querySelectorAll('[data-glasses]').forEach(function (e) { e.textContent = t; e.style.display = t ? '' : 'none'; });
  }
  /** On a small screen, say that calibration and measurements work better on a computer or tablet. */
  function smallScreenNotes() {
    // a phone-sized device (or a very narrow window): the device's screen, not just this window
    var small = Math.min(root.screen.width, root.screen.height) < 600 || root.innerWidth < 520;
    var t = small ? T('המסך הזה קטן. לטיסות הניסוי ולמדידות עדיף מחשב או טאבלט. אפשר להמשיך, אבל התוצאות יתאימו רק למכשיר הזה.') : '';
    document.querySelectorAll('[data-small-screen]').forEach(function (e) { e.textContent = t; e.style.display = t ? '' : 'none'; });
  }
  root.addEventListener('resize', function () { smallScreenNotes(); });

  ctx.glasses = function () { var p = ctx.profile(); return p ? (p.glasses || 'unknown') : 'unknown'; };

  /** Screen-reader and keyboard support: labels for icon buttons, landmarks, skip link. */
  function accessibility() {
    document.querySelectorAll('button[title]:not([aria-label]), select[title]:not([aria-label])').forEach(function (b) { b.setAttribute('aria-label', b.getAttribute('title')); });
    document.querySelectorAll('.screen').forEach(function (s) { s.setAttribute('role', 'main'); s.setAttribute('tabindex', '-1'); });
    $('skipLink').onclick = function (e) { e.preventDefault(); var s = document.querySelector('.screen.active'); if (s) s.focus(); };
    document.querySelectorAll('canvas').forEach(function (c) { if (!c.getAttribute('aria-label')) c.setAttribute('aria-label', T('אזור כיול גרפי')); });
  }

  /** Offline support for the standalone site (claude.ai does not allow service workers). */
  function registerOffline() {
    if (!('serviceWorker' in navigator) || DA.cloud.available()) return;
    if (location.protocol !== 'https:' && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') return;
    var hadController = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.register('sw.js').then(function () {
      if (!hadController) {
        try { if (!localStorage.getItem('da.v1.offlineToast')) { localStorage.setItem('da.v1.offlineToast', '1'); DA.ui.toast(T('עין טובה מוכנה לעבודה גם בלי אינטרנט')); } } catch (e) { /* ignore */ }
      }
    }).catch(function () {});
    navigator.serviceWorker.addEventListener('controllerchange', function () {
      if (hadController) DA.ui.toast(T('יש גרסה חדשה. היא תופעל בפתיחה הבאה.'));
    });
  }

  DA.main = ctx;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})(typeof window !== 'undefined' ? window : globalThis);
