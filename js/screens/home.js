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
      if (!p) { DA.ui.toast('לא מצאתי קורא עם הקוד הזה'); return; }
      $('codeInput').value = '';
      ctx.setProfile(p.id); ctx.go('hub');
    });
    $('backupBtn').onclick = backup;
    $('restoreBtn').onclick = function () { $('restoreFile').click(); };
    $('restoreFile').onchange = function () { if (this.files[0]) restore(this.files[0]); this.value = ''; };
    ctx.profiles.onChange(function () { if (ctx.current() === 'home') renderHome(); });
  }

  function kindLabel(p) { return p.kind === 'adult' ? '🧑 מבוגר/ת' : '🧒 ילד/ה'; }

  function renderHome() {
    var list = ctx.profiles.list();
    var box = $('profileGrid');
    box.innerHTML = '';
    list.forEach(function (p) {
      var card = document.createElement('div');
      card.className = 'profile-card';
      card.innerHTML = '<button class="pc-open"><span class="avatar">' + esc(p.emoji) + '</span><span class="pname">' + esc(p.name) +
        '</span><span class="pkind">' + kindLabel(p) + '</span></button><button class="pc-del" title="מחיקה">✕</button>';
      card.querySelector('.pc-open').onclick = function () { ctx.setProfile(p.id); ctx.go('hub'); };
      card.querySelector('.pc-del').onclick = function () { deleteProfile(p); };
      box.appendChild(card);
    });
    $('whoSection').style.display = list.length ? '' : 'none';
    $('registerTitle').textContent = list.length ? 'להוסיף קורא חדש' : 'בואו נתחיל: מי הקורא הראשון?';
  }

  function newProfile(kind) {
    var dlg = $('profileDialog');
    $('profileName').value = '';
    setKind(kind);
    renderEmojiPick(DA.AVATARS[Math.floor(Math.random() * DA.AVATARS.length)]);
    $('profileDialogTitle').textContent = kind === 'adult' ? 'הרשמה של מבוגר/ת' : 'הרשמה של ילד/ה';
    $('profileDelete').style.display = 'none';
    dlg.returnValue = '';
    dlg.onclose = function () {
      if (dlg.returnValue !== 'ok') return;
      var name = $('profileName').value.trim();
      if (!name) { DA.ui.toast('צריך לכתוב שם'); return; }
      var p = ctx.profiles.create(name, selectedEmoji, getKind());
      ctx.setProfile(p.id);
      ctx.go('hub');
      DA.ui.tell('שלום ' + p.name + '! הקוד האישי שלך הוא ' + p.code + '. בעזרתו אפשר למצוא את הפרופיל במהירות.');
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
    DA.ui.ask('למחוק את ' + p.name + '? יימחקו גם ההגדרות, המשחקים והכיולים שלו/ה. אי אפשר לשחזר (אלא מגיבוי).', 'מחיקה').then(function (y) {
      if (!y) return;
      ctx.store.listTrials().forEach(function (s) {
        var t = ctx.store.getTrial(s.id);
        if (t && t.profileId === p.id) { ctx.store.deleteTrial(s.id); DA.cloud.remove('trials', s.id); }
      });
      ctx.profiles.removeSessionsFor(p.id);
      ctx.profiles.remove(p.id);
      if (ctx.profiles.currentId() === p.id) ctx.setProfile(null);
      DA.ui.toast(p.name + ' נמחק/ה');
      if (ctx.current() !== 'home') ctx.go('home'); else renderHome();
    });
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
    ctx.profiles.onChange(function () { if (ctx.current() === 'hub') renderHub(); });
  }

  function renderHub() {
    var p = ctx.profile();
    if (!p) { ctx.go('home'); return; }
    $('hubAvatar').textContent = p.emoji;
    $('hubHello').textContent = 'שלום, ' + p.name + '!';
    $('hubKind').textContent = kindLabel(p);
    $('hubCode').textContent = p.code;
    $('hubCurrent').textContent = DA.settings.describe(p.settings);
    $('bestBtn').disabled = !p.best;
    $('bestInfo').textContent = p.best ? DA.settings.describe(p.best.settings) : 'עדיין לא נקבע. אחרי המשחק או בהגדרות אפשר לקבוע "המצב שלי".';

    var sessions = ctx.profiles.sessionsFor(p.id);
    var hasCal = !!ctx.opsFor(p.settings);
    // guide the first steps
    var tip;
    if (!sessions.length) tip = '👇 בפעם הראשונה מתחילים ב<b>משחק ההתאמה</b> (כ־5 דקות). הוא לומד מה הכי ברור לך.';
    else if (p.kind === 'adult' && !hasCal) tip = 'רואים קווים עקומים או גלים? אפשר לעשות <b>כיול עיוות</b>. אם לא, אפשר לעבור ישר ל<b>קריאה</b>.';
    else tip = 'הכול מוכן. בחרו <b>לקרוא</b>, או שחקו שוב כדי לעדכן את ההתאמה.';
    $('hubTip').innerHTML = tip;
    $('tileLearn').classList.toggle('first', !sessions.length);
    $('tileLearnBadge').style.display = sessions.length ? 'none' : '';
    $('tileCalSub').textContent = hasCal ? '✓ יש כיול. אפשר לעדכן אותו' : 'למי שרואה קווים עקומים. עדיף עם מבוגר';

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
      DA.ui.tell('שוחזרו ' + np + ' קוראים, ' + ns + ' משחקים ו־' + nt + ' כיולים.');
      renderHome();
    }).catch(function (e) { DA.ui.tell('קובץ גיבוי לא תקין: ' + e.message); });
  }

  DA.screens.home = { init: homeInit, enter: renderHome, leave: function () {} };
  DA.screens.hub = { init: hubInit, enter: renderHub, leave: function () {} };
})(typeof window !== 'undefined' ? window : globalThis);
