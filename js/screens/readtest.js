/*
 * עין טובה — Reading-speed test (MNREAD-style).
 * Sentences appear at sizes that shrink by 0.1 log units (×0.794) each step. The reader reads each
 * one aloud and taps "done"; an adult taps how many words were wrong or missed. From reading speed
 * versus print size we get:
 *   - maximum reading speed (MRS): the plateau of the curve;
 *   - critical print size (CPS): the smallest size still read at ≥ 80% of MRS;
 *   - reading acuity: the smallest size read at all.
 * Recommended text size = CPS + 0.1 log unit (×1.26), as in low-vision practice.
 * Optionally the test is repeated WITHOUT the personal settings, to verify they help.
 */
(function (root) {
  'use strict';
  var DA = root.DA;
  DA.screens = DA.screens || {};
  var $ = DA.ui.$, esc = DA.ui.esc;
  var ctx, lens, run, runs, queue, state, t0, sess, usedSentences;
  var START = 64, STEP = Math.pow(10, -0.1), MIN = 6;
  var PLAIN = { font: 'arial', theme: 'white', letterSpacing: 0, wordSpacing: 0.05, lineHeight: 1.4, warpStrength: 0, sharpen: 0, bold: false,
    ruler: 'off', shiftX: 0, shiftY: 0, lineMarker: false, brightness: 1, warmth: 0, calm: false, cvd: 'none' };

  function init(c) {
    ctx = c;
    lens = new DA.Lens($('rtStage'));
    $('rtStart').onclick = start;
    $('rtCard').onclick = function () { DA.device.calibrate().then(renderCalNote); };
    $('rtExit').onclick = function () {
      DA.ui.ask(T('לעצור את המבחן? מה שכבר נמדד יישמר.'), T('לעצור')).then(function (y) { if (y) finish(true); });
    };
    document.addEventListener('keydown', function (e) {
      if (ctx.current() !== 'readtest' || !state) return;
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        if (state === 'ready') show(); else if (state === 'reading') done();
      } else if (state === 'errors' && /^[0-5]$/.test(e.key)) { errors(+e.key); }
    });
  }

  function renderCalNote() {
    $('rtCalNote').textContent = DA.device.isCalibrated()
      ? T('✓ גודל המסך מכויל. התוצאות יוצגו גם במידות מקובלות (logMAR).')
      : T('כדאי לכייל את גודל המסך עם כרטיס אשראי, כדי לקבל תוצאות במידות מקובלות. בלי כיול, הגודל יוצג בפיקסלים.');
  }

  function enter() {
    var p = ctx.profile();
    if (!p) { ctx.go('home'); return; }
    state = null;
    $('rtSetup').style.display = '';
    $('rtPlay').style.display = 'none';
    $('rtEnd').style.display = 'none';
    $('rtLang').value = DA.i18n.content;
    var e = DA.eyes.state;
    $('rtDist').value = e.running && e.distanceCm ? e.distanceCm : (p.settings.refDistanceCm || 40);
    renderCalNote();
  }
  function leave() { state = null; }

  function start() {
    var p = ctx.profile();
    var conds = $('rtCompare').checked ? (Math.random() < 0.5 ? ['with', 'without'] : ['without', 'with']) : ['with'];
    usedSentences = [];
    sess = {
      schema: 'da.session/1', id: 'R' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), kind: 'mnread',
      profileId: p.id, softwareVersion: DA.VERSION, startedAt: new Date().toISOString(),
      lang: $('rtLang').value, distanceCm: +$('rtDist').value || 40,
      pxPerMm: Math.round(DA.device.pxPerMm() * 1000) / 1000, screenCalibrated: DA.device.isCalibrated(),
      settings: DA.settings.normalize(p.settings), runs: []
    };
    queue = conds.slice();
    runs = [];
    $('rtSetup').style.display = 'none';
    $('rtPlay').style.display = '';
    nextRun();
  }

  function nextRun() {
    if (!queue.length) { finish(false); return; }
    var cond = queue.shift(), p = ctx.profile();
    var s = cond === 'with' ? DA.settings.normalize(p.settings) : DA.settings.normalize(Object.assign({}, p.settings, PLAIN));
    lens.apply(s, cond === 'with' ? ctx.opsFor(s) : null);
    run = { condition: cond, trials: [], size: START, sentences: DA.sentences.pool(sess.lang, usedSentences) };
    runs.push(run);
    $('rtCond').textContent = cond === 'with' ? T('עם ההגדרות האישיות') : T('בלי ההגדרות (להשוואה)');
    ready();
  }

  function ready() {
    state = 'ready';
    $('rtContent').innerHTML = '<p class="rt-wait">👀</p>';
    $('rtPrompt').textContent = T('כשמוכנים, לוחצים "הצג" וקוראים את המשפט בקול, מהר ככל שנוח.');
    buttons([{ html: T('▶ הצג משפט'), cls: 'pick', fn: show }]);
    progress();
  }

  function show() {
    if (state !== 'ready') return;
    var sent = run.sentences.shift() || DA.sentences.pool(sess.lang, [])[0];
    usedSentences.push(sent);
    run.current = sent;
    state = 'reading';
    $('rtContent').innerHTML = '<p class="rt-sentence" dir="' + (sess.lang === 'he' ? 'rtl' : 'ltr') + '" style="font-size:' + Math.round(run.size * 10) / 10 + 'px">' + esc(sent) + '</p>';
    $('rtPrompt').textContent = T('קוראים בקול… ובסוף לוחצים "סיימתי".');
    buttons([
      { html: T('✅ סיימתי'), cls: 'pick', fn: done },
      { html: T('🚫 לא מצליח/ה לקרוא'), cls: 'same', fn: cannot }
    ]);
    t0 = performance.now();
  }

  function done() {
    if (state !== 'reading') return;
    run.ms = performance.now() - t0;
    state = 'errors';
    $('rtContent').innerHTML = '<p class="rt-wait">✍️</p>';
    $('rtPrompt').textContent = T('למבוגר: כמה מילים נקראו לא נכון או דולגו?');
    buttons([0, 1, 2, 3, 4, 5].map(function (n) { return { html: n === 5 ? '5+' : String(n), cls: 'answer', fn: function () { errors(n); } }; }));
  }

  function cannot() {
    if (state !== 'reading') return;
    record(performance.now() - t0, DA.sentences.words(run.current), true);
    endRun();
  }

  function errors(n) {
    if (state !== 'errors') return;
    var w = DA.sentences.words(run.current);
    record(run.ms, Math.min(n, w), false);
    if (n >= w - 1 || run.size * STEP < MIN) { endRun(); return; }
    run.size = run.size * STEP;
    ready();
  }

  function record(ms, errs, gaveUp) {
    var w = DA.sentences.words(run.current), ch = run.current.length;
    var min = ms / 60000, correctFrac = Math.max(0, w - errs) / w;
    run.trials.push({
      size: Math.round(run.size * 10) / 10, sentence: run.current, words: w, chars: ch, ms: Math.round(ms), errors: errs, gaveUp: gaveUp,
      wpm: gaveUp ? 0 : Math.round(w * correctFrac / min * 10) / 10,
      cpm: gaveUp ? 0 : Math.round(ch * correctFrac / min),
      eyes: DA.eyes.snapshot()
    });
  }

  function endRun() { nextRun(); }

  function progress() {
    var n = runs.reduce(function (a, r) { return a + r.trials.length; }, 0);
    var total = sessionTotal();
    $('rtProgress').style.width = Math.min(100, Math.round(n / total * 100)) + '%';
  }
  function sessionTotal() { return (queue.length + runs.length) * 11; }

  function buttons(list) {
    var box = $('rtButtons');
    box.innerHTML = '';
    list.forEach(function (c) {
      var b = document.createElement('button');
      b.className = 'choice ' + (c.cls || '');
      b.innerHTML = c.html;
      b.onclick = c.fn;
      box.appendChild(b);
    });
  }

  // ---------------- analysis ----------------
  /** MRS, CPS and reading acuity from trials sorted by size (largest first). */
  function analyze(trials) {
    var t = trials.slice().sort(function (a, b) { return b.size - a.size; });
    var read = t.filter(function (x) { return !x.gaveUp && x.errors < x.words; });
    if (!read.length) return { mrsWpm: 0, mrsCpm: 0, cps: null, acuity: null };
    // MRS: best 3-trial running mean (the plateau), in characters per minute and words per minute
    var best = 0, bestW = 0;
    for (var i = 0; i < t.length; i++) {
      var win = t.slice(i, i + 3);
      var mc = win.reduce(function (a, x) { return a + x.cpm; }, 0) / win.length;
      var mw = win.reduce(function (a, x) { return a + x.wpm; }, 0) / win.length;
      if (mc > best) { best = mc; bestW = mw; }
    }
    // CPS: smallest size before speed falls below 80% of MRS (one dip allowed)
    var cps = t[0].size, dips = 0;
    for (var k = 0; k < t.length; k++) {
      if (t[k].cpm >= 0.8 * best) { cps = t[k].size; dips = 0; }
      else if (++dips >= 2) break;
    }
    return {
      mrsWpm: Math.round(bestW), mrsCpm: Math.round(best), cps: cps,
      acuity: read[read.length - 1].size,
      recommendedFont: Math.round(Math.min(96, Math.max(16, cps * 1.26)))
    };
  }

  function finish(early) {
    state = null;
    sess.runs = runs.map(function (r) { return { condition: r.condition, trials: r.trials, result: analyze(r.trials) }; }).filter(function (r) { return r.trials.length; });
    sess.endedAt = new Date().toISOString();
    sess.early = !!early;
    if (!sess.runs.length) { ctx.go('hub'); return; }
    ctx.profiles.saveSession(sess);
    $('rtPlay').style.display = 'none';
    $('rtEnd').style.display = '';
    $('rtSummary').innerHTML = summaryHtml(sess, true);
    var withRun = sess.runs.filter(function (r) { return r.condition === 'with'; })[0] || sess.runs[0];
    var rec = withRun.result.recommendedFont;
    $('rtApply').style.display = rec ? '' : 'none';
    $('rtApply').textContent = T('✓ לקבוע גודל אותיות ') + rec + 'px';
    $('rtApply').onclick = function () {
      var patch = { fontSize: rec };
      patch.refDistanceCm = sess.distanceCm;
      ctx.updateSettings(patch);
      DA.ui.toast(T('גודל האותיות עודכן'));
      ctx.go('hub');
    };
    $('rtKeep').onclick = function () { ctx.go('hub'); };
  }

  // ---------------- report ----------------
  function sizeText(px, s) {
    if (px == null) return '—';
    var out = Math.round(px) + 'px';
    if (s.screenCalibrated) {
      var ps = DA.device.printSize(px, s.distanceCm);
      out += ' (logMAR ' + ps.logMAR.toFixed(2) + ', ' + ps.mUnits + 'M)';
    }
    return out;
  }

  function chart(s) {
    var W = 560, H = 230, P = 36;
    var all = [];
    s.runs.forEach(function (r) { all = all.concat(r.trials); });
    if (!all.length) return '';
    var sizes = all.map(function (t) { return t.size; });
    var minS = Math.min.apply(null, sizes), maxS = Math.max.apply(null, sizes);
    var maxW = Math.max(10, Math.max.apply(null, all.map(function (t) { return t.wpm; }))) * 1.1;
    var lx = function (v) { return P + (Math.log(v) - Math.log(minS)) / Math.max(1e-6, Math.log(maxS) - Math.log(minS)) * (W - 2 * P); };
    var ly = function (v) { return H - P - v / maxW * (H - 2 * P); };
    var colors = { with: '#1b6ef3', without: '#9aa6b2' };
    var svg = '<svg class="rt-chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(T('מהירות קריאה לפי גודל אותיות')) + '" dir="ltr">';
    svg += '<line x1="' + P + '" y1="' + (H - P) + '" x2="' + (W - P) + '" y2="' + (H - P) + '" stroke="#c5ced6"/>';
    svg += '<line x1="' + P + '" y1="' + P + '" x2="' + P + '" y2="' + (H - P) + '" stroke="#c5ced6"/>';
    svg += '<text x="' + (W / 2) + '" y="' + (H - 6) + '" font-size="12" text-anchor="middle" fill="#6d7a86">' + esc(T('גודל אותיות (px) — קטן ← → גדול')) + '</text>';
    svg += '<text x="12" y="' + (H / 2) + '" font-size="12" text-anchor="middle" fill="#6d7a86" transform="rotate(-90 12 ' + (H / 2) + ')">' + esc(T('מילים לדקה')) + '</text>';
    s.runs.forEach(function (r) {
      var pts = r.trials.slice().sort(function (a, b) { return a.size - b.size; });
      var c = colors[r.condition] || '#1b6ef3';
      svg += '<polyline fill="none" stroke="' + c + '" stroke-width="2.5" points="' + pts.map(function (t) { return lx(t.size).toFixed(1) + ',' + ly(t.wpm).toFixed(1); }).join(' ') + '"/>';
      pts.forEach(function (t) {
        svg += '<circle cx="' + lx(t.size).toFixed(1) + '" cy="' + ly(t.wpm).toFixed(1) + '" r="4" fill="' + c + '"><title>' + t.size + 'px: ' + t.wpm + ' wpm</title></circle>';
        svg += '<text x="' + lx(t.size).toFixed(1) + '" y="' + (H - P + 14) + '" font-size="10" text-anchor="middle" fill="#6d7a86">' + Math.round(t.size) + '</text>';
      });
      if (r.result && r.result.cps) svg += '<line x1="' + lx(r.result.cps).toFixed(1) + '" y1="' + P + '" x2="' + lx(r.result.cps).toFixed(1) + '" y2="' + (H - P) + '" stroke="' + c + '" stroke-dasharray="4 4"/>';
    });
    return svg + '</svg>';
  }

  function summaryHtml(s, full) {
    var rows = s.runs.map(function (r) {
      var x = r.result || analyze(r.trials);
      return '<tr><td>' + (r.condition === 'with' ? T('עם ההגדרות שלי') : T('בלי ההגדרות')) + '</td><td>' + x.mrsWpm + '</td><td>' + sizeText(x.cps, s) + '</td><td>' + sizeText(x.acuity, s) + '</td></tr>';
    }).join('');
    var w = s.runs.filter(function (r) { return r.condition === 'with'; })[0], wo = s.runs.filter(function (r) { return r.condition === 'without'; })[0];
    var verdict = '';
    if (w && wo && w.result && wo.result && wo.result.mrsWpm) {
      var gain = Math.round((w.result.mrsWpm - wo.result.mrsWpm) / wo.result.mrsWpm * 100);
      verdict = '<p>' + (gain > 8 ? '<b class="good">' + T('עם ההגדרות קוראים מהר יותר ב־') + gain + '% ✓</b>'
        : gain < -8 ? '<span class="bad">' + T('בלי ההגדרות הקריאה הייתה מהירה יותר. כדאי לבדוק את ההגדרות.') + '</span>'
        : T('מהירות דומה עם ההגדרות ובלעדיהן.')) + '</p>';
    }
    return '<p class="muted">⏱️ ' + T('מבחן מהירות קריאה') + ' · ' + new Date(s.startedAt).toLocaleString(DA.i18n.locale) + ' · ' + s.distanceCm + T(' ס״מ') +
      (s.early ? T(' · הופסק באמצע') : '') + '</p>' +
      '<table class="sum"><tr><th></th><th>' + T('מהירות מרבית (מילים לדקה)') + '</th><th>' + T('גודל קריטי (הכי קטן שעדיין קוראים מהר)') + '</th><th>' + T('הגודל הקטן ביותר שנקרא') + '</th></tr>' + rows + '</table>' +
      verdict + (full ? chart(s) : '') +
      (full && w && w.result.recommendedFont ? '<p>' + T('המלצה: גודל אותיות של ') + '<b>' + w.result.recommendedFont + 'px</b>' + T(' (קצת מעל הגודל הקריטי, כדי שהקריאה תהיה נוחה).') + '</p>' : '') +
      (full && !s.screenCalibrated ? '<p class="muted small">' + T('הגדלים בפיקסלים. אחרי כיול גודל המסך יוצגו גם במידות מקובלות.') + '</p>' : '');
  }

  DA.screens.readtest = { init: init, enter: enter, leave: leave, summaryHtml: summaryHtml, analyze: analyze };
})(typeof window !== 'undefined' ? window : globalThis);
