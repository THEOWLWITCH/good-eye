/*
 * DA — The learning & verification game ("משחק ההתאמה").
 *
 * Two kinds of rounds, both answerable by a 7-year-old with one tap:
 *  1. Preference ("מה יותר ברור?"): two versions side by side (or, for the warp, one after the
 *     other at the same place). Categorical settings run a small tournament; continuous ones an
 *     adaptive up/down search that halves its step on each reversal.
 *  2. Recognition ("מה ראית?"): a stimulus (digit, silhouette, line drawing, colour drawing,
 *     letter, word, sentence — Hebrew/English) and 4 big answer buttons. A 2-down/1-up staircase
 *     on size finds the smallest size recognised (~71% correct), separately WITH the personal
 *     settings and WITHOUT them, interleaved — this is the verification (אישוש) of the calibration.
 * The results update the reader's settings and are stored as a session for later comparison.
 */
(function (root) {
  'use strict';
  var DA = root.DA;
  DA.screens = DA.screens || {};
  var $ = DA.ui.$, esc = DA.ui.esc;
  var ctx, stageLens, sess, queue, work, plainSettings, step, stepStart, done = 0, total = 0;

  var PLAIN = { font: 'arial', theme: 'white', letterSpacing: 0, wordSpacing: 0.05, lineHeight: 1.4, warpStrength: 0, sharpen: 0, bold: false, ruler: 'off', shiftX: 0, shiftY: 0, lineMarker: false };

  var START = { digit: 40, 'letter-he': 40, 'letter-en': 40, 'word-he': 34, 'word-en': 34, 'sentence-he': 26, 'sentence-en': 26, silhouette: 70, line: 70, color: 70 };
  var PRAISE = [T('יפה!'), T('כל הכבוד!'), T('מצוין!'), T('אלוף!'), T('נהדר!'), T('וואו!')];
  
  // ---------------- tuners (preference) ----------------
  function Tournament(param, candidates, label) {
    this.param = param; this.label = label;
    this.champ = candidates[0]; this.rest = candidates.slice(1);
  }
  Tournament.prototype.next = function () {
    if (!this.rest.length) return null;
    return { param: this.param, a: this.champ, b: this.rest[0], label: this.label };
  };
  Tournament.prototype.answer = function (winner) {
    var challenger = this.rest.shift();
    if (winner === 'b') this.champ = challenger;
  };
  Tournament.prototype.result = function () { return this.champ; };

  function Search(param, start, stepSize, min, max, maxTrials, label) {
    this.param = param; this.label = label;
    this.cur = start; this.step = stepSize; this.dir = 1; this.min = min; this.max = max;
    this.n = 0; this.maxTrials = maxTrials;
  }
  Search.prototype._cand = function () {
    var c = this.cur + this.dir * this.step;
    if (c > this.max || c < this.min) { this.dir = -this.dir; c = this.cur + this.dir * this.step; }
    return Math.round(Math.min(this.max, Math.max(this.min, c)) * 1000) / 1000;
  };
  Search.prototype.next = function () {
    if (this.n >= this.maxTrials) return null;
    this.pending = this._cand();
    return { param: this.param, a: this.cur, b: this.pending, label: this.label };
  };
  Search.prototype.answer = function (winner) {
    this.n++;
    if (winner === 'b') this.cur = this.pending;
    else { this.dir = -this.dir; this.step /= 2; }   // reversal (or "same"): narrow the search
  };
  Search.prototype.result = function () { return this.cur; };

  // ---------------- staircase (recognition) ----------------
  function Staircase(category, condition, start, maxTrials) {
    this.category = category; this.condition = condition;
    this.size = start; this.run = 0; this.lastDir = 0; this.reversals = [];
    this.n = 0; this.correct = 0; this.rts = []; this.maxTrials = maxTrials;
  }
  Staircase.prototype.done = function () { return this.n >= this.maxTrials || this.reversals.length >= 5; };
  Staircase.prototype.answer = function (ok, rt) {
    this.n++; this.rts.push(rt);
    var dir = 0;
    if (ok) { this.correct++; this.run++; if (this.run >= 2) { dir = -1; this.run = 0; } }
    else { dir = 1; this.run = 0; }
    if (dir) {
      if (this.lastDir && dir !== this.lastDir) this.reversals.push(this.size);
      this.lastDir = dir;
      this.size = Math.max(6, Math.min(200, this.size * (dir < 0 ? 0.8 : 1.25)));
    }
  };
  Staircase.prototype.threshold = function () {
    var r = this.reversals.slice(-4);
    if (!r.length) return this.lastDir < 0 || this.correct === this.n ? this.size / 0.8 * 0.9 : this.size;
    return Math.exp(r.reduce(function (a, v) { return a + Math.log(v); }, 0) / r.length);
  };
  Staircase.prototype.summary = function () {
    var med = this.rts.slice().sort(function (a, b) { return a - b; })[Math.floor(this.rts.length / 2)] || null;
    return { threshold: Math.round(this.threshold() * 10) / 10, trials: this.n, correct: this.correct, medianRtMs: med, reversals: this.reversals.length };
  };

  // ---------------- setup ----------------
  function init(c) {
    ctx = c;
    stageLens = new DA.Lens($('learnStage'));
    $('quickGame').onclick = function () { start(quickPlan()); };
    $('customGame').onclick = function () { start(customPlan()); };
    DA.eyePanel.bindSwitch($('learnEyes'));
    $('learnExit').onclick = function () {
      if (!sess) { ctx.go('hub'); return; }
      DA.ui.ask(T('לצאת מהמשחק? מה שכבר למדנו יישמר.'), T('יציאה')).then(function (y) { if (y) finish(true); });
    };
    var box = $('catChecks');
    DA.stimuli.CATEGORIES.forEach(function (cat) {
      var l = document.createElement('label');
      l.className = 'chip';
      l.innerHTML = '<input type="checkbox" value="' + cat.id + '"' + (defaultCats(false).indexOf(cat.id) >= 0 ? ' checked' : '') + '> ' + cat.icon + ' ' + esc(cat.label);
      box.appendChild(l);
    });
    document.addEventListener('keydown', function (e) {
      if (ctx.current() !== 'learn' || !step) return;
      if (step.type === 'recognize' && /^[1-4]$/.test(e.key)) { var b = $('learnChoices').querySelectorAll('button')[+e.key - 1]; if (b) b.click(); }
    });
  }

  function enter() {
    var p = ctx.profile();
    if (!p) { ctx.go('home'); return; }
    sess = null; step = null;
    $('learnSetup').style.display = '';
    $('learnPlay').style.display = 'none';
    $('learnEnd').style.display = 'none';
    $('learnHasCal').style.display = ctx.opsFor(p.settings) ? 'none' : '';
    $('learnWhoAvatar').textContent = p.emoji;
    document.querySelectorAll('#catChecks input').forEach(function (i) {
      var def = defaultCats(p.kind === 'adult');
      i.checked = def.indexOf(i.value) >= 0;
    });
  }
  function leave() { step = null; }

  function quickPlan() {
    var adult = ctx.profile() && ctx.profile().kind === 'adult';
    return adult
      ? { name: 'quick-adult', prefs: ['theme', 'font', 'letterSpacing', 'lineHeight', 'warp'], categories: defaultCats(true), maxTrials: 7 }
      : { name: 'quick-child', prefs: ['theme', 'font', 'letterSpacing', 'warp'], categories: defaultCats(false), maxTrials: 6 };
  }
  /** Default recognition categories, in the interface language. */
  function defaultCats(adult) {
    var L = DA.i18n.content;
    return adult ? ['letter-' + L, 'word-' + L, 'sentence-' + L] : ['digit', 'line', 'word-' + L];
  }
  function customPlan() {
    var cats = Array.prototype.map.call(document.querySelectorAll('#catChecks input:checked'), function (i) { return i.value; });
    var prefs = Array.prototype.map.call(document.querySelectorAll('#prefChecks input:checked'), function (i) { return i.value; });
    return { name: 'custom', prefs: prefs, categories: cats, maxTrials: +$('trialsPer').value || 8 };
  }

  function lastThreshold(category) {
    var ss = ctx.profiles.sessionsFor(ctx.profile().id);
    for (var i = 0; i < ss.length; i++) {
      var r = ss[i].recognition && ss[i].recognition[category];
      if (r && r.corrected && r.corrected.threshold) return r.corrected.threshold;
    }
    return null;
  }

  function start(plan) {
    var p = ctx.profile();
    work = DA.settings.normalize(p.settings);
    plainSettings = DA.settings.normalize(Object.assign({}, work, PLAIN));
    var hasWarp = !!ctx.opsFor(work);
    queue = [];
    plan.prefs.forEach(function (k) {
      if (k === 'theme') queue.push(new Tournament('theme', uniq([work.theme, 'cream', 'dark', 'yellow', 'white']).slice(0, 4), T('צבעים')));
      if (k === 'font') queue.push(new Tournament('font', uniq([work.font, 'round', 'assistant', 'serif', 'rubik']).slice(0, 3), T('גופן'))); // Hebrew-capable fonts only
      if (k === 'letterSpacing') queue.push(new Search('letterSpacing', work.letterSpacing, 0.08, 0, 0.35, 3, T('ריווח')));
      if (k === 'lineHeight') queue.push(new Search('lineHeight', work.lineHeight, 0.4, 1.2, 2.6, 3, T('ריווח שורות')));
      if (k === 'bold') queue.push(new Tournament('bold', [work.bold, !work.bold], T('עובי')));
      if (k === 'sharpen') queue.push(new Search('sharpen', work.sharpen, 0.5, 0, 1.5, 3, T('חדות')));
      if (k === 'warp' && hasWarp) queue.push({ warp: true, n: 0, votes: [], next: function () { return this.n < 2 ? { param: 'warp' } : null; } });
    });
    var stairs = [];
    plan.categories.forEach(function (cat) {
      var prev = lastThreshold(cat);
      var s0 = prev ? Math.max(START[cat] * 0.5, prev * 1.6) : START[cat];
      stairs.push(new Staircase(cat, 'corrected', s0, plan.maxTrials));
      stairs.push(new Staircase(cat, 'plain', s0, plan.maxTrials));
    });
    sess = {
      schema: 'da.session/1', id: 'L' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
      profileId: p.id, kind: 'learn', plan: plan, softwareVersion: DA.VERSION,
      startedAt: new Date().toISOString(), before: work, prefs: [], recognition: {}, log: [],
      display: { w: window.innerWidth, h: window.innerHeight, dpr: window.devicePixelRatio || 1 },
      calibrationId: hasWarp ? work.calibrationId : null
    };
    sess._stairs = stairs;
    total = queue.reduce(function (a, t) { return a + (t.warp ? 2 : t.maxTrials || (t.rest ? t.rest.length : 1)); }, 0) + stairs.length * plan.maxTrials;
    done = 0;
    $('learnSetup').style.display = 'none';
    $('learnPlay').style.display = '';
    nextStep();
  }
  function uniq(a) { return a.filter(function (v, i) { return a.indexOf(v) === i; }); }

  // ---------------- run loop ----------------
  function nextStep() {
    renderProgress();
    // 1) size staircases first (interleaved, with/without settings, plus easy catch trials)
    var open = sess._stairs.filter(function (s) { return !s.done(); });
    if (open.length) {
      if (Math.random() < 0.12) { showRecognize(open[0], true); return; } // catch trial: big & easy, checks attention
      showRecognize(open[Math.floor(Math.random() * open.length)]);
      return;
    }
    if (!sess._sized) { sess._sized = true; applySizeFromStairs(); }
    // 2) preferences, compared at the comfortable reading size
    while (queue.length) {
      var t = queue[0], c = t.next();
      if (c) { if (c.param === 'warp') showWarp(t); else showPref(t, c); return; }
      var res = t.warp ? null : t.result();
      if (!t.warp) work[t.param] = res;
      queue.shift();
    }
    finish(false);
  }

  /** Comfortable reading size ≈ critical print size: ~2.5× the smallest recognised glyph size. */
  function applySizeFromStairs() {
    var th = sess._stairs.filter(function (s) { return s.condition === 'corrected' && s.n && /letter|word|sentence|digit/.test(s.category); })
      .map(function (s) { return s.threshold() * (/sentence/.test(s.category) ? 1.6 : 2.5); });
    if (th.length) work.fontSize = Math.round(Math.min(96, Math.max(18, Math.max.apply(null, th))));
  }

  function renderProgress() {
    var pct = total ? Math.min(100, Math.round(done / total * 100)) : 0;
    $('learnProgress').style.width = pct + '%';
    $('learnStars').textContent = '⭐'.repeat(Math.floor(pct / 20));
  }

  // ----- preference: side by side -----
  function showPref(tuner, c) {
    var swap = Math.random() < 0.5;
    step = { type: 'pref', tuner: tuner, c: c, swap: swap };
    stepStart = performance.now();
    stageLens.apply(work, ctx.opsFor(work));
    var txt = DA.stimuli.sampleText(DA.i18n.content);
    var content = '<p class="ab-text">' + esc(txt) + '</p><div class="ab-pics">' + DA.stimuli.lineSvg('house', 56) + '<span>🐢</span><span>7</span></div>';
    var left = swap ? 'b' : 'a', right = swap ? 'a' : 'b';
    $('learnContent').innerHTML = '<div class="ab"><button class="ab-panel" data-v="' + right + '">' + content + '</button>' +
      '<button class="ab-panel" data-v="' + left + '">' + content + '</button></div>';
    var panels = $('learnContent').querySelectorAll('.ab-panel');
    panels.forEach(function (el) {
      var v = el.getAttribute('data-v');
      var s = Object.assign({}, work); s[c.param] = c[v];
      var lens = new DA.Lens(el);
      lens.apply(DA.settings.normalize(Object.assign(s, { fontSize: Math.min(work.fontSize, 34), shiftX: 0, shiftY: 0, ruler: 'off' })), null);
      el.onclick = function () { choosePref(v); };
    });
    $('learnPrompt').textContent = T('איזה צד יותר ברור ונעים לקריאה? גע בו 👆');
    choices([{ html: T('🤷 אותו דבר'), cls: 'same', fn: function () { choosePref('same'); } }]);
  }

  function choosePref(v) {
    if (!step || step.type !== 'pref') return;
    var c = step.c;
    sess.prefs.push({ param: c.param, a: c.a, b: c.b, choice: v, chosenValue: v === 'same' ? null : c[v], swapped: step.swap, rtMs: Math.round(performance.now() - stepStart) });
    step.tuner.answer(v === 'same' ? 'a' : v);
    done++;
    feedback('👍');
  }

  // ----- warp verification: one after the other, same place -----
  function showWarp(t) {
    var firstOn = Math.random() < 0.5;
    step = { type: 'warp', t: t, showing: 0, seen: [false, false], order: firstOn ? [1, 0] : [0, 1] };
    stepStart = performance.now();
    var txt = DA.stimuli.sampleText(t.n % 2 ? 'en' : 'he');
    $('learnContent').innerHTML = T('<div class="fix-dot" title="מביטים כאן"></div><div class="warp-view"><p class="ab-text big">') + esc(txt) + '</p>' +
      '<div class="ab-pics">' + DA.stimuli.lineSvg('house', 90) + DA.stimuli.lineSvg('star', 90) + '</div></div>';
    $('learnPrompt').innerHTML = (t.n === 0 ? T('<span class="muted">תיקון העיוות מכויל לעין אחת: כסו את העין השנייה והביטו במרכז. </span><br>') : '') + T('זו תמונה <b id="warpNum">1</b> מתוך 2. לחצו 🔁 כדי לראות את השנייה, ואז בחרו את הברורה יותר.');
    choices([
      { html: T('🔁 להחליף'), cls: 'flip', fn: flipWarp },
      { html: T('👍 זו יותר ברורה'), cls: 'pick', fn: function () { chooseWarp(false); }, disabled: true },
      { html: T('🤷 אותו דבר'), cls: 'same', fn: function () { chooseWarp(true); }, disabled: true }
    ]);
    showWarpVersion(0);
  }
  function showWarpVersion(i) {
    step.showing = i; step.seen[i] = true;
    var on = step.order[i] === 1;
    var s = Object.assign({}, work, { warpStrength: on ? (work.warpStrength || 1) : 0 });
    stageLens.apply(s, ctx.opsFor(work));
    var n = $('warpNum'); if (n) n.textContent = String(i + 1);
    if (step.seen[0] && step.seen[1]) $('learnChoices').querySelectorAll('button').forEach(function (b) { b.disabled = false; });
  }
  function flipWarp() { showWarpVersion(1 - step.showing); }
  function chooseWarp(same) {
    var on = step.order[step.showing] === 1;
    var vote = same ? 0 : (on ? 1 : -1);
    step.t.votes.push(vote); step.t.n++;
    sess.prefs.push({ eyes: DA.eyes.snapshot(), param: 'warp', choice: same ? 'same' : (on ? 'with-correction' : 'without-correction'), firstShown: step.order[0] ? 'with' : 'without', rtMs: Math.round(performance.now() - stepStart) });
    if (step.t.n >= 2) {
      var score = step.t.votes.reduce(function (a, b) { return a + b; }, 0);
      work.warpStrength = score > 0 ? Math.max(1, work.warpStrength) : score < 0 ? 0 : 0.5;
      sess.warpVerdict = score > 0 ? 'helps' : score < 0 ? 'does-not-help' : 'unclear';
    }
    done++;
    feedback('👍');
  }

  // ----- recognition -----
  function showRecognize(st, isCatch) {
    var cond = st.condition === 'corrected' ? work : plainSettings;
    stageLens.apply(cond, st.condition === 'corrected' ? ctx.opsFor(work) : null);
    var trial = DA.stimuli.make(st.category, step && step.trial ? step.trial.answer : null);
    var size = isCatch ? Math.max(st.size * 2.5, START[st.category] * 1.5) : st.size;
    step = { type: 'recognize', st: st, trial: trial, size: size, isCatch: !!isCatch };
    $('learnContent').innerHTML = '<div class="stim-wrap">' + trial.html(Math.round(size)) + '</div>';
    var q = st.category.indexOf('sentence') === 0 ? T('על מה המשפט? בחרו תמונה') :
      st.category.indexOf('word') === 0 ? T('איזו תמונה מתאימה למילה?') : T('מה ראית? בחרו את התשובה');
    $('learnPrompt').textContent = q;
    var buttons = trial.choices.map(function (o) {
      return { html: o.html, cls: 'answer' + (trial.kind === 'glyph' && o.html.length === 1 ? ' glyph' : ''), fn: function () { answerRecognize(o.key); } };
    });
    choices(buttons);
    stepStart = performance.now();
  }

  function answerRecognize(key) {
    if (!step || step.type !== 'recognize') return;
    var ok = key === step.trial.answer, rt = Math.round(performance.now() - stepStart);
    if (!step.isCatch) { step.st.answer(ok, rt); done++; }
    else { sess.catchTrials = (sess.catchTrials || 0) + 1; if (!ok) sess.catchMisses = (sess.catchMisses || 0) + 1; }
    sess.log.push({ category: step.st.category, condition: step.st.condition, size: Math.round(step.size * 10) / 10, target: step.trial.answer, response: key, correct: ok, rtMs: rt, catchTrial: step.isCatch, eyes: DA.eyes.snapshot() });
    // praise effort, not correctness (keeps children motivated and honest)
    feedback('⭐ ' + PRAISE[Math.floor(Math.random() * PRAISE.length)]);
  }

  function choices(list) {
    var box = $('learnChoices');
    box.innerHTML = '';
    list.forEach(function (c) {
      var b = document.createElement('button');
      b.className = 'choice ' + (c.cls || '');
      b.innerHTML = c.html;
      b.disabled = !!c.disabled;
      b.onclick = c.fn;
      box.appendChild(b);
    });
  }

  function feedback(text) {
    var f = $('learnFeedback');
    f.textContent = text;
    f.classList.add('show');
    $('learnChoices').querySelectorAll('button').forEach(function (b) { b.disabled = true; });
    setTimeout(function () { f.classList.remove('show'); nextStep(); }, 650);
  }

  // ---------------- end ----------------
  function finish(early) {
    var p = ctx.profile();
    step = null;
    // finish open tuners with what we have
    queue.forEach(function (t) { if (!t.warp && t.result) work[t.param] = t.result(); });
    var rec = {};
    sess._stairs.forEach(function (s) {
      if (!s.n) return;
      rec[s.category] = rec[s.category] || {};
      rec[s.category][s.condition] = s.summary();
    });
    sess.recognition = rec;
    // suggested reading size: ~2.5× the smallest recognised text size (comfortable print size)
    if (!sess._sized) applySizeFromStairs();
    // eye tracking (if on): viewing distance and how steady the gaze was
    var snaps = sess.log.map(function (l) { return l.eyes; }).filter(Boolean);
    if (snaps.length) {
      var ds = snaps.map(function (x) { return x.distanceCm; }).filter(Boolean).sort(function (a, b) { return a - b; });
      var cs = snaps.filter(function (x) { return x.centered != null; });
      sess.viewing = {
        distanceCmMedian: ds.length ? ds[Math.floor(ds.length / 2)] : null,
        gazeCenteredPct: cs.length ? Math.round(cs.filter(function (x) { return x.centered; }).length / cs.length * 100) : null,
        blinkPerMin: DA.eyes.state.blinkPerMin
      };
      if (sess.viewing.distanceCmMedian) work.refDistanceCm = sess.viewing.distanceCmMedian;
    }
    if (sess.catchTrials) sess.attention = Math.round((1 - (sess.catchMisses || 0) / sess.catchTrials) * 100);
    sess.after = DA.settings.normalize(work);
    sess.endedAt = new Date().toISOString();
    sess.early = !!early;
    delete sess._stairs; delete sess._sized;
    ctx.profiles.saveSession(sess);

    $('learnPlay').style.display = 'none';
    $('learnEnd').style.display = '';
    $('learnEndSummary').innerHTML = summaryHtml(sess);
    $('learnApplyBest').onclick = function () {
      ctx.updateSettings(sess.after);
      ctx.profiles.setBest(ctx.profile(), sess.after);
      DA.ui.toast(T('⭐ נשמר כמצב שלך')); ctx.go('hub');
    };
    $('learnApply').onclick = function () { ctx.updateSettings(sess.after); DA.ui.toast(T('ההגדרות עודכנו')); ctx.go('hub'); };
    $('learnKeep').onclick = function () { ctx.go('hub'); };
    var last = sess;
    sess = null;
    return last;
  }

  var CAT_LABEL = {};
  DA.stimuli.CATEGORIES.forEach(function (c) { CAT_LABEL[c.id] = c.icon + ' ' + c.label; });

  /** Friendly summary of a session (also shown on the hub). */
  function summaryHtml(s) {
    var rows = Object.keys(s.recognition || {}).map(function (k) {
      var r = s.recognition[k], c = r.corrected, pl = r.plain;
      var gain = c && pl && pl.threshold ? Math.round((pl.threshold - c.threshold) / pl.threshold * 100) : null;
      return '<tr><td>' + esc(CAT_LABEL[k] || k) + '</td><td>' + (c ? c.threshold + 'px' : '—') + '</td><td>' + (pl ? pl.threshold + 'px' : '—') + '</td><td>' +
        (gain == null ? '—' : gain > 5 ? T('<b class="good">קטן יותר ב-') + gain + '% ✓</b>' : gain < -5 ? T('<span class="bad">גדול יותר ב-') + (-gain) + '%</span>' : T('בערך אותו דבר')) + '</td></tr>';
    }).join('');
    var warp = s.warpVerdict ? T('<p>תיקון העיוות: ') + ({ helps: T('נבחר כברור יותר ✓'), 'does-not-help': T('לא עזר בבדיקה הזו'), unclear: T('לא חד־משמעי') })[s.warpVerdict] + '</p>' : '';
    return '<p class="muted">' + new Date(s.startedAt).toLocaleString(DA.i18n.locale) + (s.early ? T(' · הופסק באמצע') : '') + '</p>' +
      (rows ? T('<table class="sum"><tr><th>מה ראינו</th><th>הגודל הקטן ביותר שזוהה — עם ההגדרות שלי</th><th>בלי</th><th>שיפור</th></tr>') + rows + '</table>' : '') +
      warp + (s.viewing && s.viewing.distanceCmMedian ? T('<p>👁️ מרחק צפייה ממוצע: ') + s.viewing.distanceCmMedian + T(' ס״מ') +
        (s.viewing.gazeCenteredPct != null ? T(' · מבט במרכז ') + s.viewing.gazeCenteredPct + T('% מהזמן') : '') + '</p>' : '') + (s.attention != null && s.attention < 70 ? T('<p class="bad">בבדיקות הקלות היו טעויות — ייתכן שהייתה עייפות. כדאי לחזור על המשחק ביום אחר.</p>') : '') +
      T('<p><b>ההגדרות שנלמדו:</b> ') + esc(DA.settings.describe(s.after || s.before)) + '</p>';
  }

  DA.screens.learn = { init: init, enter: enter, leave: leave, summaryHtml: summaryHtml };
})(typeof window !== 'undefined' ? window : globalThis);
