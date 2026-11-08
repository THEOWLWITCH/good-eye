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
    '<h3>👁️ מעקב עיניים במצלמה — בשביל התאמה טובה יותר</h3>' +
    '<p>כשהאפשרות פועלת, המצלמה של המחשב או הטלפון עוזרת לאפליקציה להבין <b>איך באמת קוראים</b>, ולא רק מה בוחרים במשחק:</p>' +
    '<ul>' +
    '<li><b>📏 מרחק מהמסך</b>: מחושב לפי גודל הקשתית (החלק הצבעוני בעין). כך גודל האותיות מותאם למה שהעין רואה, גם כשיושבים קרוב או רחוק.</li>' +
    '<li><b>🔍 התקרבות למסך</b>: מי שמתקרב תוך כדי קריאה כנראה צריך אותיות גדולות יותר. האפליקציה תציע להגדיל.</li>' +
    '<li><b>🎯 מבט למרכז</b>: בכיול ובבדיקת תיקון העיוות חשוב להביט בנקודה האמצעית. המצלמה מזהה כשהמבט זז, ומבקשת לחזור למרכז.</li>' +
    '<li><b>😴 עייפות ומאמץ</b>: מצמוצים רבים או צמצום עיניים. כך יודעים מתי לעשות הפסקה, ומתי תוצאות המשחק פחות מדויקות.</li>' +
    '</ul>' +
    '<h4>⚠️ מתי זה לא יעבוד, או יעבוד פחות טוב</h4>' +
    '<p><b>לא יעבוד בכלל:</b></p>' +
    '<ul>' +
    '<li>בתוך claude.ai, שחוסם את המצלמה. זה עובד רק באתר העצמאי של עין טובה.</li>' +
    '<li>כשאין מצלמה, או כשלא אישרתם לדפדפן להשתמש בה.</li>' +
    '<li>כשהפנים לא נראות במלואן: מחוץ לתמונה, ראש מסובב הצידה, או יד או מסכה שמסתירות את העיניים.</li>' +
    '<li>במכשיר ישן או איטי מאוד. המדידה תהיה איטית או תיעצר.</li>' +
    '</ul>' +
    '<p><b>יעבוד פחות טוב (המספרים יהיו רק הערכה):</b></p>' +
    '<ul>' +
    '<li><b>תאורה:</b> חדר חשוך, אור חזק מאחורי הראש (חלון), או צל על הפנים.</li>' +
    '<li><b>משקפיים:</b> השתקפויות בעדשות. משקפיים חזקים במיוחד, כמו משקפי הגדלה, משנים את גודל העין בתמונה, ואז <b>המרחק יוצא לא נכון</b>. כדאי לכייל מרחק ("שבו 40 ס״מ") עם המשקפיים שקוראים בהם.</li>' +
    '<li><b>מרחק:</b> קרוב מאוד, פחות מ־20 ס״מ, או רחוק מאוד, יותר ממטר.</li>' +
    '<li><b>תנועה:</b> ילדים שזזים הרבה. המדידה מחליקה את התנודות, אבל מגיבה לאט.</li>' +
    '<li><b>מצבי עיניים:</b> ריצוד עיניים (ניסטגמוס) ופזילה מבלבלים את בדיקת "מבט למרכז". עפעף צונח או עין חצי סגורה מקשים לזהות מצמוץ. קשתית בהירה מאוד, למשל באלביניזם, קשה יותר לזיהוי. במצבים האלה כדאי להסתמך בעיקר על מדידת המרחק, או לכבות.</li>' +
    '</ul>' +
    '<p><b>מה מצלמה רגילה לא יודעת לעשות אף פעם:</b></p>' +
    '<ul>' +
    '<li>לדעת <b>על איזו מילה או אות בדיוק מסתכלים</b>. הדיוק הוא בערך "מרכז או צד".</li>' +
    '<li>להזיז את <b>תיקון העיוות יחד עם המבט</b>. לזה צריך מכשיר ייעודי למעקב עיניים, שמחובר למחשב.</li>' +
    '<li>לאבחן. זו <b>לא בדיקה רפואית</b> ולא תחליף לרופא עיניים.</li>' +
    '</ul>' +
    '<h4>🔒 פרטיות</h4>' +
    '<p>הכול קורה בתוך המכשיר. <b>שום תמונה או וידאו לא נשמרים ולא נשלחים לשום מקום</b>, רק מספרים כמו מרחק ומספר מצמוצים. אפשר לכבות בכל רגע, והדפדפן יבקש אישור לשימוש במצלמה.</p>';

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
      DA.ui.tell('מעקב העיניים פועל רק בגרסה העצמאית של עין טובה (באתר שלה), ולא בתוך claude.ai, שחוסם את המצלמה.');
      return;
    }
    var dlg = $('eyeInfoDialog');
    dlg.returnValue = '';
    $('eyeInfoOk').style.display = ''; $('eyeInfoCancel').textContent = 'לא עכשיו';
    dlg.onclose = function () {
      if (dlg.returnValue !== 'ok') return;
      DA.ui.toast('מפעיל מצלמה…');
      DA.eyes.start().then(function () {
        setPref(true);
        DA.ui.toast('👁️ מעקב העיניים פועל');
        openPanel();
      }).catch(function (e) {
        DA.ui.tell('לא הצלחתי להפעיל את המצלמה (' + ((e && e.name) || 'שגיאה') + '). בדקו שיש מצלמה ושאושרה גישה אליה בדפדפן.');
      });
    };
    dlg.showModal();
  }

  function info() {
    var dlg = $('eyeInfoDialog');
    $('eyeInfoOk').style.display = 'none'; $('eyeInfoCancel').textContent = 'סגירה';
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
    DA.ui.ask('שבו כך שהעיניים יהיו בדיוק 40 ס״מ מהמסך (מדדו בסרגל), הביטו במסך ולחצו "מדוד". זה משפר את מדידת המרחק במכשיר הזה.', 'מדוד').then(function (y) {
      if (!y) return;
      DA.ui.toast(DA.eyes.calibrateDistance(40) ? 'נמדד ✓ — המרחק עכשיו מדויק יותר' : 'לא זוהו פנים. נסו שוב מול המצלמה.');
    });
  }

  function centerBaseline() {
    DA.ui.ask('הביטו בנקודה האדומה שבמרכז המסך ולחצו "עכשיו".', 'עכשיו').then(function (y) {
      if (!y) return;
      DA.ui.toast(DA.eyes.setCenterBaseline() ? '🎯 נשמר. מעכשיו נדע כשהמבט זז מהמרכז' : 'לא זוהו עיניים. נסו שוב.');
    });
  }

  function render(s) {
    var w = $('eyeWidget');
    w.style.display = s.running ? '' : 'none';
    if (!s.running) { $('eyePanel').classList.remove('open'); return; }
    var dist = s.face && s.distanceCm ? s.distanceCm + ' ס״מ' : 'לא רואה פנים';
    var center = s.centered == null ? '' : s.centered ? ' · 🎯' : ' · ↔️';
    w.textContent = '👁️ ' + dist + center + (s.leaning ? ' · 🔍' : '');
    w.className = 'eye-widget' + (s.centered === false ? ' off' : '') + (!s.face ? ' noface' : '');
    $('eyeStats').innerHTML =
      '<div>📏 מרחק: <b>' + (s.distanceCm ? s.distanceCm + ' ס״מ' : '—') + '</b></div>' +
      '<div>🎯 מבט: <b>' + (s.centered == null ? 'לא נקבע מרכז' : s.centered ? 'במרכז' : 'זז מהמרכז') + '</b></div>' +
      '<div>😉 מצמוצים לדקה: <b>' + (s.blinkPerMin == null ? 'מודד…' : s.blinkPerMin) + '</b></div>' +
      '<div>😑 צמצום עיניים: <b>' + (s.squint > 0.5 ? 'כן' : 'לא') + '</b></div>';
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
    DA.ui.ask('🔍 נראה שהתקרבת למסך. להגדיל את האותיות ל־' + bigger + '?', 'כן, להגדיל', 'לא עכשיו').then(function (y) {
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
        DA.ui.ask('לכבות את מעקב העיניים?', 'כיבוי').then(function (y) { if (y) { DA.eyes.stop(); setPref(false); } });
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
      b.textContent = !sup ? (short ? '👁️' : '👁️ מעקב עיניים: זמין רק באתר העצמאי')
        : s.running ? (short ? '👁️ פועל' : '👁️ מעקב עיניים: פועל ✓ (לחצו לכיבוי)')
        : (short ? '👁️ כבוי' : '👁️ מעקב עיניים: כבוי (לחצו להפעלה)');
      b.title = 'מעקב עיניים במצלמה: לא חובה, עוזר להתאמה מדויקת יותר';
    });
  }

  DA.eyePanel = { init: init, offer: offer, info: info, open: openPanel, bindSwitch: bindSwitch };
})(typeof window !== 'undefined' ? window : globalThis);
