/*
 * עין טובה — Comfort map for placing text (not perimetry, not a medical visual-field test).
 * The reader looks at a red cross in the middle; small dots flash around it at known visual angles,
 * and the reader taps when a dot is seen. Blind-spot probes check that the gaze stayed on the cross,
 * bright catch dots check attention, and blank trials count taps without a dot.
 * From a reliable map the app suggests reading aids (shorter lines, line-start or line-end markers by
 * reading direction, one word at a time) and always shows the same advice to see an eye doctor when
 * an area seen less is new or changed.
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
        eye: $('ftEye').value, distanceCm: dist, dotDeg: dotDeg, glasses: ctx.glasses(),
        pxPerMm: Math.round(DA.device.pxPerMm() * 1000) / 1000, screenCalibrated: DA.device.isCalibrated(),
        points: pts.map(function (q) { return { xDeg: q.xDeg, yDeg: q.yDeg, ecc: q.ecc, seen: [] }; }),
        blanks: 0, falseAlarms: 0, lateOrEarly: 0, log: []
      };
      sess.dotPx = Math.max(5, DA.device.degToPx(dotDeg, dist));
      $('ftDot').style.width = $('ftDot').style.height = sess.dotPx + 'px';
      // Fixation check: the natural blind spot is ~15° to the temporal side and 1.5° down.
      // A dot there should NOT be seen with one eye; seeing it means the gaze moved.
      sess.fixChecks = 0; sess.fixLosses = 0; sess.catchShown = 0; sess.catchMissed = 0;
      var extra = [];
      if (sess.eye !== 'both') {
        var bx = sess.eye === 'left' ? -15 : 15, bpx = DA.device.degToPx(bx, dist), bpy = DA.device.degToPx(1.5, dist);
        if (Math.abs(bpx) < W / 2 - margin && Math.abs(bpy) < H / 2 - margin) extra.push({ blindSpot: true, xDeg: bx, yDeg: 1.5 }, { blindSpot: true, xDeg: bx, yDeg: 1.5 }, { blindSpot: true, xDeg: bx, yDeg: 1.5 });
      }
      // Bright, large catch dots near the centre: everyone should see them.
      [[2, 0], [-2, 0], [0, 2]].forEach(function (c) { extra.push({ catchDot: true, xDeg: c[0], yDeg: c[1] }); });
      pass = 1;
      trials = shuffle(sess.points.map(function (q, i) { return { i: i }; }).concat([{ blank: true }, { blank: true }, { blank: true }, { blank: true }, { blank: true }, { blank: true }], extra));
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
    if (current.blindSpot || current.catchDot) {
      var cxs = stage.clientWidth / 2, cys = stage.clientHeight / 2, size = current.catchDot ? sess.dotPx * 2 : sess.dotPx;
      dot.style.width = dot.style.height = size + 'px';
      dot.style.left = (cxs + DA.device.degToPx(current.xDeg, sess.distanceCm) - size / 2) + 'px';
      dot.style.top = (cys + DA.device.degToPx(current.yDeg, sess.distanceCm) - size / 2) + 'px';
      dot.style.display = 'block';
      setTimeout(function () { dot.style.display = 'none'; dot.style.width = dot.style.height = sess.dotPx + 'px'; }, 200);
    } else if (!current.blank) {
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
    else if (current.blindSpot) { sess.fixChecks++; if (responded) sess.fixLosses++; }
    else if (current.catchDot) { sess.catchShown++; if (!responded) sess.catchMissed++; }
    else sess.points[current.i].seen.push(responded);
    sess.log.push({ pass: pass, point: current.blank || current.blindSpot || current.catchDot ? null : current.i, kind: current.blank ? 'blank' : current.blindSpot ? 'blindspot' : current.catchDot ? 'catch' : 'point', seen: responded, eyes: eyes });
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
      falseAlarmPct: s.blanks ? Math.round(s.falseAlarms / s.blanks * 100) : 0, pattern: 'none', suggest: {},
      fixLossPct: s.fixChecks ? Math.round(s.fixLosses / s.fixChecks * 100) : null,
      catchMissPct: s.catchShown ? Math.round(s.catchMissed / s.catchShown * 100) : null };
    res.unreliable = res.falseAlarmPct > 33 || (res.fixLossPct != null && res.fixLossPct > 33) || (res.catchMissPct != null && res.catchMissPct > 33);
    if (left >= 0.5 && right <= 0.15) res.pattern = 'hemi-left';
    else if (right >= 0.5 && left <= 0.15) res.pattern = 'hemi-right';
    else if (central.length) res.pattern = 'central';
    else if (outer(defect, pts)) res.pattern = 'periphery';
    else if (defect.length) res.pattern = 'scattered';
    res.maxEcc = pts.reduce(function (a, q) { return Math.max(a, q.ecc); }, 0);
    if (res.pattern === 'periphery') { res.suggest.lineChars = 26; res.suggest.maxFont = 40; }
    if (res.pattern === 'central') {
      // Moving the text does not help: the eyes follow the text and the area moves with them.
      // Reading aids that reduce eye movements help more: one word at a time, larger letters, read-aloud.
      res.suggest.readMode = 'word';
      var cx = central.reduce(function (a, q) { return a + q.xDeg; }, 0) / central.length;
      var cy = central.reduce(function (a, q) { return a + q.yDeg; }, 0) / central.length;
      res.centroid = { xDeg: r1(cx), yDeg: r1(cy) };
    }
    if (res.pattern === 'hemi-left' || res.pattern === 'hemi-right') {
      // which end of the line falls in the area seen less depends on the reading direction
      var rtl = DA.i18n.content !== 'en';
      var startSide = rtl ? 'hemi-right' : 'hemi-left';
      if (res.pattern === startSide) res.suggest.lineMarker = true; else res.suggest.lineMarkerEnd = true;
      res.suggest.lineChars = 32;
      res.lineEnd = res.pattern === startSide ? 'start' : 'end';
    }
    return res;
  }

  /** Most outer points (≥ 10°) missed while the inner ones were seen. */
  function outer(defect, pts) {
    var o = pts.filter(function (q) { return q.ecc >= 10; }), i = pts.filter(function (q) { return q.ecc <= 4; });
    if (!o.length || !i.length) return false;
    var om = defect.filter(function (q) { return q.ecc >= 10; }).length / o.length;
    var im = defect.filter(function (q) { return q.ecc <= 4; }).length / i.length;
    return om >= 0.5 && im <= 0.15;
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
    var sug = sess.result.unreliable ? {} : sess.result.suggest;
    var has = Object.keys(sug).length;
    $('ftApply').style.display = has ? '' : 'none';
    $('ftApply').onclick = function () {
      var p2 = ctx.profile(), patch = Object.assign({}, sug);
      if (patch.maxFont) { if (p2.settings.fontSize > patch.maxFont) patch.fontSize = patch.maxFont; delete patch.maxFont; }
      if (patch.readMode) { ctx.store.setPref('read.mode', patch.readMode); delete patch.readMode; }
      ctx.updateSettings(patch); DA.ui.toast(T('ההמלצות הופעלו בקריאה')); ctx.go('hub'); };
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

  /** Neutral words for what was seen; never a diagnosis. */
  function patternText(r) {
    if (r.pattern === 'none') return T('בטווח שנבדק (עד כ־') + Math.round(r.maxEcc || 13) + T('° מהמרכז), עם נקודות בולטות, כל הנקודות נראו. זה לא שולל בעיה בשדה הראייה.');
    var where = { central: T('נקודות קרובות למרכז נראו פחות.'), 'hemi-left': T('נקודות בצד שמאל נראו פחות.'), 'hemi-right': T('נקודות בצד ימין נראו פחות.'),
      periphery: T('נקודות רחוקות מהמרכז נראו פחות, והקרובות נראו טוב.'), scattered: T('כמה נקודות בודדות נראו פחות.') }[r.pattern] || '';
    var tip = '';
    if (r.pattern === 'central') tip = T('לקריאה: מילה אחרי מילה, אותיות גדולות יותר והקראה מקטינים את הצורך להזיז את העיניים.');
    else if (r.lineEnd === 'start') tip = T('זה הצד שבו השורה מתחילה, ולכן סימון תחילת שורה ושורות קצרות יותר עוזרים למצוא את השורה הבאה.');
    else if (r.lineEnd === 'end') tip = T('זה הצד שבו השורה נגמרת, ולכן קוראים לתוכו. סימון סוף השורה, שורות קצרות יותר ומילה אחרי מילה עוזרים.');
    else if (r.pattern === 'periphery') tip = T('שורות קצרות ואותיות לא גדולות מדי עוזרות שכל השורה תיכנס לאזור שרואים בו.');
    else if (r.pattern === 'scattered') tip = T('ייתכן שזה רגע של חוסר קשב. כדאי לחזור על המפה ביום אחר.');
    return where + ' ' + tip;
  }

  function summaryHtml(s, full) {
    var r = s.result || analyze(s);
    var eye = { right: T('עין ימין'), left: T('עין שמאל'), both: T('שתי העיניים') }[s.eye] || '';
    var out = '<p class="muted">' + T('מפת נוחות צפייה') + ' · ' + eye + ' · ' + new Date(s.startedAt).toLocaleString(DA.i18n.locale) + (s.early ? T(' · הופסק באמצע') : '') + '</p>' +
      '<p><b>' + esc(patternText(r)) + '</b></p>' + (r.pattern !== 'none' ? DA.safety.html('field') : '');
    if (full) {
      out += '<div class="ft-result">' + mapSvg(s) + '<div class="ft-legend">' +
        '<div><span class="lg ok"></span>' + T('נראה') + '</div><div><span class="lg unsure"></span>' + T('לא נראה פעם אחת (לא בטוח)') + '</div>' +
        '<div><span class="lg miss">✕</span>' + T('לא נראה פעמיים') + '</div>' +
        '<p class="muted small">' + T('נקודות שנבדקו: ') + r.tested + T(' · לחיצות בלי נקודה: ') + r.falseAlarmPct + '%</p>' +
        (r.fixLossPct != null ? '<p class="muted small">' + T('בדיקת מבט (נקודות בכתם העיוור הטבעי שנראו): ') + r.fixLossPct + '%' + (r.catchMissPct != null ? T(' · נקודות בולטות שלא נראו: ') + r.catchMissPct + '%' : '') + '</p>' : '') +
        (r.unreliable ? '<p class="bad small">' + T('המבט זז, או שהיו לחיצות בלי נקודה או נקודות בולטות שלא נראו, ולכן התוצאה פחות אמינה. כדאי לחזור על המפה ביום אחר, לפני שמשנים משהו.') + '</p>' : '') +
        (Object.keys(r.suggest).length ? '<p>' + T('ההמלצה לקריאה: ') + esc(describeSuggest(r.suggest)) + '</p>' : '') +
        '</div></div>' +
        '<p class="muted small">' + T('זה לא כלי רפואי ולא בדיקת שדה ראייה, ולא מתאים לקביעת כשירות לנהיגה או לעבודה. המפה רק עוזרת להחליט איך נוח לקרוא.') + '</p>';
    }
    return out;
  }

  function describeSuggest(g) {
    var parts = [];
    if (g.shiftX || g.shiftY) parts.push(T('להזיז את הטקסט ') + (g.shiftX < 0 ? T('שמאלה') : g.shiftX > 0 ? T('ימינה') : '') + (g.shiftY < 0 ? T(' ולמעלה') : g.shiftY > 0 ? T(' ולמטה') : ''));
    if (g.lineMarker) parts.push(T('סימון תחילת שורה'));
    if (g.lineMarkerEnd) parts.push(T('סימון סוף שורה'));
    if (g.readMode === 'word') parts.push(T('מילה אחרי מילה'));
    if (g.lineChars) parts.push(T('שורות קצרות יותר'));
    if (g.maxFont) parts.push(T('אותיות לא גדולות מדי'));
    return parts.join(' · ');
  }

  DA.screens.fieldtest = { init: init, enter: enter, leave: leave, summaryHtml: summaryHtml, analyze: analyze };
})(typeof window !== 'undefined' ? window : globalThis);
