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
    root.scrollTo(0, 0);
  }

  function renderHeader() {
    var p = ctx.profile();
    $('whoChip').style.display = p ? '' : 'none';
    if (p) { $('whoEmoji').textContent = p.emoji; $('whoName').textContent = p.name; }
    $('navHome').style.display = cur === 'hub' || cur === 'home' ? 'none' : '';
  }

  function boot() {
    DA.i18n.apply(document.body);
    document.title = T('עין טובה');
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
    if (!DA.cloud.available()) { $('cloudDot').title = T('שמירה במכשיר הזה'); $('cloudDot').className = 'cloud-dot local'; }

    DA.drawer.init(ctx);
    DA.eyePanel.init(ctx);
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

  /** Offline support for the standalone site (claude.ai does not allow service workers). */
  function registerOffline() {
    if (!('serviceWorker' in navigator) || DA.cloud.available()) return;
    if (location.protocol !== 'https:' && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') return;
    var hadController = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.register('sw.js').then(function () {
      if (!hadController) {
        try { if (!localStorage.getItem('da.v1.offlineToast')) { localStorage.setItem('da.v1.offlineToast', '1'); DA.ui.toast(T('📶 עין טובה מוכנה לעבודה גם בלי אינטרנט')); } } catch (e) { /* ignore */ }
      }
    }).catch(function () {});
    navigator.serviceWorker.addEventListener('controllerchange', function () {
      if (hadController) DA.ui.toast(T('יש גרסה חדשה. היא תופעל בפתיחה הבאה.'));
    });
  }

  DA.main = ctx;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})(typeof window !== 'undefined' ? window : globalThis);
