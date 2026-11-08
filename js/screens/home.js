/*
 * עין טובה — Home (welcome, who is reading, registration of a child or an adult) and
 * Hub (the reader's start page: game, calibration, reading, "my mode", eye tracking).
 * One device, many readers: each picks their card or types their personal code.
 */
(function (root) {
  'use strict';
  var DA = root.DA;
  DA.screens = DA.screens || {};
  var $ = DA.ui.$, esc = DA.ui.esc;
  var ctx;

  // ================= HOME =================
  function homeInit(c) {
    ctx = c;
    $('newChildBtn').onclick = function () { newProfile('child'); };
    $('newAdultBtn').onclick = function () { newProfile('adult'); };
    $('codeForm').addEventListener('submit', function (e) {
      e.preventDefault();
      var p = ctx.profiles.findByCode($('codeInput').value);
      if (!p) { DA.ui.toast(T('לא מצאתי קורא עם הקוד הזה')); return; }
      $('codeInput').value = '';
      ctx.setProfile(p.id); ctx.go('hub');
    });
    $('backupBtn').onclick = backup;
    initSync();
    $('restoreBtn').onclick = function () { $('restoreFile').click(); };
    $('restoreFile').onchange = function () { if (this.files[0]) restore(this.files[0]); this.value = ''; };
    ctx.profiles.onChange(function () { if (ctx.current() === 'home') renderHome(); });
  }

  function kindLabel(p) { return p.kind === 'adult' ? T('🧑 מבוגר/ת') : T('🧒 ילד/ה'); }

  function renderHome() {
    var list = ctx.profiles.list();
    var box = $('profileGrid');
    box.innerHTML = '';
    list.forEach(function (p) {
      var card = document.createElement('div');
      card.className = 'profile-card';
      card.innerHTML = '<button class="pc-open"><span class="avatar">' + esc(p.emoji) + '</span><span class="pname">' + esc(p.name) +
        '</span><span class="pkind">' + kindLabel(p) + T('</span></button><button class="pc-del" title="מחיקה">✕</button>');
      card.querySelector('.pc-open').onclick = function () { ctx.setProfile(p.id); ctx.go('hub'); };
      card.querySelector('.pc-del').onclick = function () { deleteProfile(p); };
      box.appendChild(card);
    });
    $('whoSection').style.display = list.length ? '' : 'none';
    $('registerTitle').textContent = list.length ? T('להוסיף קורא חדש') : T('בואו נתחיל: מי הקורא הראשון?');
  }

  function newProfile(kind) {
    var dlg = $('profileDialog');
    $('profileName').value = '';
    setKind(kind);
    renderEmojiPick(DA.AVATARS[Math.floor(Math.random() * DA.AVATARS.length)]);
    $('profileDialogTitle').textContent = kind === 'adult' ? T('הרשמה של מבוגר/ת') : T('הרשמה של ילד/ה');
    $('profileDelete').style.display = 'none';
    dlg.returnValue = '';
    dlg.onclose = function () {
      if (dlg.returnValue !== 'ok') return;
      var name = $('profileName').value.trim();
      if (!name) { DA.ui.toast(T('צריך לכתוב שם')); return; }
      var p = ctx.profiles.create(name, selectedEmoji, getKind());
      ctx.setProfile(p.id);
      ctx.go('hub');
      DA.ui.tell(T('שלום ') + p.name + T('! הקוד האישי שלך הוא ') + p.code + T('. בעזרתו אפשר למצוא את הפרופיל במהירות.'));
    };
    dlg.showModal();
    setTimeout(function () { $('profileName').focus(); }, 30);
  }

  function setKind(k) {
    document.querySelectorAll('input[name=pkind]').forEach(function (r) { r.checked = r.value === (k || 'child'); });
  }
  function getKind() {
    var r = document.querySelector('input[name=pkind]:checked');
    return r ? r.value : 'child';
  }

  function deleteProfile(p) {
    DA.ui.ask(T('למחוק את ') + p.name + T('? יימחקו גם ההגדרות, המשחקים והכיולים שלו/ה. אי אפשר לשחזר (אלא מגיבוי).'), T('מחיקה')).then(function (y) {
      if (!y) return;
      ctx.store.listTrials().forEach(function (s) {
        var t = ctx.store.getTrial(s.id);
        if (t && t.profileId === p.id) { ctx.store.deleteTrial(s.id); DA.cloud.remove('trials', s.id); }
      });
      ctx.profiles.removeSessionsFor(p.id);
      ctx.profiles.remove(p.id);
      if (ctx.profiles.currentId() === p.id) ctx.setProfile(null);
      DA.ui.toast(p.name + T(' נמחק/ה'));
      if (ctx.current() !== 'home') ctx.go('home'); else renderHome();
    });
  }

  // ---- encrypted sync between devices (standalone site) ----
  function initSync() {
    if (!DA.sync.available()) return;
    $('syncCard').style.display = '';
    $('syncCreate').onclick = function () {
      var c = DA.sync.newCode();
      DA.sync.enable(c).then(renderSync);
      renderSync();
      DA.ui.tell(T('קוד המשפחה: ') + c + T('. מקלידים אותו בכל מכשיר נוסף, בכרטיס "סנכרון בין מכשירים". כדאי לשמור אותו במקום בטוח.'));
    };
    $('syncJoin').addEventListener('submit', function (e) {
      e.preventDefault();
      var n = DA.sync.normalize($('syncCodeIn').value);
      if (n.length !== 16) { DA.ui.toast(T('הקוד צריך להכיל 16 תווים')); return; }
      var c = n.match(/.{4}/g).join('-');
      DA.sync.enable(c).then(function (r) { renderSync(); renderHome(); if (r && r.ok) DA.ui.toast(T('✓ המכשיר מחובר לסנכרון')); });
      $('syncCodeIn').value = '';
      renderSync();
    });
    $('syncCopy').onclick = function () {
      var c = DA.sync.code();
      if (navigator.clipboard) navigator.clipboard.writeText(c).then(function () { DA.ui.toast(T('הקוד הועתק')); }, function () {});
    };
    $('syncNowBtn').onclick = function () { DA.sync.syncNow().then(function () { renderHome(); }); };
    $('syncLeave').onclick = function () {
      DA.ui.ask(T('לנתק את המכשיר הזה מהסנכרון? הנתונים במכשיר נשארים. כדי לחבר שוב צריך את קוד המשפחה.'), T('ניתוק')).then(function (y) {
        if (y) { DA.sync.disable(); renderSync(); }
      });
    };
    renderSync();
  }
  function renderSync() {
    if (!DA.sync.available()) return;
    var c = DA.sync.code();
    $('syncOff').style.display = c ? 'none' : '';
    $('syncOn').style.display = c ? '' : 'none';
    if (c) $('syncCodeShow').textContent = c;
  }

  var selectedEmoji = DA.AVATARS[0];
  function renderEmojiPick(sel) {
    selectedEmoji = sel;
    var box = $('emojiPick');
    box.innerHTML = '';
    DA.AVATARS.forEach(function (e) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'emoji-opt' + (e === selectedEmoji ? ' sel' : '');
      b.textContent = e;
      b.onclick = function () { renderEmojiPick(e); };
      box.appendChild(b);
    });
  }

  // ================= HUB =================
  function hubInit(c) {
    ctx = c;
    $('tileRead').onclick = function () { ctx.go('read'); };
    $('tileLearn').onclick = function () { ctx.go('learn'); };
    $('tileCalibrate').onclick = function () { ctx.go('calibrate'); };
    $('bestBtn').onclick = restoreBest;
    $('pinBtn').onclick = pinCurrent;
    $('settingsBtn').onclick = function () { DA.drawer.open(); };
    $('editProfileBtn').onclick = editProfile;
    DA.eyePanel.bindSwitch($('hubEyesToggle'));
    $('hubEyesInfo').onclick = function () { DA.eyePanel.info(); };
    $('hubReadTest').onclick = function () { ctx.go('readtest'); };
    $('hubFieldTest').onclick = function () { ctx.go('fieldtest'); };
    $('hubCard').onclick = function () { DA.device.calibrate(); };
    ctx.profiles.onChange(function () { if (ctx.current() === 'hub') renderHub(); });
  }

  function renderHub() {
    var p = ctx.profile();
    if (!p) { ctx.go('home'); return; }
    $('hubAvatar').textContent = p.emoji;
    $('hubHello').textContent = T('שלום, ') + p.name + '!';
    $('hubKind').textContent = kindLabel(p);
    $('hubCode').textContent = p.code;
    $('hubCurrent').textContent = DA.settings.describe(p.settings);
    $('bestBtn').disabled = !p.best;
    $('bestInfo').textContent = p.best ? DA.settings.describe(p.best.settings) : T('עדיין לא נקבע. אחרי המשחק או בהגדרות אפשר לקבוע "המצב שלי".');

    var sessions = ctx.profiles.sessionsFor(p.id);
    var hasCal = !!ctx.opsFor(p.settings);
    // guide the first steps
    var tip;
    if (!sessions.length) tip = T('👇 בפעם הראשונה מתחילים ב<b>משחק ההתאמה</b> (כ־5 דקות). הוא לומד מה הכי ברור לך.');
    else if (p.kind === 'adult' && !hasCal) tip = T('רואים קווים עקומים או גלים? אפשר לעשות <b>כיול עיוות</b>. אם לא, אפשר לעבור ישר ל<b>קריאה</b>.');
    else tip = T('הכול מוכן. בחרו <b>לקרוא</b>, או שחקו שוב כדי לעדכן את ההתאמה.');
    $('hubTip').innerHTML = tip;
    DA.screens.history.hubCard();
    $('tileLearn').classList.toggle('first', !sessions.length);
    $('tileLearnBadge').style.display = sessions.length ? 'none' : '';
    $('tileCalSub').textContent = hasCal ? T('✓ יש כיול. אפשר לעדכן אותו') : T('למי שרואה קווים עקומים. עדיף עם מבוגר');

    var box = $('pinnedList');
    box.innerHTML = '';
    (p.pinned || []).forEach(function (st) {
      var row = document.createElement('div');
      row.className = 'pinned-item';
      row.innerHTML = '<button class="apply">📌 ' + esc(st.name) + '</button><span class="muted">' + esc(DA.settings.describe(st.settings)) + '</span>';
      var del = document.createElement('button'); del.className = 'danger small'; del.textContent = '✕'; del.title = T('מחיקה');
      del.onclick = function () {
        DA.ui.ask(T('למחוק את המצב "') + st.name + '"?', T('מחיקה')).then(function (y) {
          if (!y) return;
          p.pinned = p.pinned.filter(function (x) { return x.id !== st.id; });
          ctx.profiles.save(p);
        });
      };
      row.querySelector('.apply').onclick = function () { ctx.updateSettings(st.settings); DA.ui.toast(T('הופעל: ') + st.name); };
      row.appendChild(del);
      box.appendChild(row);
    });

    // latest result of each kind: game, reading test, field map
    var shown = {}, parts = [];
    sessions.forEach(function (s) {
      var k = s.kind || 'learn';
      if (shown[k]) return;
      shown[k] = true;
      var scr = k === 'mnread' ? DA.screens.readtest : k === 'fieldmap' ? DA.screens.fieldtest : DA.screens.learn;
      parts.push('<div class="learned-item">' + scr.summaryHtml(s) + '</div>');
    });
    $('hubLearned').innerHTML = parts.length ? parts.join('') : T('<span class="muted">עוד לא שיחקנו. המשחק ילמד מה הכי ברור לך.</span>');
  }

  function restoreBest() {
    var p = ctx.profile();
    if (!p || !p.best) return;
    ctx.updateSettings(p.best.settings);
    DA.ui.toast(T('⭐ חזרנו למצב שלך'));
  }

  function pinCurrent() {
    var p = ctx.profile();
    DA.ui.prompt(T('שם למצב הזה (למשל "קריאה בערב"):'), '').then(function (name) {
      if (!name) return;
      ctx.profiles.pin(p, name, p.settings);
      DA.ui.toast(T('📌 נשמר: ') + name);
    });
  }

  function editProfile() {
    var p = ctx.profile();
    var dlg = $('profileDialog');
    $('profileDialogTitle').textContent = T('עריכת פרופיל');
    $('profileName').value = p.name;
    setKind(p.kind);
    renderEmojiPick(p.emoji);
    $('profileDelete').style.display = '';
    dlg.returnValue = '';
    dlg.onclose = function () {
      $('profileDelete').style.display = 'none';
      if (dlg.returnValue === 'delete') { deleteProfile(p); return; }
      if (dlg.returnValue !== 'ok') return;
      p.name = $('profileName').value.trim() || p.name;
      p.emoji = selectedEmoji;
      p.kind = getKind();
      ctx.profiles.save(p);
    };
    dlg.showModal();
  }

  // ---- backup / restore of everything on this device (important in the standalone version) ----
  function backup() {
    var st = ctx.store;
    var sessions = [];
    ctx.profiles.list().forEach(function (p) { sessions = sessions.concat(ctx.profiles.sessionsFor(p.id)); });
    var bundle = { schema: 'da.backup/1', app: 'good-eye', softwareVersion: DA.VERSION, exportedAt: new Date().toISOString(),
      profiles: ctx.profiles.list(), sessions: sessions, trials: st.allTrials() };
    DA.ui.download('good-eye-backup-' + DA.ui.stamp() + '.json', JSON.stringify(bundle), 'application/json');
  }
  function restore(f) {
    f.text().then(function (t) {
      var b = JSON.parse(t);
      var np = 0, ns = 0, nt = 0;
      (b.profiles || []).forEach(function (p) { if (p && p.id && p.schema) { ctx.profiles.save(p); np++; } });
      (b.sessions || []).forEach(function (s) { if (s && s.id) { ctx.profiles.saveSession(s); ns++; } });
      nt = ctx.store.importBundle(b.trials || []);
      DA.ui.tell(T('שוחזרו ') + np + T(' קוראים, ') + ns + T(' משחקים ו־') + nt + T(' כיולים.'));
      renderHome();
    }).catch(function (e) { DA.ui.tell(T('קובץ גיבוי לא תקין: ') + e.message); });
  }

  DA.screens.home = { init: homeInit, enter: renderHome, leave: function () {} };
  DA.screens.hub = { init: hubInit, enter: renderHub, leave: function () {} };
})(typeof window !== 'undefined' ? window : globalThis);
