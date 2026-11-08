/*
 * DA — Home (who is reading?) and Hub (the reader's personal start page).
 * One device, many readers: each picks their avatar or types their personal code.
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
    $('newProfileBtn').onclick = newProfile;
    $('codeForm').addEventListener('submit', function (e) {
      e.preventDefault();
      var p = ctx.profiles.findByCode($('codeInput').value);
      if (!p) { DA.ui.toast('לא מצאתי קורא עם הקוד הזה'); return; }
      $('codeInput').value = '';
      ctx.setProfile(p.id); ctx.go('hub');
    });
    ctx.profiles.onChange(function () { if (ctx.current() === 'home') renderHome(); });
  }

  function renderHome() {
    var box = $('profileGrid');
    box.innerHTML = '';
    ctx.profiles.list().forEach(function (p) {
      var b = document.createElement('button');
      b.className = 'profile-card';
      b.innerHTML = '<span class="avatar">' + esc(p.emoji) + '</span><span class="pname">' + esc(p.name) + '</span>';
      b.onclick = function () { ctx.setProfile(p.id); ctx.go('hub'); };
      box.appendChild(b);
    });
    $('homeEmpty').style.display = ctx.profiles.list().length ? 'none' : '';
  }

  function newProfile() {
    var dlg = $('profileDialog');
    $('profileName').value = '';
    renderEmojiPick(DA.AVATARS[Math.floor(Math.random() * DA.AVATARS.length)]);
    $('profileDialogTitle').textContent = 'קורא/ת חדש/ה';
    dlg.returnValue = '';
    dlg.onclose = function () {
      if (dlg.returnValue !== 'ok') return;
      var name = $('profileName').value.trim();
      if (!name) { DA.ui.toast('צריך שם'); return; }
      var p = ctx.profiles.create(name, selectedEmoji);
      ctx.setProfile(p.id);
      ctx.go('hub');
      DA.ui.tell('שלום ' + p.name + '! הקוד האישי שלך הוא ' + p.code + '. עם הקוד הזה אפשר להיכנס מכל מכשיר.');
    };
    dlg.showModal();
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
    $('hubEyes').onclick = function () { DA.eyePanel.open(); };
    $('backupBtn').onclick = backup;
    $('restoreBtn').onclick = function () { $('restoreFile').click(); };
    $('restoreFile').onchange = function () { if (this.files[0]) restore(this.files[0]); this.value = ''; };
    ctx.profiles.onChange(function () { if (ctx.current() === 'hub') renderHub(); });
  }

  function renderHub() {
    var p = ctx.profile();
    if (!p) { ctx.go('home'); return; }
    $('hubAvatar').textContent = p.emoji;
    $('hubHello').textContent = 'שלום, ' + p.name + '!';
    $('hubCode').textContent = p.code;
    $('hubCurrent').textContent = DA.settings.describe(p.settings);
    $('bestBtn').disabled = !p.best;
    $('bestInfo').textContent = p.best ? DA.settings.describe(p.best.settings) : 'עדיין לא נקבע. אחרי המשחק או בהגדרות אפשר לקבוע "המצב שלי".';

    var box = $('pinnedList');
    box.innerHTML = '';
    (p.pinned || []).forEach(function (st) {
      var row = document.createElement('div');
      row.className = 'pinned-item';
      row.innerHTML = '<button class="apply">📌 ' + esc(st.name) + '</button><span class="muted">' + esc(DA.settings.describe(st.settings)) + '</span>';
      var del = document.createElement('button'); del.className = 'danger small'; del.textContent = '✕'; del.title = 'מחיקה';
      del.onclick = function () {
        DA.ui.ask('למחוק את המצב "' + st.name + '"?', 'מחיקה').then(function (y) {
          if (!y) return;
          p.pinned = p.pinned.filter(function (x) { return x.id !== st.id; });
          ctx.profiles.save(p);
        });
      };
      row.querySelector('.apply').onclick = function () { ctx.updateSettings(st.settings); DA.ui.toast('הופעל: ' + st.name); };
      row.appendChild(del);
      box.appendChild(row);
    });

    var sessions = ctx.profiles.sessionsFor(p.id);
    var last = sessions[0];
    $('hubLearned').innerHTML = last ? DA.screens.learn.summaryHtml(last) : '<span class="muted">עוד לא שיחקנו. המשחק ילמד מה הכי ברור לך.</span>';
  }

  function restoreBest() {
    var p = ctx.profile();
    if (!p || !p.best) return;
    ctx.updateSettings(p.best.settings);
    DA.ui.toast('⭐ חזרנו למצב שלך');
  }

  function pinCurrent() {
    var p = ctx.profile();
    DA.ui.prompt('שם למצב הזה (למשל "קריאה בערב"):', '').then(function (name) {
      if (!name) return;
      ctx.profiles.pin(p, name, p.settings);
      DA.ui.toast('📌 נשמר: ' + name);
    });
  }

  function editProfile() {
    var p = ctx.profile();
    var dlg = $('profileDialog');
    $('profileDialogTitle').textContent = 'עריכת פרופיל';
    $('profileName').value = p.name;
    renderEmojiPick(p.emoji);
    $('profileDelete').style.display = '';
    dlg.returnValue = '';
    dlg.onclose = function () {
      $('profileDelete').style.display = 'none';
      if (dlg.returnValue === 'delete') {
        DA.ui.ask('למחוק את ' + p.name + ' וכל ההגדרות שלו/ה? לא ניתן לשחזר.', 'מחיקה').then(function (y) {
          if (!y) return;
          ctx.profiles.remove(p.id); ctx.setProfile(null); ctx.go('home');
        });
        return;
      }
      if (dlg.returnValue !== 'ok') return;
      p.name = $('profileName').value.trim() || p.name;
      p.emoji = selectedEmoji;
      ctx.profiles.save(p);
    };
    dlg.showModal();
  }

  // ---- backup / restore of everything on this device (important in the standalone version) ----
  function backup() {
    var st = ctx.store;
    var sessions = [];
    ctx.profiles.list().forEach(function (p) { sessions = sessions.concat(ctx.profiles.sessionsFor(p.id)); });
    var bundle = { schema: 'da.backup/1', app: 'עין טובה', softwareVersion: DA.VERSION, exportedAt: new Date().toISOString(),
      profiles: ctx.profiles.list(), sessions: sessions, trials: st.allTrials() };
    DA.ui.download('ein-tova-backup-' + DA.ui.stamp() + '.json', JSON.stringify(bundle), 'application/json');
  }
  function restore(f) {
    f.text().then(function (t) {
      var b = JSON.parse(t);
      var np = 0, ns = 0, nt = 0;
      (b.profiles || []).forEach(function (p) { if (p && p.id && p.schema) { ctx.profiles.save(p); np++; } });
      (b.sessions || []).forEach(function (s) { if (s && s.id) { ctx.profiles.saveSession(s); ns++; } });
      nt = ctx.store.importBundle(b.trials || []);
      DA.ui.tell('שוחזרו ' + np + ' קוראים, ' + ns + ' משחקים ו־' + nt + ' כיולים.');
      renderHome();
    }).catch(function (e) { DA.ui.tell('קובץ גיבוי לא תקין: ' + e.message); });
  }

  DA.screens.home = { init: homeInit, enter: renderHome, leave: function () {} };
  DA.screens.hub = { init: hubInit, enter: renderHub, leave: function () {} };
})(typeof window !== 'undefined' ? window : globalThis);
