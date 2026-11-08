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
  var ctx, stageLens, sess, queue, work, plainSettings, step, stepStart, done = 0, total = 0, paused = false;
  var SAVE = 'da.learn.paused.', lastPraise = -1;

  var PLAIN = { font: 'arial', theme: 'white', letterSpacing: 0, wordSpacing: 0.05, lineHeight: 1.4, warpStrength: 0, sharpen: 0, bold: false, ruler: 'off', shiftX: 0, shiftY: 0, lineMarker: false };

  var START = { digit: 40, 'letter-he': 40, 'letter-en': 40, 'word-he': 34, 'word-en': 34, 'sentence-he': 26, 'sentence-en': 26, silhouette: 70, line: 70, color: 70 };
  // ---------------- voice & sound ----------------
  function voiceOn() { var p = ctx && ctx.profile(); return !!(p && p.settings.gameVoice !== false); }
  function speak(t) { if (voiceOn() && DA.speech) DA.speech.say(t); }
  var actx;
  /** Soft two-note chime after an answer (no right/wrong sound: we praise effort). */
  function chime() {
    if (!voiceOn()) return;
    try {
      actx = actx || new (root.AudioContext || root.webkitAudioContext)();
      [660, 880].forEach(function (f, i) {
        var o = actx.createOscillator(), g = actx.createGain(), t0 = actx.currentTime + i * 0.09;
        o.type = 'sine'; o.frequency.value = f;
        g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(0.12, t0 + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.25);
        o.connect(g).connect(actx.destination); o.start(t0); o.stop(t0 + 0.3);
      });
    } catch (e) { /* no audio: fine */ }
  }
  var PACE_MS = { slow: 3600, normal: 2500, fast: 1700 };   // calm on purpose: this is not a race
  function pace() { var p = ctx && ctx.profile(); var v = p && p.settings.gamePace; return PACE_MS[v] || v === 'manual' ? v : 'normal'; }
  function renderPace() { var sel = $('learnPace'); if (sel) sel.value = pace(); }
  function renderVoiceBtn() {
    var b = $('learnVoice'); if (!b) return;
    b.textContent = voiceOn() ? '🔊' : '🔇';
    b.title = voiceOn() ? T('להשתיק את קול המשחק') : T('להפעיל את קול המשחק');
    b.setAttribute('aria-pressed', voiceOn() ? 'true' : 'false');
  }

  var PRAISE = [T('יפה!'), T('כל הכבוד!'), T('מצוין!'), T('אלוף!'), T('נהדר!'), T('וואו!')];
  
  // ---------------- tuners (preference) ----------------
  function Tournament(param, candidates, label) {
    this.k = 'T'; this.param = param; this.label = label;
    this.champ = candidates[0]; this.rest = candidates.slice(1);
  }
  Tournament.prototype.next = function () {
    if (!this.rest.length) return null;
    return { param: this.param, a: this.champ, b: this.rest[0], label: this.label };
  };
  Tournament.prototype.answer = function (winner) {
    this._used = (this._used || 0) + 1;
    var challenger = this.rest.shift();
    if (winner === 'b') this.champ = challenger;
  };
  Tournament.prototype.result = function () { return this.champ; };

  function Search(param, start, stepSize, min, max, maxTrials, label) {
    this.k = 'S'; this.param = param; this.label = label;
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

  /** Warp check: two with/without comparisons. */
  function Warp() { this.k = 'W'; this.warp = true; this.n = 0; this.votes = []; }
  Warp.prototype.next = function () { return this.n < 2 ? { param: 'warp' } : null; };
  Warp.prototype.units = function () { return 2; };
  Tournament.prototype.units = function () { return (this.rest ? this.rest.length : 0) + (this._used || 0); };
  Search.prototype.units = function () { return this.maxTrials; };

  // ---------------- staircase (recognition) ----------------
  function Staircase(category, condition, start, maxTrials) {
    this.k = 'C'; this.category = category; this.condition = condition;
    this.size = start; this.run = 0; this.lastDir = 0; this.reversals = [];
    this.n = 0; this.correct = 0; this.rts = []; this.maxTrials = maxTrials;
  }
  Staircase.prototype.done = function () { return this.n >= this.maxTrials || this.reversals.length >= 4; };
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
      DA.ui.ask(T('לסיים עכשיו ולראות את מה שלמדנו עד כאן?'), T('לסיים')).then(function (y) { if (y) { clearSaved(); finish(true); } });
    };
    $('learnPause').onclick = pause;
    $('learnPace').onchange = function () {
      ctx.updateSettings(Object.assign({}, ctx.profile().settings, { gamePace: this.value }));
      this.blur();
    };
    $('learnVoice').onclick = function () {
      var on = !voiceOn();
      ctx.updateSettings(Object.assign({}, ctx.profile().settings, { gameVoice: on }));
      renderVoiceBtn();
      if (on) speak(T('הקול פועל')); else if (root.speechSynthesis) root.speechSynthesis.cancel();
    };
    $('learnResumeBtn').onclick = resume;
    $('learnPauseLater').onclick = function () { save(); ctx.go('hub'); };
    $('learnContinue').onclick = function () { if (restore()) { showPlay(); resume(); } };
    $('learnRestart').onclick = function () { clearSaved(); $('learnResume').style.display = 'none'; };
    var box = $('catChecks');
    DA.stimuli.CATEGORIES.forEach(function (cat) {
      var l = document.createElement('label');
      l.className = 'chip';
      l.innerHTML = '<input type="checkbox" value="' + cat.id + '"' + (defaultCats(false).indexOf(cat.id) >= 0 ? ' checked' : '') + '> ' + cat.icon + ' ' + esc(cat.label);
      box.appendChild(l);
    });
    document.addEventListener('keydown', function (e) {
      if (ctx.current() !== 'learn' || !step || paused) return;
      if (e.key === 'Escape' || e.key === 'p') { pause(); return; }
      if (step.type === 'recognize' && /^[1-4]$/.test(e.key)) { var b = $('learnChoices').querySelectorAll('button')[+e.key - 1]; if (b) b.click(); }
    });
  }

  function enter() {
    var p = ctx.profile();
    if (!p) { ctx.go('home'); return; }
    sess = null; step = null; paused = false;
    $('learnSetup').style.display = '';
    $('learnPlay').style.display = 'none';
    $('learnEnd').style.display = 'none';
    $('learnPaused').style.display = 'none';
    renderVoiceBtn();
    renderPace();
    var saved = loadSaved();
    $('learnResume').style.display = saved ? '' : 'none';
    if (saved) $('learnResumePct').textContent = Math.round(saved.pct) + '%';
    $('learnHasCal').style.display = ctx.opsFor(p.settings) ? 'none' : '';
    $('learnWhoAvatar').textContent = p.emoji;
    document.querySelectorAll('#catChecks input').forEach(function (i) {
      var def = defaultCats(p.kind === 'adult');
      i.checked = def.indexOf(i.value) >= 0;
    });
  }
  function leave() {
    if (sess && $('learnPlay').style.display !== 'none') save();   // leaving mid-game: keep the place
    step = null; sess = null; paused = false;
  }

  // ---------------- pause & resume ----------------
  function key() { var p = ctx.profile(); return p ? SAVE + p.id : null; }
  function pct() { return total ? Math.min(100, doneUnits() / total * 100) : 0; }
  function save() {
    if (!sess || !key()) return;
    try {
      localStorage.setItem(key(), JSON.stringify({ v: 1, pct: pct(), sess: sess, queue: queue, work: work, plain: plainSettings, prefDone: done, total: total, savedAt: Date.now() }));
    } catch (e) { /* storage full: pause still works for this visit */ }
  }
  function loadSaved() {
    try {
      var d = key() && JSON.parse(localStorage.getItem(key()) || 'null');
      if (!d || d.v !== 1 || Date.now() - d.savedAt > 14 * 864e5) return null;   // older than two weeks: start fresh
      return d;
    } catch (e) { return null; }
  }
  function clearSaved() { if (key()) localStorage.removeItem(key()); }
  var PROTO = { T: Tournament.prototype, S: Search.prototype, C: Staircase.prototype, W: Warp.prototype };
  function revive(o) { return Object.assign(Object.create(PROTO[o.k] || Object.prototype), o); }
  function restore() {
    var d = loadSaved();
    if (!d) return false;
    sess = d.sess; sess._stairs = (sess._stairs || []).map(revive);
    queue = d.queue.map(revive);
    work = d.work; plainSettings = d.plain; done = d.prefDone; total = d.total;
    return true;
  }
  function showPlay() {
    $('learnSetup').style.display = 'none';
    $('learnPlay').style.display = '';
  }
  function pause() {
    if (!sess || paused) return;
    paused = true; step = null;
    save();
    if (root.speechSynthesis) root.speechSynthesis.cancel();
    $('learnPaused').style.display = '';
    $('learnPausedPct').textContent = Math.round(pct()) + '%';
    setTimeout(function () { speak(T('המשחק בהפסקה. המקום נשמר. כשתרצו, לחצו להמשיך.')); }, 50);
  }
  function resume() {
    paused = false;
    $('learnPaused').style.display = 'none';
    nextStep();
  }

  function quickPlan() {
    var adult = ctx.profile() && ctx.profile().kind === 'adult';
    return adult
      ? { name: 'quick-adult', prefs: ['theme', 'font', 'letterSpacing', 'lineHeight', 'warp'], categories: defaultCats(true), maxTrials: 5, prefTrials: 2, themes: 3 }
      : { name: 'quick-child', prefs: ['theme', 'letterSpacing', 'warp'], categories: defaultCats(false), maxTrials: 5, prefTrials: 2, themes: 3 };
  }
  /** Default recognition categories, in the interface language. */
  function defaultCats(adult) {
    var L = DA.i18n.content;
    return adult ? ['letter-' + L, 'sentence-' + L] : ['digit', 'word-' + L];
  }
  function customPlan() {
    var cats = Array.prototype.map.call(document.querySelectorAll('#catChecks input:checked'), function (i) { return i.value; });
    var prefs = Array.prototype.map.call(document.querySelectorAll('#prefChecks input:checked'), function (i) { return i.value; });
    return { name: 'custom', prefs: prefs, categories: cats, maxTrials: +$('trialsPer').value || 8, prefTrials: 3, themes: 4 };
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
    clearSaved(); paused = false;
    var pt = plan.prefTrials || 3;
    work = DA.settings.normalize(p.settings);
    plainSettings = DA.settings.normalize(Object.assign({}, work, PLAIN));
    var hasWarp = !!ctx.opsFor(work);
    queue = [];
    plan.prefs.forEach(function (k) {
      if (k === 'theme') queue.push(new Tournament('theme', uniq([work.theme, 'cream', 'dark', 'yellow', 'white']).slice(0, plan.themes || 4), T('צבעים')));
      if (k === 'font') queue.push(new Tournament('font', uniq([work.font, 'round', 'assistant', 'serif', 'rubik']).slice(0, 3), T('גופן'))); // Hebrew-capable fonts only
      if (k === 'letterSpacing') queue.push(new Search('letterSpacing', work.letterSpacing, 0.08, 0, 0.35, pt, T('ריווח')));
      if (k === 'lineHeight') queue.push(new Search('lineHeight', work.lineHeight, 0.4, 1.2, 2.6, pt, T('ריווח שורות')));
      if (k === 'bold') queue.push(new Tournament('bold', [work.bold, !work.bold], T('עובי')));
      if (k === 'sharpen') queue.push(new Search('sharpen', work.sharpen, 0.5, 0, 1.5, pt, T('חדות')));
      if (k === 'warp' && hasWarp) queue.push(new Warp());
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
      calibrationId: hasWarp ? work.calibrationId : null,
      glasses: ctx.glasses()
    };
    sess._stairs = stairs;
    total = queue.reduce(function (a, t) { return a + t.units(); }, 0) + stairs.length * plan.maxTrials;
    done = 0;
    showPlay();
    renderVoiceBtn();
    renderPace();
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

  function doneUnits() {
    var st = (sess && sess._stairs || []).reduce(function (a, s) { return a + (s.done() ? s.maxTrials : s.n); }, 0);
    return st + done;
  }
  function renderProgress() {
    var u = doneUnits(), pc = total ? Math.min(100, Math.round(u / total * 100)) : 0;
    $('learnProgress').style.width = pc + '%';
    $('learnProgressBar').setAttribute('aria-valuenow', pc);
    $('learnCount').textContent = Math.min(u + 1, total) + ' / ' + total;
    $('learnStars').textContent = '⭐'.repeat(Math.floor(pc / 20));
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
    if (work.cvi) {
      // simple & focused: only two answers, the target and one other
      var tgt = trial.choices.filter(function (c) { return c.key === trial.answer; });
      var other = trial.choices.filter(function (c) { return c.key !== trial.answer; }).slice(0, 1);
      trial.choices = Math.random() < 0.5 ? tgt.concat(other) : other.concat(tgt);
    }
    $('learnStage').classList.toggle('cvi', !!work.cvi);
    var size = isCatch ? Math.max(st.size * 2.5, START[st.category] * 1.5) : st.size;
    step = { type: 'recognize', st: st, trial: trial, size: size, isCatch: !!isCatch };
    $('learnContent').innerHTML = '<div class="stim-wrap">' + trial.html(Math.round(size)) + '</div>';
    // a very large word must still fit inside the card: shrink to fit and record the size actually shown
    var wrap = $('learnContent').firstChild, stageW = $('learnStage').clientWidth * 0.9;
    if (wrap && stageW && wrap.scrollWidth > stageW) {
      size = Math.max(6, size * stageW / wrap.scrollWidth);
      $('learnContent').innerHTML = '<div class="stim-wrap">' + trial.html(Math.round(size)) + '</div>';
      step.size = size;
      if (!isCatch) st.size = Math.min(st.size, size);   // the staircase cannot go beyond what fits
    }
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
    if (!step.isCatch) step.st.answer(ok, rt);
    else { sess.catchTrials = (sess.catchTrials || 0) + 1; if (!ok) sess.catchMisses = (sess.catchMisses || 0) + 1; }
    sess.log.push({ category: step.st.category, condition: step.st.condition, size: Math.round(step.size * 10) / 10, target: step.trial.answer, response: key, correct: ok, rtMs: rt, catchTrial: step.isCatch, eyes: DA.eyes.snapshot() });
    // praise effort, not correctness (keeps children motivated and honest)
    var pi; do { pi = Math.floor(Math.random() * PRAISE.length); } while (pi === lastPraise && PRAISE.length > 1); lastPraise = pi;
    feedback('⭐ ' + PRAISE[pi]);
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
    chime();
    speak(text);
    var f = $('learnFeedback');
    f.textContent = text;
    f.classList.add('show');
    $('learnChoices').querySelectorAll('button').forEach(function (b) { b.disabled = true; });
    var go = function () { f.classList.remove('show'); if (sess && !paused && ctx.current() === 'learn') nextStep(); };
    var pc = pace();
    if (pc === 'manual') {
      // at the player's own pace: a big Next button (also Enter / space)
      step = { type: 'wait' };
      choices([{ html: T('הבא ◀'), cls: 'next-btn', fn: go }]);
      var nb = $('learnChoices').querySelector('.next-btn'); if (nb) nb.focus();
      return;
    }
    var ms = PACE_MS[pc] + (work && work.cvi ? 600 : 0);
    setTimeout(go, ms);
  }

  // ---------------- end ----------------
  function finish(early) {
    var p = ctx.profile();
    step = null; paused = false;
    clearSaved();
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
    var endMsg = early
      ? T('עצרנו כאן, וזה בסדר גמור. גם ממה שהספקנו למדנו משהו חשוב עליך. רוצים לשמור? לחצו על הכפתור הגדול עם הכוכב.')
      : T('מצאנו בשבילך את הדרך הכי נוחה לקרוא. לחצו על הכפתור הגדול עם הכוכב, ומעכשיו כל טקסט באפליקציה ייראה בדיוק ככה.');
    var endTitle = early ? T('🌟 עצרנו לנוח') : T('🏆 כל הכבוד, סיימת!');
    $('learnEndTitle').textContent = endTitle;
    var hasCal = !!ctx.opsFor(ctx.profile().settings);
    $('learnNextQ').style.display = hasCal ? 'none' : '';
    $('learnNextYes').style.display = hasCal ? 'none' : '';
    $('learnNextHasCal').style.display = hasCal ? '' : 'none';
    $('learnNextNo').textContent = hasCal ? T('לצאת לקרוא 📖') : T('לא ← אפשר לצאת לקרוא 📖');
    $('learnNextYes').onclick = function () { ctx.updateSettings(last.after); ctx.go('calibrate'); };
    $('learnNextNo').onclick = function () { ctx.updateSettings(last.after); ctx.store.setPref('read.intent', 'read'); ctx.go('read'); };
    var nextSay = hasCal ? '' : ' ' + T('ושאלה אחת לסיום: קווים ישרים נראים לך לפעמים עקומים, גליים או עם חלק חסר? אם כן, כדאי לעשות גם כיול עיוות.');
    $('learnEndSay').textContent = endMsg;
    setTimeout(function () { speak(endTitle + ' ' + endMsg + nextSay); }, 300);
    $('learnApplyBest').onclick = function () {
      ctx.updateSettings(sess.after);
      ctx.profiles.setBest(ctx.profile(), sess.after);
      DA.ui.toast(T('⭐ נשמר כמצב שלך')); ctx.go('hub');
    };
    $('learnApply').onclick = function () { ctx.updateSettings(sess.after); DA.ui.toast(T('ההגדרות החדשות פועלות. ⭐ המצב שלי נשאר כמו שהיה.')); ctx.go('hub'); };
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
