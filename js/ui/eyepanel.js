/*
 * עין טובה — Eye-tracking opt-in, explanation and live status widget.
 * Off by default. Turning it on shows an explanation (purpose, limits of an ordinary camera,
 * privacy) and asks an adult to approve. Only numbers are used; no image is kept or sent.
 */
(function (root) {
  'use strict';
  var DA = root.DA;
  var $ = DA.ui.$;
  var ctx;

  var INFO_HTML =
    T('<h3>👁️ מעקב עיניים במצלמה — בשביל התאמה טובה יותר</h3>') +
    T('<p>כשהאפשרות פועלת, המצלמה של המחשב או הטלפון עוזרת לאפליקציה להבין <b>איך באמת קוראים</b>, ולא רק מה בוחרים בטיסת הניסוי:</p>') +
    '<ul>' +
    T('<li><b>📏 מרחק מהמסך</b>: מחושב לפי גודל הקשתית (החלק הצבעוני בעין). כך גודל האותיות מותאם למה שהעין רואה, גם כשיושבים קרוב או רחוק.</li>') +
    T('<li><b>🔍 התקרבות למסך</b>: מי שמתקרב תוך כדי קריאה כנראה צריך אותיות גדולות יותר. האפליקציה תציע להגדיל.</li>') +
    T('<li><b>🎯 מבט למרכז</b>: בכיול ובבדיקת תיקון העיוות חשוב להביט בנקודה האמצעית. המצלמה מזהה כשהמבט זז, ומבקשת לחזור למרכז.</li>') +
    T('<li><b>😴 עייפות ומאמץ</b>: מצמוצים רבים או צמצום עיניים. כך יודעים מתי לעשות הפסקה, ומתי תוצאות טיסת הניסוי פחות מדויקות.</li>') +
    '</ul>' +
    T('<h4>⚠️ מתי זה לא יעבוד, או יעבוד פחות טוב</h4>') +
    T('<p><b>לא יעבוד בכלל:</b></p>') +
    '<ul>' +
    T('<li>בתוך claude.ai, שחוסם את המצלמה. זה עובד רק באתר העצמאי של עין טובה.</li>') +
    T('<li>כשאין מצלמה, או כשלא אישרתם לדפדפן להשתמש בה.</li>') +
    T('<li>כשהפנים לא נראות במלואן: מחוץ לתמונה, ראש מסובב הצידה, או יד או מסכה שמסתירות את העיניים.</li>') +
    T('<li>במכשיר ישן או איטי מאוד. המדידה תהיה איטית או תיעצר.</li>') +
    '</ul>' +
    T('<p><b>יעבוד פחות טוב (המספרים יהיו רק הערכה):</b></p>') +
    '<ul>' +
    T('<li><b>תאורה:</b> חדר חשוך, אור חזק מאחורי הראש (חלון), או צל על הפנים.</li>') +
    T('<li><b>משקפיים:</b> השתקפויות בעדשות. משקפיים חזקים במיוחד, כמו משקפי הגדלה, משנים את גודל העין בתמונה, ואז <b>המרחק יוצא לא נכון</b>. כדאי לכייל מרחק ("שבו 40 ס״מ") עם המשקפיים שקוראים בהם.</li>') +
    T('<li><b>מרחק:</b> קרוב מאוד, פחות מ־20 ס״מ, או רחוק מאוד, יותר ממטר.</li>') +
    T('<li><b>תנועה:</b> ילדים שזזים הרבה. המדידה מחליקה את התנודות, אבל מגיבה לאט.</li>') +
    T('<li><b>מצבי עיניים:</b> ריצוד עיניים (ניסטגמוס) ופזילה מבלבלים את בדיקת "מבט למרכז". עפעף צונח או עין חצי סגורה מקשים לזהות מצמוץ. קשתית בהירה מאוד, למשל באלביניזם, קשה יותר לזיהוי. במצבים האלה כדאי להסתמך בעיקר על מדידת המרחק, או לכבות.</li>') +
    '</ul>' +
    T('<p><b>מה מצלמה רגילה לא יודעת לעשות אף פעם:</b></p>') +
    '<ul>' +
    T('<li>לדעת <b>על איזו מילה או אות בדיוק מסתכלים</b>. הדיוק הוא בערך "מרכז או צד".</li>') +
    T('<li>להזיז את <b>תיקון העיוות יחד עם המבט</b>. לזה צריך מכשיר ייעודי למעקב עיניים, שמחובר למחשב.</li>') +
    T('<li>לאבחן. זו <b>לא בדיקה רפואית</b> ולא תחליף לרופא עיניים.</li>') +
    '</ul>' +
    T('<h4>🔒 פרטיות</h4>') +
    T('<p>הכול קורה בתוך המכשיר. <b>שום תמונה או וידאו לא נשמרים ולא נשלחים לשום מקום</b>, רק מספרים כמו מרחק ומספר מצמוצים. אפשר לכבות בכל רגע, והדפדפן יבקש אישור לשימוש במצלמה.</p>');

  function init(c) {
    ctx = c;
    $('eyeInfoBody').innerHTML = INFO_HTML;
    $('eyeWidget').onclick = function () { openPanel(); };
    $('eyeOff').onclick = function () { DA.eyes.stop(); setPref(false); render(DA.eyes.state); };
    $('eyeCalib40').onclick = calib40;
    $('eyeCenter').onclick = centerBaseline;
    $('eyePreviewToggle').onchange = function () { showPreview(this.checked); };
    $('eyePanelClose').onclick = function () { $('eyePanel').classList.remove('open'); };
    $('eyeInfoBtn').onclick = info;
    DA.eyes.on(render);
    DA.eyes.on(updateSwitches);
    DA.eyes.on(maybeLeanAlert);
    // resume automatically if this reader turned it on before (camera permission is asked by the browser)
    if (DA.eyes.supported() && pref()) DA.eyes.start().catch(function () { /* stays off */ });
    render(DA.eyes.state);
  }

  function pref() { return ctx.store.getPref('eyesOn', false); }
  function setPref(v) { ctx.store.setPref('eyesOn', !!v); }

  /** Called from settings / hub: explain first, then ask an adult to approve. */
  function offer() {
    if (!DA.eyes.supported()) {
      DA.ui.tell(T('מעקב העיניים פועל רק בגרסה העצמאית של עין טובה (באתר שלה), ולא בתוך claude.ai, שחוסם את המצלמה.'));
      return;
    }
    var dlg = $('eyeInfoDialog');
    dlg.returnValue = '';
    $('eyeInfoOk').style.display = ''; $('eyeInfoCancel').textContent = T('לא עכשיו');
    dlg.onclose = function () {
      if (dlg.returnValue !== 'ok') return;
      DA.ui.toast(T('מפעיל מצלמה…'));
      DA.eyes.start().then(function () {
        setPref(true);
        DA.ui.toast(T('👁️ מעקב העיניים פועל'));
        openPanel();
      }).catch(function (e) {
        DA.ui.tell(T('לא הצלחתי להפעיל את המצלמה (') + ((e && e.name) || T('שגיאה')) + T('). בדקו שיש מצלמה ושאושרה גישה אליה בדפדפן.'));
      });
    };
    dlg.showModal();
  }

  function info() {
    var dlg = $('eyeInfoDialog');
    $('eyeInfoOk').style.display = 'none'; $('eyeInfoCancel').textContent = T('סגירה');
    dlg.returnValue = '';
    dlg.onclose = null;
    dlg.showModal();
  }

  function openPanel() {
    if (!DA.eyes.state.running) { offer(); return; }
    $('eyePanel').classList.add('open');
  }

  function showPreview(on) {
    var box = $('eyePreview');
    box.innerHTML = '';
    if (on && DA.eyes.video) {
      var v = DA.eyes.video;
      v.style.width = '100%'; v.style.transform = 'scaleX(-1)'; v.style.borderRadius = '8px';
      box.appendChild(v);
    }
  }

  function calib40() {
    DA.ui.ask(T('שבו כך שהעיניים יהיו בדיוק 40 ס״מ מהמסך (מדדו בסרגל), הביטו במסך ולחצו "מדוד". זה משפר את מדידת המרחק במכשיר הזה.'), T('מדוד')).then(function (y) {
      if (!y) return;
      DA.ui.toast(DA.eyes.calibrateDistance(40) ? T('נמדד ✓ — המרחק עכשיו מדויק יותר') : T('לא זוהו פנים. נסו שוב מול המצלמה.'));
    });
  }

  function centerBaseline() {
    DA.ui.ask(T('הביטו בנקודה האדומה שבמרכז המסך ולחצו "עכשיו".'), T('עכשיו')).then(function (y) {
      if (!y) return;
      DA.ui.toast(DA.eyes.setCenterBaseline() ? T('🎯 נשמר. מעכשיו נדע כשהמבט זז מהמרכז') : T('לא זוהו עיניים. נסו שוב.'));
    });
  }

  function render(s) {
    var w = $('eyeWidget');
    w.style.display = s.running ? '' : 'none';
    if (!s.running) { $('eyePanel').classList.remove('open'); return; }
    var dist = s.face && s.distanceCm ? s.distanceCm + T(' ס״מ') : T('לא רואה פנים');
    var center = s.centered == null ? '' : s.centered ? ' · 🎯' : ' · ↔️';
    w.textContent = '👁️ ' + dist + center + (s.leaning ? ' · 🔍' : '');
    w.className = 'eye-widget' + (s.centered === false ? ' off' : '') + (!s.face ? ' noface' : '');
    $('eyeStats').innerHTML =
      T('<div>📏 מרחק: <b>') + (s.distanceCm ? s.distanceCm + T(' ס״מ') : '—') + '</b></div>' +
      T('<div>🎯 מבט: <b>') + (s.centered == null ? T('לא נקבע מרכז') : s.centered ? T('במרכז') : T('זז מהמרכז')) + '</b></div>' +
      T('<div>😉 מצמוצים לדקה: <b>') + (s.blinkPerMin == null ? T('מודד…') : s.blinkPerMin) + '</b></div>' +
      (s.steadiest ? '<div>🧭 ' + T('המבט יציב יותר כשהראש מסובב בערך ') + Math.abs(s.steadiest.yaw) + '°' + T(' הצידה, ממה שהמצלמה ראתה (יציב יותר ב־') + s.steadiest.gainPct + '%)</div>' : '') +
      T('<div>😑 צמצום עיניים: <b>') + (s.squint > 0.5 ? T('כן') : T('לא')) + '</b></div>';
  }

  var lastLeanOffer = 0;
  function maybeLeanAlert(s) {
    if (!s.leaning || ctx.current() !== 'read') return;
    var now = Date.now();
    if (now - lastLeanOffer < 60000) return;
    lastLeanOffer = now;
    var p = ctx.profile();
    if (!p) return;
    var bigger = Math.round(p.settings.fontSize * 1.2);
    DA.ui.ask(T('🔍 נראה שהתקרבת למסך. להגדיל את האותיות ל־') + bigger + '?', T('כן, להגדיל'), T('לא עכשיו')).then(function (y) {
      if (y) ctx.updateSettings({ fontSize: bigger });
    });
  }

  /** A visible on/off switch for eye tracking (hub, reader, game, calibration). */
  var switches = [];
  function bindSwitch(btn) {
    if (!btn) return;
    switches.push(btn);
    btn.onclick = function () {
      if (!DA.eyes.supported()) { offer(); return; }
      if (DA.eyes.state.running) {
        DA.ui.ask(T('לכבות את מעקב העיניים?'), T('כיבוי')).then(function (y) { if (y) { DA.eyes.stop(); setPref(false); } });
      } else offer();
    };
    updateSwitches(DA.eyes.state);
  }
  function updateSwitches(s) {
    switches.forEach(function (b) {
      var sup = DA.eyes.supported();
      b.classList.toggle('on', !!s.running);
      b.classList.toggle('unsupported', !sup);
      var short = b.getAttribute('data-short') != null;
      b.textContent = !sup ? (short ? '👁️' : T('👁️ מעקב עיניים: זמין רק באתר העצמאי'))
        : s.running ? (short ? T('👁️ פועל') : T('👁️ מעקב עיניים: פועל ✓ (לחצו לכיבוי)'))
        : (short ? T('👁️ כבוי') : T('👁️ מעקב עיניים: כבוי (לחצו להפעלה)'));
      b.title = T('מעקב עיניים במצלמה: לא חובה, עוזר להתאמה מדויקת יותר');
    });
  }

  DA.eyePanel = { init: init, offer: offer, info: info, open: openPanel, bindSwitch: bindSwitch };
})(typeof window !== 'undefined' ? window : globalThis);
