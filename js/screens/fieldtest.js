/*
 * עין טובה — Visual-field mapping (a simple screen "perimetry" for reading support).
 * The reader looks at a red cross in the middle; small dots flash around it at known visual angles.
 * Each time a dot is seen the reader taps (or presses space). Points missed twice are marked as a
 * probable blind area (scotoma). From the map the app suggests reading aids:
 *   - central blind area → move the text away from it (eccentric viewing);
 *   - one whole side missing (e.g. after a stroke) → line-start marker and shorter lines.
 * NOT a medical visual-field test: no fixed luminance, no fixation monitoring hardware.
 */
(function (root) {
  'use strict';
  var DA = root.DA;
  DA.screens = DA.screens || {};
  var $ = DA.ui.$, esc = DA.ui.esc;
  var ctx, sess, trials, idx, pass, timer, onsetT, current, responded, paused, running;
  var ECC = [2, 4, 7, 10, 13];                 // degrees from the fixation cross
  var ANGLES = 8;

  function init(c) {
    ctx = c;
    $('ftStart').onclick = start;
    $('ftCard').onclick = function () { DA.device.calibrate().then(renderCalNote); };
    $('ftGo').onclick = function () { $('ftIntro').style.display = 'none'; running = true; schedule(); };
    $('ftStage').addEventListener('pointerdown', function (e) {
      if (!running || e.target.closest('.ft-hud') || e.target.closest('#ftIntro')) return;
      respond();
    });
    $('ftPause').onclick = function (e) { e.stopPropagation(); togglePause(); };
    $('ftStop').onclick = function (e) {
      e.stopPropagation(); togglePause(true);
      DA.ui.ask(T('לעצור? מה שכבר נמדד יישמר.'), T('לעצור')).then(function (y) { if (y) finish(true); else togglePause(false); });
    };
    document.addEventListener('keydown', function (e) {
      if (ctx.current() !== 'fieldtest' || !running) return;
      if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); respond(); }
      else if (e.key === 'Escape') togglePause();
    });
  }

  function renderCalNote() {
    $('ftCalNote').textContent = DA.device.isCalibrated()
      ? T('✓ גודל המסך מכויל, אז המפה מדויקת יותר במעלות.')
      : T('מומלץ לכייל קודם את גודל המסך עם כרטיס אשראי. בלי כיול, המעלות הן הערכה.');
  }

  function enter() {
    var p = ctx.profile();
    if (!p) { ctx.go('home'); return; }
    stopAll();
    $('ftSetup').style.display = '';
    $('ftStage').style.display = 'none';
    $('ftEnd').style.display = 'none';
    var e = DA.eyes.state;
    $('ftDist').value = e.running && e.distanceCm ? e.distanceCm : (p.settings.refDistanceCm || 40);
    renderCalNote();
  }
  function leave() { stopAll(); }
  function stopAll() { running = false; clearTimeout(timer); document.body.classList.remove('ft-running'); }

  function start() {
    var p = ctx.profile();
    var dist = +$('ftDist').value || 40;
    var stage = $('ftStage');
    $('ftSetup').style.display = 'none';
    stage.style.display = '';
    document.body.classList.add('ft-running');
    if (stage.requestFullscreen) stage.requestFullscreen().catch(function () {});
    setTimeout(function () {
      var W = stage.clientWidth, H = stage.clientHeight, margin = 24;
      var dotDeg = +$('ftDotSize').value || 0.5;
      var pts = [];
      ECC.forEach(function (ecc, ri) {
        for (var a = 0; a < ANGLES; a++) {
          var ang = (a + (ri % 2 ? 0.5 : 0)) * 2 * Math.PI / ANGLES;
          var dx = Math.cos(ang) * ecc, dy = Math.sin(ang) * ecc;
          var px = DA.device.degToPx(dx, dist), py = DA.device.degToPx(dy, dist);
          if (Math.abs(px) < W / 2 - margin && Math.abs(py) < H / 2 - margin) pts.push({ xDeg: r1(dx), yDeg: r1(dy), ecc: ecc, px: px, py: py });
        }
      });
      sess = {
        schema: 'da.session/1', id: 'F' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), kind: 'fieldmap',
        profileId: p.id, softwareVersion: DA.VERSION, startedAt: new Date().toISOString(),
        eye: $('ftEye').value, distanceCm: dist, dotDeg: dotDeg,
        pxPerMm: Math.round(DA.device.pxPerMm() * 1000) / 1000, screenCalibrated: DA.device.isCalibrated(),
        points: pts.map(function (q) { return { xDeg: q.xDeg, yDeg: q.yDeg, ecc: q.ecc, seen: [] }; }),
        blanks: 0, falseAlarms: 0, lateOrEarly: 0, log: []
      };
      sess.dotPx = Math.max(5, DA.device.degToPx(dotDeg, dist));
      $('ftDot').style.width = $('ftDot').style.height = sess.dotPx + 'px';
      pass = 1;
      trials = shuffle(sess.points.map(function (q, i) { return { i: i }; }).concat([{ blank: true }, { blank: true }, { blank: true }, { blank: true }, { blank: true }, { blank: true }]));
      idx = 0; paused = false; running = false;
      $('ftIntro').style.display = '';
      count();
    }, 350);
  }
  function r1(v) { return Math.round(v * 10) / 10; }
  function shuffle(a) { for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; } return a; }

  function count() { $('ftCount').textContent = (pass === 1 ? T('סבב 1') : T('סבב 2 (בדיקה חוזרת)')) + ' · ' + Math.min(idx + 1, trials.length) + '/' + trials.length; }

  function schedule() {
    if (!running || paused) return;
    if (idx >= trials.length) { nextPass(); return; }
    timer = setTimeout(present, 500 + Math.random() * 700);
  }

  function present() {
    if (!running || paused) return;
    current = trials[idx];
    responded = false;
    onsetT = performance.now();
    var dot = $('ftDot'), stage = $('ftStage');
    if (!current.blank) {
      var q = sess.points[current.i];
      var cx = stage.clientWidth / 2, cy = stage.clientHeight / 2;
      var px = DA.device.degToPx(q.xDeg, sess.distanceCm), py = DA.device.degToPx(q.yDeg, sess.distanceCm);
      dot.style.left = (cx + px - sess.dotPx / 2) + 'px';
      dot.style.top = (cy + py - sess.dotPx / 2) + 'px';
      dot.style.display = 'block';
      setTimeout(function () { dot.style.display = 'none'; }, 200);
    }
    count();
    timer = setTimeout(closeTrial, 1300);
  }

  function respond() {
    if (paused) return;
    var t = performance.now() - onsetT;
    if (current && !responded && t > 120 && t < 1300) {
      responded = true;
      $('ftStage').classList.add('flash');
      setTimeout(function () { $('ftStage').classList.remove('flash'); }, 120);
    } else {
      sess.lateOrEarly++;   // tap outside a response window
    }
  }

  function closeTrial() {
    if (!current) return;
    var eyes = DA.eyes.snapshot();
    if (current.blank) { sess.blanks++; if (responded) sess.falseAlarms++; }
    else sess.points[current.i].seen.push(responded);
    sess.log.push({ pass: pass, point: current.blank ? null : current.i, seen: responded, eyes: eyes });
    current = null;
    idx++;
    schedule();
  }

  function nextPass() {
    if (pass === 1) {
      var missed = [];
      sess.points.forEach(function (q, i) { if (q.seen[0] === false) missed.push({ i: i }); });
      if (missed.length) {
        pass = 2;
        trials = shuffle(missed.concat([{ blank: true }, { blank: true }]));
        idx = 0;
        schedule();
        return;
      }
    }
    finish(false);
  }

  function togglePause(force) {
    paused = force != null ? force : !paused;
    $('ftPauseNote').style.display = paused ? '' : 'none';
    clearTimeout(timer);
    if (!paused) { current = null; schedule(); }
  }

  // ---------------- analysis ----------------
  function analyze(s) {
    var pts = s.points.filter(function (q) { return q.seen.length; });
    var defect = pts.filter(function (q) { return q.seen.length && q.seen.every(function (v) { return !v; }) && q.seen.length >= 2; });
    var unsure = pts.filter(function (q) { return q.seen.indexOf(false) >= 0 && q.seen.indexOf(true) >= 0; });
    var side = function (sign) {
      var all = pts.filter(function (q) { return sign * q.xDeg > 0.5; });
      var miss = defect.filter(function (q) { return sign * q.xDeg > 0.5; });
      return all.length ? miss.length / all.length : 0;
    };
    var left = side(-1), right = side(1);
    var central = defect.filter(function (q) { return q.ecc <= 7; });
    var res = { tested: pts.length, defects: defect.length, unsure: unsure.length, leftMissPct: Math.round(left * 100), rightMissPct: Math.round(right * 100),
      falseAlarmPct: s.blanks ? Math.round(s.falseAlarms / s.blanks * 100) : 0, pattern: 'none', suggest: {} };
    if (left >= 0.5 && right <= 0.15) res.pattern = 'hemi-left';
    else if (right >= 0.5 && left <= 0.15) res.pattern = 'hemi-right';
    else if (central.length) res.pattern = 'central';
    else if (defect.length) res.pattern = 'scattered';
    if (res.pattern === 'central') {
      var cx = central.reduce(function (a, q) { return a + q.xDeg; }, 0) / central.length;
      var cy = central.reduce(function (a, q) { return a + q.yDeg; }, 0) / central.length;
      var mag = Math.hypot(cx, cy) || 1;
      // place text on the seeing side: opposite to the blind area's centre
      res.suggest.shiftX = Math.round(Math.max(-0.3, Math.min(0.3, -cx / mag * 0.18)) * 100) / 100;
      res.suggest.shiftY = Math.round(Math.max(-0.3, Math.min(0.3, -cy / mag * 0.12)) * 100) / 100;
      res.centroid = { xDeg: r1(cx), yDeg: r1(cy) };
    }
    if (res.pattern === 'hemi-left' || res.pattern === 'hemi-right') {
      res.suggest.lineMarker = true;
      res.suggest.lineChars = 32;
    }
    return res;
  }

  function finish(early) {
    stopAll();
    if (document.fullscreenElement) document.exitFullscreen().catch(function () {});
    $('ftStage').style.display = 'none';
    if (!sess) { ctx.go('hub'); return; }
    sess.endedAt = new Date().toISOString();
    sess.early = !!early;
    sess.result = analyze(sess);
    ctx.profiles.saveSession(sess);
    $('ftEnd').style.display = '';
    $('ftSummary').innerHTML = summaryHtml(sess, true);
    var sug = sess.result.suggest;
    var has = Object.keys(sug).length;
    $('ftApply').style.display = has ? '' : 'none';
    $('ftApply').onclick = function () { ctx.updateSettings(sug); DA.ui.toast(T('ההמלצות הופעלו בקריאה')); ctx.go('hub'); };
    $('ftKeep').onclick = function () { ctx.go('hub'); };
  }

  // ---------------- report ----------------
  function mapSvg(s) {
    var R = 150, max = 14, k = R / max;
    var svg = '<svg class="ft-map" viewBox="' + (-R - 10) + ' ' + (-R - 10) + ' ' + (2 * R + 20) + ' ' + (2 * R + 20) + '" dir="ltr" role="img" aria-label="' + esc(T('מפת נוחות הצפייה')) + '">';
    [5, 10].forEach(function (d) { svg += '<circle r="' + d * k + '" fill="none" stroke="#dfe5ec"/><text x="' + (d * k + 2) + '" y="-3" font-size="9" fill="#9aa6b2">' + d + '°</text>'; });
    svg += '<line x1="' + -R + '" y1="0" x2="' + R + '" y2="0" stroke="#eef1f4"/><line x1="0" y1="' + -R + '" x2="0" y2="' + R + '" stroke="#eef1f4"/>';
    svg += '<path d="M-6 0 H6 M0 -6 V6" stroke="#e00000" stroke-width="2"/>';
    s.points.forEach(function (q) {
      if (!q.seen.length) return;
      var x = q.xDeg * k, y = q.yDeg * k;
      var allMiss = q.seen.every(function (v) { return !v; }), anyMiss = q.seen.indexOf(false) >= 0;
      if (allMiss && q.seen.length >= 2) svg += '<path d="M' + (x - 6) + ' ' + (y - 6) + ' L' + (x + 6) + ' ' + (y + 6) + ' M' + (x + 6) + ' ' + (y - 6) + ' L' + (x - 6) + ' ' + (y + 6) + '" stroke="#d0021b" stroke-width="3"/>';
      else svg += '<circle cx="' + x + '" cy="' + y + '" r="6" fill="' + (anyMiss ? '#f5a623' : '#19a35b') + '"/>';
    });
    return svg + '</svg>';
  }

  var PATTERN = {
    none: T('לא נמצאו אזורים שלא רואים בהם, בטווח שנבדק.'),
    central: T('נקודות קרובות למרכז נראו פחות. אפשר לנסות להזיז את הטקסט לצד שבו הנקודות נראו טוב.'),
    'hemi-left': T('נקודות בצד שמאל נראו פחות. בעברית זה הצד שבו השורה נגמרת, אז אפשר לנסות סימון שורה ושורות קצרות יותר.'),
    'hemi-right': T('נקודות בצד ימין נראו פחות. בעברית זה הצד שבו השורה מתחילה, אז אפשר לנסות סימון תחילת שורה ושורות קצרות יותר.'),
    scattered: T('כמה נקודות בודדות לא נראו. ייתכן שזה רק רגע של חוסר קשב. כדאי לחזור על הבדיקה.')
  };

  function summaryHtml(s, full) {
    var r = s.result || analyze(s);
    var eye = { right: T('עין ימין'), left: T('עין שמאל'), both: T('שתי העיניים') }[s.eye] || '';
    var out = '<p class="muted">🎯 ' + T('מפת נוחות צפייה') + ' · ' + eye + ' · ' + new Date(s.startedAt).toLocaleString(DA.i18n.locale) + (s.early ? T(' · הופסק באמצע') : '') + '</p>' +
      '<p><b>' + PATTERN[r.pattern] + '</b></p>';
    if (full) {
      out += '<div class="ft-result">' + mapSvg(s) + '<div class="ft-legend">' +
        '<div><span class="lg ok"></span>' + T('נראה') + '</div><div><span class="lg unsure"></span>' + T('לא נראה פעם אחת (לא בטוח)') + '</div>' +
        '<div><span class="lg miss">✕</span>' + T('לא נראה פעמיים') + '</div>' +
        '<p class="muted small">' + T('נקודות שנבדקו: ') + r.tested + T(' · לחיצות בלי נקודה: ') + r.falseAlarmPct + '%</p>' +
        (r.falseAlarmPct > 33 ? '<p class="bad small">' + T('היו הרבה לחיצות כשלא הופיעה נקודה, ולכן התוצאה פחות אמינה.') + '</p>' : '') +
        (Object.keys(r.suggest).length ? '<p>' + T('ההמלצה לקריאה: ') + esc(describeSuggest(r.suggest)) + '</p>' : '') +
        '</div></div>' +
        '<p class="muted small">' + T('זה לא כלי רפואי ולא בדיקה. המפה רק עוזרת להחליט איפה נוח למקם טקסט.') + '</p>';
    }
    return out;
  }

  function describeSuggest(g) {
    var parts = [];
    if (g.shiftX || g.shiftY) parts.push(T('להזיז את הטקסט ') + (g.shiftX < 0 ? T('שמאלה') : g.shiftX > 0 ? T('ימינה') : '') + (g.shiftY < 0 ? T(' ולמעלה') : g.shiftY > 0 ? T(' ולמטה') : ''));
    if (g.lineMarker) parts.push(T('סימון תחילת שורה'));
    if (g.lineChars) parts.push(T('שורות קצרות יותר'));
    return parts.join(' · ');
  }

  DA.screens.fieldtest = { init: init, enter: enter, leave: leave, summaryHtml: summaryHtml, analyze: analyze };
})(typeof window !== 'undefined' ? window : globalThis);
