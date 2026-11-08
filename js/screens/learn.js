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
 * The game is a short journey of stations, each a different activity so it never feels the same:
 *   📏 lines (each eye: straight / wavy / missing part — a hint for distortion calibration),
 *   🔍 size (words, then numbers or letters), 🌫️ faint letters (contrast), 🎨 colours (odd one out),
 *   ✨ what is more comfortable (colours, spacing, brightness, and the distortion correction if any).
 * The results update the reader's settings and are stored as a session for later comparison.
 * It is a helper, not a medical test: the line, contrast and colour checks only suggest settings and next steps.
 */
(function (root) {
  'use strict';
  var DA = root.DA;
  DA.screens = DA.screens || {};
  var $ = DA.ui.$, esc = DA.ui.esc;
  var ctx, stageLens, sess, queue, work, plainSettings, step, stepStart, done = 0, total = 0, paused = false;
  var SAVE = 'da.learn.paused.', lastPraise = -1;

  var PLAIN = { font: 'arial', theme: 'white', letterSpacing: 0, wordSpacing: 0.05, lineHeight: 1.4, warpStrength: 0, sharpen: 0, bold: false, ruler: 'off', shiftX: 0, shiftY: 0, lineMarker: false, lineMarkerEnd: false, brightness: 1, warmth: 0, calm: false, cvd: 'none' };

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
    b.innerHTML = DA.icons.svg(voiceOn() ? 'sound' : 'mute');
    b.title = voiceOn() ? T('להשתיק את קול הטיסה') : T('להפעיל את קול הטיסה');
    b.setAttribute('aria-pressed', voiceOn() ? 'true' : 'false');
  }

  var PRAISE = [T('יופי!'), T('מעולה!'), T('ממשיכים!'), T('אחלה!'), T('נהדר!'), T('יפה!')];   // praise effort, never right/wrong
  
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

  /**
   * Faint letters: Weber contrast of a grey digit on a fixed white background (no theme, no filters).
   * Fast start (halve after each right answer until the first miss), then 2-down/1-up in 0.15-log steps.
   */
  function Contrast(maxTrials) { this.k = 'K'; this.c = 0.5; this.n = 0; this.run = 0; this.lastDir = 0; this.rev = []; this.maxTrials = maxTrials; this.correct = 0; this.fast = true; }
  Contrast.prototype.done = function () { return this.n >= this.maxTrials; };
  Contrast.prototype.answer = function (ok) {
    this.n++; var dir = 0;
    if (ok) { this.correct++; this.run++; if (this.fast || this.run >= 2) { dir = -1; this.run = 0; } } else { dir = 1; this.run = 0; this.fast = false; }
    if (dir) {
      if (this.lastDir && dir !== this.lastDir) this.rev.push(this.c);
      this.lastDir = dir;
      this.c = Math.max(0.02, Math.min(1, this.c * (dir < 0 ? (this.fast ? 0.5 : 0.7) : 1.43)));
    }
  };
  /** Weber contrast threshold, or null when not reached reliably (fewer than 2 reversals after the first). */
  Contrast.prototype.threshold = function () {
    var r = this.rev.slice(1);
    if (r.length < 2) return this.correct === this.n && this.n ? this.c : null;   // never missed: at least this faint
    return Math.round(Math.exp(r.reduce(function (a, v) { return a + Math.log(v); }, 0) / r.length) * 1000) / 1000;
  };
  /** sRGB grey for a digit with Weber contrast c on white. */
  function greyFor(c) {
    var L = Math.max(0, 1 - c), v = L <= 0.0031308 ? 12.92 * L : 1.055 * Math.pow(L, 1 / 2.4) - 0.055, g = Math.round(v * 255);
    return 'rgb(' + g + ',' + g + ',' + g + ')';
  }
  /** Colours: find the circle that is a different colour (red–green four times, blue–green twice), with brightness jitter. */
  function ColorCheck() {
    this.k = 'D'; this.pairs = shuffleArr(['rg', 'rg', 'rg', 'rg', 'by', 'by']); this.n = 0; this.miss = { rg: 0, by: 0 }; this.maxTrials = 6;
  }
  ColorCheck.prototype.done = function () { return this.n >= this.maxTrials; };
  ColorCheck.prototype.answer = function (ok) { if (!ok) this.miss[this.pairs[this.n]]++; this.n++; };
  /** Only a hint for a suggestion; never a label and never applied automatically. */
  ColorCheck.prototype.hint = function () { return this.miss.rg >= 3 ? 'rg' : (this.miss.by >= 2 && this.miss.rg <= 1) ? 'by' : null; };
  function shuffleArr(a) { a = a.slice(); for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
  /** Straight lines: one look with each eye at a grid. */
  function LinesCheck() { this.k = 'L'; this.eyes = Math.random() < 0.5 ? ['right', 'left'] : ['left', 'right']; this.n = 0; this.answers = {}; this.maxTrials = 2; }
  LinesCheck.prototype.done = function () { return this.n >= this.maxTrials; };
  LinesCheck.prototype.answer = function (v) { this.answers[this.eyes[this.n]] = v; this.n++; };

  // ---------------- staircase (recognition) ----------------
  /**
   * Size staircase. Fast start: ×0.6 after every right answer until the first miss, then 2-down/1-up
   * (×0.8 / ×1.25). With two answer choices (CVI mode) it is 3-down/1-up, because guessing is 50%.
   * The threshold is the geometric mean of the reversals after the first; without 2 such reversals
   * there is no reliable threshold and nothing is recommended from it.
   */
  function Staircase(category, condition, start, maxTrials, down) {
    this.k = 'C'; this.category = category; this.condition = condition;
    this.size = start; this.run = 0; this.lastDir = 0; this.reversals = []; this.fast = true; this.down = down || 2;
    this.n = 0; this.correct = 0; this.rts = []; this.maxTrials = maxTrials;
  }
  Staircase.prototype.done = function () { return this.n >= this.maxTrials || this.reversals.length >= 7; };
  Staircase.prototype.answer = function (ok, rt) {
    this.n++; this.rts.push(rt);
    var dir = 0;
    if (ok) { this.correct++; this.run++; if (this.fast || this.run >= this.down) { dir = -1; this.run = 0; } }
    else { dir = 1; this.run = 0; this.fast = false; }
    if (dir) {
      if (this.lastDir && dir !== this.lastDir) this.reversals.push(this.size);
      this.lastDir = dir;
      this.size = Math.max(6, Math.min(200, this.size * (dir < 0 ? (this.fast ? 0.6 : 0.8) : 1.25)));
    }
  };
  Staircase.prototype.reliable = function () { return this.reversals.length >= 3; };
  Staircase.prototype.threshold = function () {
    var r = this.reversals.slice(1).slice(-4);
    if (r.length < 2) return null;
    return Math.exp(r.reduce(function (a, v) { return a + Math.log(v); }, 0) / r.length);
  };
  Staircase.prototype.summary = function () {
    var med = this.rts.slice().sort(function (a, b) { return a - b; })[Math.floor(this.rts.length / 2)] || null;
    var th = this.threshold();
    return { threshold: th == null ? null : Math.round(th * 10) / 10, below: th == null && this.correct === this.n ? Math.round(this.size * 10) / 10 : null,
      trials: this.n, correct: this.correct, medianRtMs: med, reversals: this.reversals.length };
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
    $('learnGoRead').onclick = function () { ctx.store.setPref('read.intent', 'read'); ctx.go('read'); };
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
      if ((step.type === 'recognize' || step.type === 'contrast' || step.type === 'lines') && /^[1-4]$/.test(e.key)) { var b = $('learnChoices').querySelectorAll('button')[+e.key - 1]; if (b) b.click(); }
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
    $('learnWhoAvatar').innerHTML = DA.ui.avatar(p, 'sm');
    var prev = ctx.profiles.sessionsFor(p.id).filter(function (x) { return !x.kind || x.kind === 'learn'; })[0];
    $('learnPlayed').style.display = prev ? '' : 'none';
    $('learnOnce').style.display = prev ? 'none' : '';
    $('quickGame').classList.toggle('huge', !prev);
    $('quickGame').textContent = prev ? T('לטוס שוב בכל זאת') : T('ממריאים (כ־4 דקות)');
    if (prev) $('learnPlayedWhen').textContent = T('✓ טיסת הניסוי כבר נעשתה ב־') + new Date(prev.startedAt).toLocaleDateString(DA.i18n.locale);
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
      localStorage.setItem(key(), JSON.stringify({ v: 2, pct: pct(), sess: sess, queue: queue, work: work, plain: plainSettings, prefDone: done, total: total, savedAt: Date.now() }));
    } catch (e) { /* storage full: pause still works for this visit */ }
  }
  function loadSaved() {
    try {
      var d = key() && JSON.parse(localStorage.getItem(key()) || 'null');
      if (!d || d.v !== 2 || Date.now() - d.savedAt > 14 * 864e5) return null;   // older than two weeks: start fresh
      return d;
    } catch (e) { return null; }
  }
  function clearSaved() { if (key()) localStorage.removeItem(key()); }
  var PROTO = { T: Tournament.prototype, S: Search.prototype, C: Staircase.prototype, W: Warp.prototype, K: Contrast.prototype, D: ColorCheck.prototype, L: LinesCheck.prototype };
  function revive(o) { return Object.assign(Object.create(PROTO[o.k] || Object.prototype), o); }
  function restore() {
    var d = loadSaved();
    if (!d) return false;
    sess = d.sess; sess._stairs = (sess._stairs || []).map(revive);
    Object.keys(sess._checks || {}).forEach(function (k) { sess._checks[k] = revive(sess._checks[k]); });
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
    setTimeout(function () { speak(T('טיסת הניסוי בהפסקה. המקום נשמר. כשתרצו, לחצו להמשיך.')); }, 50);
  }
  function resume() {
    paused = false;
    $('learnPaused').style.display = 'none';
    nextStep();
  }

  function quickPlan() {
    var adult = ctx.profile() && ctx.profile().kind === 'adult';
    var L = DA.i18n.content;
    // Size on symbols that do not depend on reading skill (digits for children, letters for adults);
    // the comfortable sentence size comes from the reading-size test. With and without settings, interleaved.
    var cat = adult ? 'letter-' + L : 'digit';
    return { name: adult ? 'quick-adult' : 'quick-child', size: [[cat]], plainFor: cat, checks: ['lines', 'contrast', 'color'],
      prefs: adult ? ['theme', 'font', 'letterSpacing', 'brightness', 'warp'] : ['theme', 'letterSpacing', 'brightness', 'warp'],
      maxTrials: 12, plainTrials: 10, prefTrials: 2, themes: 4 };
  }
  /** Default recognition categories, in the interface language. */
  function defaultCats(adult) {
    var L = DA.i18n.content;
    return adult ? ['letter-' + L, 'sentence-' + L] : ['digit', 'word-' + L];
  }
  function customPlan() {
    var cats = Array.prototype.map.call(document.querySelectorAll('#catChecks input:checked'), function (i) { return i.value; });
    var picks = Array.prototype.map.call(document.querySelectorAll('#prefChecks input:checked'), function (i) { return i.value; });
    var checks = picks.filter(function (v) { return ['lines', 'contrast', 'color'].indexOf(v) >= 0; });
    var prefs = picks.filter(function (v) { return checks.indexOf(v) < 0; });
    var n = +$('trialsPer').value || 8;
    return { name: 'custom', size: cats.length ? [cats] : [], plainFor: '*', checks: checks, prefs: prefs, maxTrials: n, plainTrials: n, prefTrials: 3, themes: 4 };
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
      if (k === 'warp' && hasWarp) queue.push(new Warp());   // brightness is added just before the warp check
    });
    if (k_has(plan.prefs, 'brightness')) queue.splice(Math.max(0, queue.length - (hasWarp && k_has(plan.prefs, 'warp') ? 1 : 0)), 0,
      new Tournament('brightness', uniq([work.brightness, 1, 0.8]).slice(0, 2), T('בהירות')));
    var stairs = [];
    plan.size.forEach(function (group) {
      group.forEach(function (cat) {
        var prev = lastThreshold(cat);
        var s0 = prev ? Math.min(START[cat], Math.max(12, prev * 1.6)) : START[cat];
        var down = work.cvi ? 3 : 2;
        stairs.push(new Staircase(cat, 'corrected', s0, plan.maxTrials, down));
        if (plan.plainFor === '*' || plan.plainFor === cat) stairs.push(new Staircase(cat, 'plain', s0, plan.plainTrials || plan.maxTrials, down));
      });
    });
    var checks = {};
    if (k_has(plan.checks, 'lines')) checks.lines = new LinesCheck();
    if (k_has(plan.checks, 'contrast')) checks.contrast = new Contrast(8);
    if (k_has(plan.checks, 'color')) checks.color = new ColorCheck();
    // the journey: alternate kinds of activity
    var st = [];
    if (checks.lines) st.push({ id: 'lines' });
    if (plan.size[0]) st.push({ id: 'size', cats: plan.size[0] });
    if (checks.contrast) st.push({ id: 'contrast' });
    if (plan.size[1]) st.push({ id: 'size', cats: plan.size[1], second: true });
    if (checks.color) st.push({ id: 'color' });
    if (queue.length) st.push({ id: 'prefs' });
    sess = {
      schema: 'da.session/1', id: 'L' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
      profileId: p.id, kind: 'learn', plan: plan, softwareVersion: DA.VERSION,
      startedAt: new Date().toISOString(), before: work, prefs: [], recognition: {}, log: [],
      display: { w: window.innerWidth, h: window.innerHeight, dpr: window.devicePixelRatio || 1 },
      calibrationId: hasWarp ? work.calibrationId : null,
      glasses: ctx.glasses()
    };
    sess._stairs = stairs;
    sess._checks = checks;
    sess._stations = st; sess._si = 0; sess._intro = -1;
    total = queue.reduce(function (a, t) { return a + t.units(); }, 0) +
      stairs.reduce(function (a, x) { return a + x.maxTrials; }, 0) +
      Object.keys(checks).reduce(function (a, k) { return a + checks[k].maxTrials; }, 0);
    done = 0;
    showPlay();
    renderVoiceBtn();
    renderPace();
    nextStep();
  }
  function uniq(a) { return a.filter(function (v, i) { return a.indexOf(v) === i; }); }
  function k_has(a, v) { return (a || []).indexOf(v) >= 0; }

  // ---------------- run loop: stations ----------------
  var STATION = {
    lines: { icon: 'lines', title: T('הקווים'), text: T('נראה רשת של קווים. מכסים עין אחת עם היד, מסתכלים על הנקודה שבאמצע, ומספרים איך נראים הקווים. אחר כך העין השנייה.') },
    size: { icon: 'search', title: T('הגודל'), text: T('נראה מילים ומספרים, כל פעם קצת יותר קטנים. בוחרים את התשובה המתאימה. לא בטוחים? מנחשים, זה בסדר.') },
    size2: { icon: 'text', title: T('עוד קצת גודל'), text: T('עכשיו סוג אחר של סימנים, גם הם הולכים ונהיים קטנים.') },
    contrast: { icon: 'fog', title: T('אותיות בערפל'), text: T('המספרים יהיו חיוורים יותר ויותר, כמו בערפל. בוחרים איזה מספר רואים.') },
    color: { icon: 'palette', title: T('צבעים'), text: T('יש ארבעה עיגולים, ואחד מהם בצבע קצת אחר. מוצאים אותו. לא רואים הבדל? זה בסדר, לוחצים "לא רואה הבדל".') },
    prefs: { icon: 'sparkle', title: T('מה יותר נוח'), text: T('עכשיו מראים שני נוסחים. בוחרים את מה שנעים וברור יותר לקרוא.') }
  };
  function stationInfo(stn) { return stn.id === 'size' && stn.second ? STATION.size2 : STATION[stn.id]; }
  function stationDone(stn) {
    if (stn.id === 'size') return !sess._stairs.some(function (x) { return stn.cats.indexOf(x.category) >= 0 && !x.done(); });
    if (stn.id === 'prefs') return !queue.length;
    return sess._checks[stn.id].done();
  }
  function renderStations() {
    var box = $('learnStations'); if (!box || !sess || !sess._stations) return;
    box.innerHTML = sess._stations.map(function (stn, i) {
      var cls = i < sess._si ? 'done' : i === sess._si ? 'now' : '';
      var inf = stationInfo(stn);
      return '<span class="stn ' + cls + '" title="' + esc(inf.title) + '">' + DA.icons.svg(inf.icon) + '</span>';
    }).join('<span class="stn-line"></span>');
  }

  function nextStep() {
    renderProgress();
    $('learnStage').classList.remove('intro');
    var stn;
    while ((stn = sess._stations[sess._si]) && stationDone(stn)) {
      if (stn.id === 'prefs') break;   // prefs finishes inside its own loop
      sess._si++;
    }
    renderStations();
    if (!stn) { finish(false); return; }
    if (sess._intro !== sess._si) { showIntro(stn); return; }
    if (stn.id === 'size') {
      var open = sess._stairs.filter(function (x) { return stn.cats.indexOf(x.category) >= 0 && !x.done(); });
      sess._recN = (sess._recN || 0) + 1;
      if (sess._recN % 5 === 0) { showRecognize(open[Math.floor(Math.random() * open.length)], true); return; } // catch trial: big & easy, checks attention
      showRecognize(open[Math.floor(Math.random() * open.length)]);
      return;
    }
    if (stn.id === 'lines') { showLines(sess._checks.lines); return; }
    if (stn.id === 'contrast') { showContrast(sess._checks.contrast); return; }
    if (stn.id === 'color') { showColor(sess._checks.color); return; }
    // preferences, compared at the comfortable reading size
    if (!sess._sized) { sess._sized = true; applySizeFromStairs(); }
    while (queue.length) {
      var t = queue[0], c = t.next();
      if (c) { if (c.param === 'warp') showWarp(t); else showPref(t, c); return; }
      var res = t.warp ? null : t.result();
      if (!t.warp) work[t.param] = res;
      queue.shift();
    }
    sess._si++;
    nextStep();
  }

  function showIntro(stn) {
    var inf = stationInfo(stn), i = sess._si + 1, n = sess._stations.length;
    step = { type: 'intro' };
    stageLens.apply(DA.settings.normalize(Object.assign({}, work, { fontSize: 22, shiftX: 0, shiftY: 0, ruler: 'off' })), null);
    $('learnStage').classList.remove('cvi');
    $('learnStage').classList.add('intro');
    $('learnContent').innerHTML = '<div class="stn-intro"><div class="stn-icon">' + DA.icons.svg(inf.icon) + '</div>' +
      '<div class="stn-step">' + T('שלב') + ' ' + i + ' ' + T('מתוך') + ' ' + n + '</div><h2>' + esc(inf.title) + '</h2><p>' + esc(inf.text) + '</p></div>';
    $('learnPrompt').textContent = '';
    choices([{ html: T('ממריאים ▶'), cls: 'next-btn', fn: function () { sess._intro = sess._si; nextStep(); } }]);
    var nb = $('learnChoices').querySelector('.next-btn'); if (nb) nb.focus();
    speak(T('שלב') + ' ' + i + '. ' + inf.title + '. ' + inf.text);
  }

  // ----- lines (each eye) -----
  function gridSvg(px) {
    var n = 20, g = '';   // 20×20 like an Amsler grid
    for (var i = 0; i <= n; i++) {
      var v = (i / n * 100).toFixed(1);
      g += '<line x1="' + v + '" y1="0" x2="' + v + '" y2="100"/><line x1="0" y1="' + v + '" x2="100" y2="' + v + '"/>';
    }
    return '<svg class="amsler" viewBox="-1 -1 102 102" width="' + px + '" height="' + px + '" aria-hidden="true"><rect x="0" y="0" width="100" height="100" fill="#fff"/>' +
      '<g stroke="#111" stroke-width="0.35">' + g + '</g><circle cx="50" cy="50" r="1.8" fill="#e0242b"/></svg>';
  }
  function showLines(ch) {
    var eye = ch.eyes[ch.n];
    step = { type: 'lines', ch: ch };
    stageLens.apply(plainSettings, null);   // raw view: no correction
    var px = Math.round(Math.min($('learnStage').clientWidth, $('learnStage').clientHeight) * 0.86);
    $('learnContent').innerHTML = '<div class="stim-wrap">' + gridSvg(px) + '</div>';
    $('learnPrompt').innerHTML = eye === 'right'
      ? T('מכסים את העין <b>השמאלית</b> בכף יד מקומרת, בלי ללחוץ על העין, ומסתכלים בעין ימין על הנקודה האדומה. בלי להזיז את המבט: איך נראים הקווים מסביב?')
      : T('מכסים את העין <b>הימנית</b> בכף יד מקומרת, בלי ללחוץ על העין, ומסתכלים בעין שמאל על הנקודה האדומה. בלי להזיז את המבט: איך נראים הקווים מסביב?');
    choices([
      { html: T('כולם ישרים'), cls: 'answer wide', fn: function () { answerLines('straight'); } },
      { html: T('חלק עקומים או גליים'), cls: 'answer wide', fn: function () { answerLines('wavy'); } },
      { html: T('חסר חלק או יש כתם'), cls: 'answer wide', fn: function () { answerLines('missing'); } },
      { html: T('לא בטוח'), cls: 'answer wide same', fn: function () { answerLines('unsure'); } }
    ]);
    stepStart = performance.now();
  }
  function answerLines(v) {
    if (!step || step.type !== 'lines') return;
    step.ch.answer(v);
    sess.lines = step.ch.answers;
    feedback(T('נרשם!'));
  }

  // ----- faint letters (contrast) -----
  function showContrast(ch) {
    // fixed white background, black-based grey digit, no theme and no comfort filters
    stageLens.apply(DA.settings.normalize(Object.assign({}, plainSettings, { theme: 'white', sharpen: 0, bold: false })), null);
    $('learnStage').classList.remove('cvi');
    var trial = makeFresh('digit');
    var dg = sess._stairs.filter(function (x) { return x.condition === 'corrected' && x.threshold() != null; })[0];
    var size = Math.max(44, Math.min(100, dg ? dg.threshold() * 3 : 64));
    step = { type: 'contrast', ch: ch, trial: trial };
    $('learnContent').innerHTML = '<div class="stim-wrap contrast-stim" style="color:' + greyFor(ch.c) + '">' + trial.html(Math.round(size)) + '</div>';
    $('learnPrompt').textContent = T('איזה מספר מסתתר בערפל?');
    choices(trial.choices.map(function (o) { return { html: o.html, cls: 'answer glyph', fn: function () { answerContrast(o.key); } }; }));
    stepStart = performance.now();
  }
  function answerContrast(key) {
    if (!step || step.type !== 'contrast') return;
    var ok = key === step.trial.answer;
    sess.log.push({ category: 'contrast', weber: step.ch.c, target: step.trial.answer, response: key, correct: ok, rtMs: Math.round(performance.now() - stepStart) });
    step.ch.answer(ok);
    feedback(praise());
  }

  // ----- colours: odd one out -----
  var PAIRS = { rg: ['#b8743a', '#7f9440'], by: ['#4a86c8', '#4aa39a'] };
  /** Scale a colour's brightness so that brightness is not a reliable cue. */
  function jitter(hex) {
    var k = 0.85 + Math.random() * 0.3, n = parseInt(hex.slice(1), 16);
    var r = Math.min(255, Math.round(((n >> 16) & 255) * k)), g = Math.min(255, Math.round(((n >> 8) & 255) * k)), b = Math.min(255, Math.round((n & 255) * k));
    return 'rgb(' + r + ',' + g + ',' + b + ')';
  }
  function showColor(ch) {
    stageLens.apply(plainSettings, null);   // no warmth, brightness or colour filters during this round
    var pair = PAIRS[ch.pairs[ch.n]], odd = Math.floor(Math.random() * 4), flip = Math.random() < 0.5;
    var base = flip ? pair[1] : pair[0], other = flip ? pair[0] : pair[1];
    step = { type: 'color', ch: ch, odd: odd };
    var html = '<div class="odd-grid">';
    for (var i = 0; i < 4; i++) html += '<button class="odd-dot" data-i="' + i + '" style="background:' + jitter(i === odd ? other : base) + '" aria-label="' + T('עיגול') + ' ' + (i + 1) + '"></button>';
    $('learnContent').innerHTML = html + '</div>';
    $('learnContent').querySelectorAll('.odd-dot').forEach(function (b) { b.onclick = function () { answerColor(+b.getAttribute('data-i')); }; });
    $('learnPrompt').textContent = T('איזה עיגול בצבע אחר? גע בו');
    choices([{ html: T('לא רואה הבדל'), cls: 'same', fn: function () { answerColor(-1); } }]);
    stepStart = performance.now();
  }
  function answerColor(i) {
    if (!step || step.type !== 'color') return;
    var ok = i === step.odd;
    sess.log.push({ category: 'color-odd', pair: step.ch.pairs[step.ch.n], correct: ok, rtMs: Math.round(performance.now() - stepStart) });
    $('learnContent').querySelectorAll('.odd-dot').forEach(function (b) { b.disabled = true; });
    step.ch.answer(ok);
    feedback(praise());
  }

  /** A stimulus that was not shown in the last few rounds of the same kind. */
  var recent = {};
  function makeFresh(cat, avoid) {
    var r = recent[cat] = recent[cat] || [], t;
    for (var i = 0; i < 8; i++) { t = DA.stimuli.make(cat, avoid); if (r.indexOf(t.answer) < 0) break; }
    r.push(t.answer); if (r.length > 5) r.shift();
    return t;
  }
  function praise() {
    var pi; do { pi = Math.floor(Math.random() * PRAISE.length); } while (pi === lastPraise && PRAISE.length > 1);
    lastPraise = pi;
    return PRAISE[pi];
  }

  /**
   * Starting size for reading ≈ 2.5× the smallest symbol read reliably (an acuity reserve; 3× in CVI mode).
   * Only reliable thresholds count, and the median is used. The reading-size test gives the final size.
   */
  function applySizeFromStairs() {
    var k = work.cvi ? 3 : 2.5;
    var th = sess._stairs.filter(function (s) { return s.condition === 'corrected' && s.threshold() != null; })
      .map(function (s) { return s.threshold() * (/sentence/.test(s.category) ? 1.6 : k); }).sort(function (a, b) { return a - b; });
    if (th.length) work.fontSize = Math.round(Math.min(96, Math.max(18, th[Math.floor((th.length - 1) / 2)])));
  }

  function doneUnits() {
    var st = (sess && sess._stairs || []).reduce(function (a, s) { return a + (s.done() ? s.maxTrials : s.n); }, 0);
    var ck = sess && sess._checks || {};
    var cn = Object.keys(ck).reduce(function (a, k) { return a + Math.min(ck[k].n, ck[k].maxTrials); }, 0);
    return st + cn + done;
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
    stageLens.apply(work, ctx.warpFor(work));
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
    $('learnPrompt').textContent = T('איזה צד יותר ברור ונעים לקריאה? גע בו');
    choices([{ html: T('אותו דבר'), cls: 'same', fn: function () { choosePref('same'); } }]);
  }

  function choosePref(v) {
    if (!step || step.type !== 'pref') return;
    var c = step.c;
    sess.prefs.push({ param: c.param, a: c.a, b: c.b, choice: v, chosenValue: v === 'same' ? null : c[v], swapped: step.swap, rtMs: Math.round(performance.now() - stepStart) });
    step.tuner.answer(v === 'same' ? 'a' : v);
    done++;
    feedback(T('נרשם!'));
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
      { html: T('להחליף'), cls: 'flip', fn: flipWarp },
      { html: T('זו יותר ברורה'), cls: 'pick', fn: function () { chooseWarp(false); }, disabled: true },
      { html: T('אותו דבר'), cls: 'same', fn: function () { chooseWarp(true); }, disabled: true }
    ]);
    showWarpVersion(0);
  }
  function showWarpVersion(i) {
    step.showing = i; step.seen[i] = true;
    var on = step.order[i] === 1;
    var s = Object.assign({}, work, { warpStrength: on ? (work.warpStrength || 1) : 0 });
    stageLens.apply(s, ctx.warpFor(work));
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
    feedback(T('נרשם!'));
  }

  // ----- recognition -----
  function showRecognize(st, isCatch) {
    var cond = st.condition === 'corrected' ? work : plainSettings;
    stageLens.apply(cond, st.condition === 'corrected' ? ctx.warpFor(work) : null);
    var trial = makeFresh(st.category, step && step.trial ? step.trial.answer : null);
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
    feedback(praise());
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
    f.innerHTML = '<span class="fb-ic">' + DA.icons.svg('check') + '</span>' + esc(text);
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
    var ck = sess._checks || {};
    if (ck.contrast && ck.contrast.n) {
      var thr = ck.contrast.threshold();
      sess.contrast = { threshold: thr, trials: ck.contrast.n, needsMore: thr != null && thr > 0.1 };
      if (sess.contrast.needsMore) work.bold = true;   // thicker letters are usually more comfortable then
    }
    if (ck.color && ck.color.n >= 4) sess.colorHint = ck.color.hint();   // a suggestion only, never switched on automatically
    if (ck.lines && ck.lines.n) sess.lines = ck.lines.answers;
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
    if (sess.catchTrials) { sess.attention = Math.round((1 - (sess.catchMisses || 0) / sess.catchTrials) * 100); sess.attentionLow = (sess.catchMisses || 0) >= 2; }
    sess.after = DA.settings.normalize(work);
    sess.endedAt = new Date().toISOString();
    sess.early = !!early;
    delete sess._stairs; delete sess._sized; delete sess._checks; delete sess._stations; delete sess._si; delete sess._intro;
    ctx.profiles.saveSession(sess);

    $('learnPlay').style.display = 'none';
    $('learnEnd').style.display = '';
    $('learnEndSummary').innerHTML = summaryHtml(sess);
    var endMsg = early
      ? T('עצרנו כאן, וזה בסדר גמור. גם ממה שהספקנו למדנו משהו חשוב עליך. רוצים לשמור? לחצו על הכפתור הגדול עם הכוכב.')
      : T('מצאנו הגדרות שכדאי לנסות. לחצו על הכפתור הגדול עם הכוכב, ומעכשיו כל טקסט באפליקציה ייראה ככה. תמיד אפשר לשנות.');
    var endTitle = early ? T('נחתנו באמצע, וזה בסדר') : T('טיסת הניסוי הושלמה!');
    $('learnEndTitle').innerHTML = '<span class="end-badge">' + DA.icons.svg(early ? 'pin' : 'trophy') + '</span>' + esc(endTitle);
    var hasCal = !!ctx.opsFor(ctx.profile().settings);
    var la = sess.lines || {}, vals = Object.keys(la).map(function (k) { return la[k]; });
    var wavy = vals.indexOf('wavy') >= 0, missing = vals.indexOf('missing') >= 0;
    var straight = vals.length === 2 && vals.every(function (v) { return v === 'straight'; });
    var q, nextSay = '', ref = false;
    $('learnNextMap').style.display = 'none';
    if (missing) {
      // a missing area is not corrected by warping: reading aids first, never the distortion calibration alone
      q = T('ראית שחלק מהרשת חסר או שיש בה כתם, בעין אחת לפחות. כתם כזה לא מיישרים בכיול, אבל אפשר להקל על הקריאה: אותיות גדולות יותר, מילה אחרי מילה והקראה. במפת הנוחות אפשר לראות איפה נוח למקם את הטקסט.') +
        (wavy ? ' ' + T('ובשביל הקווים העקומים יש גם כיול עיוות.') : '');
      ref = true;
      $('learnNextMap').style.display = '';
    } else if (wavy) {
      q = T('ראית קווים עקומים או גליים בעין אחת לפחות. ') +
        (hasCal ? T('אפשר לחדש את כיול העיוות, כדי שהתיקון יתאים בדיוק.') : T('אפשר לנסות כיול עיוות: הוא מיישר את מה שנראה עקום, ומתאים את הטקסט לעין שלך.'));
      ref = true;
    } else if (straight) {
      q = T('הקווים נראו לך ישרים בשתי העיניים, אז אין צורך בכיול עיוות. אפשר לצאת לקרוא!') + ' ' + T('אם זה ישתנה בעתיד, כדאי להתייעץ עם רופא/ת עיניים.');
    } else if (vals.indexOf('unsure') >= 0) {
      q = T('לא היית בטוח/ה איך נראו הקווים. אפשר לבדוק שוב בעזרת קווים בבית: משקוף, שורות במחברת או קצה של שולחן, בכל עין לחוד.');
      ref = true;
    } else {
      q = T('קווים ישרים, כמו משקוף, שורות במחברת או קצה של שולחן, נראים לך לפעמים עקומים, גליים או עם חלק חסר?');
      nextSay = hasCal ? '' : ' ' + T('ושאלה אחת לסיום: קווים ישרים נראים לך לפעמים עקומים, גליים או עם חלק חסר? אם כן, כדאי לעשות גם כיול עיוות.');
    }
    if (!nextSay) nextSay = ' ' + q;
    if (ref) nextSay += ' ' + DA.safety.text();
    $('learnNextQ').textContent = q;
    $('learnNextPro').innerHTML = ref ? DA.safety.html() : '';
    $('learnNextPro').style.display = ref ? '' : 'none';
    $('learnNextQ').style.display = '';
    $('learnNextHasCal').style.display = 'none';
    var showCal = wavy || (!straight && !missing && !hasCal && vals.indexOf('unsure') < 0);
    $('learnNextYes').style.display = showCal ? '' : 'none';
    $('learnNextYes').textContent = wavy ? (hasCal ? T('לחדש את כיול העיוות') : T('לכיול עיוות (כ־10 דקות)')) : T('כן, לפעמים ← לכיול עיוות (כ־10 דקות)');
    $('learnNextNo').textContent = straight || wavy || missing || vals.length ? T('לצאת לקרוא') : T('לא ← אפשר לצאת לקרוא');
    $('learnNextYes').onclick = function () { ctx.updateSettings(last.after); ctx.go('calibrate'); };
    $('learnNextMap').onclick = function () { ctx.updateSettings(last.after); ctx.go('fieldtest'); };
    $('learnNextNo').onclick = function () { ctx.updateSettings(last.after); ctx.store.setPref('read.intent', 'read'); ctx.go('read'); };
    $('learnEndSay').textContent = endMsg;
    setTimeout(function () { speak(endTitle + ' ' + endMsg + ' ' + T('בפעם הבאה נכנסים ישר לקריאה. טסים שוב רק אם משהו השתנה: משקפיים חדשים, הראייה השתנתה, או עברה כחצי שנה.') + nextSay); }, 300);
    $('learnApplyBest').onclick = function () {
      ctx.updateSettings(sess.after);
      ctx.profiles.setBest(ctx.profile(), sess.after);
      DA.ui.toast(T('נשמר כמצב שלך')); ctx.go('hub');
    };
    $('learnApply').onclick = function () { ctx.updateSettings(sess.after); DA.ui.toast(T('ההגדרות החדשות פועלות. ⭐ המצב שלי נשאר כמו שהיה.')); ctx.go('hub'); };
    $('learnKeep').onclick = function () { ctx.go('hub'); };
    var last = sess;
    sess = null;
    return last;
  }

  var CAT_LABEL = {};
  DA.stimuli.CATEGORIES.forEach(function (c) { CAT_LABEL[c.id] = c.label; });

  /** Friendly summary of a session (also shown on the hub). */
  function summaryHtml(s) {
    function cell(r) { return !r ? '—' : r.threshold != null ? r.threshold + 'px' : r.below != null ? '≤ ' + r.below + 'px' : T('לא נמדד בדיוק'); }
    var rows = Object.keys(s.recognition || {}).map(function (k) {
      var r = s.recognition[k], c = r.corrected, pl = r.plain, verdict = '—';
      if (c && pl && c.threshold != null && pl.threshold != null && c.reversals >= 3 && pl.reversals >= 3) {
        var lg = Math.log10(pl.threshold / c.threshold);          // 0.2 log = two steps: smaller differences are noise
        verdict = lg >= 0.2 ? T('<b class="good">קטן יותר ב-') + Math.round((1 - c.threshold / pl.threshold) * 100) + '% ✓</b>'
          : lg <= -0.2 ? T('<span class="bad">גדול יותר ב-') + Math.round((c.threshold / pl.threshold - 1) * 100) + '%</span>' : T('לא נמצא הבדל שאפשר למדוד');
      } else if (c && pl) verdict = T('לא נמצא הבדל שאפשר למדוד');
      return '<tr><td>' + esc(CAT_LABEL[k] || k) + '</td><td>' + cell(c) + '</td><td>' + cell(pl) + '</td><td>' + verdict + '</td></tr>';
    }).join('');
    var LINES = { straight: T('ישרים'), wavy: T('עקומים או גליים'), missing: T('חסר חלק'), unsure: T('לא בטוח') };
    var extra = '';
    if (s.lines) extra += T('<p>קווים: ') + T('עין ימין') + ' – ' + (LINES[s.lines.right] || '—') + ' · ' + T('עין שמאל') + ' – ' + (LINES[s.lines.left] || '—') + '</p>';
    if (s.contrast) extra += T('<p>אותיות בערפל: ') + (s.contrast.threshold == null ? T('לא הספקנו למדוד בדיוק.')
      : s.contrast.needsMore ? T('אותיות חיוורות היו פחות נוחות, ולכן הפעלנו אותיות עבות, שעשויות להיות נוחות יותר. אפשר לשנות בהגדרות.')
      : T('ראית גם אותיות חיוורות.')) + '</p>';
    if (s.colorHint !== undefined) extra += T('<p>צבעים: ') + (s.colorHint ? T('בחלק מהזוגות היה קשה למצוא את העיגול השונה. אם רוצים, אפשר לנסות מסנן צבעים לתמונות בהגדרות. זו לא בדיקת ראיית צבעים.')
      : T('מצאת את העיגולים השונים.')) + '</p>';
    var warp = s.warpVerdict ? T('<p>תיקון העיוות: ') + ({ helps: T('נבחר כברור יותר ✓'), 'does-not-help': T('לא עזר בבדיקה הזו'), unclear: T('לא חד־משמעי') })[s.warpVerdict] + '</p>' : '';
    var tired = s.attentionLow || (s.attentionLow === undefined && s.attention != null && s.catchMisses >= 2);
    return '<p class="muted">' + new Date(s.startedAt).toLocaleString(DA.i18n.locale) + (s.early ? T(' · הופסק באמצע') : '') + '</p>' +
      (rows ? T('<table class="sum"><tr><th>מה ראינו</th><th>הגודל הקטן שהצלחת לקרוא — עם ההגדרות שלי</th><th>בלי</th><th>הבדל</th></tr>') + rows + '</table>' : '') +
      extra + warp + (s.viewing && s.viewing.distanceCmMedian ? T('<p>מרחק צפייה ממוצע: ') + s.viewing.distanceCmMedian + T(' ס״מ') + '</p>' : '') +
      (tired ? T('<p class="bad">בשאלות הקלות היו כמה טעויות, אולי מעייפות. כדאי לחזור על טיסת הניסוי ביום אחר.</p>') : '') +
      T('<p><b>ההגדרות שנלמדו:</b> ') + esc(DA.settings.describe(s.after || s.before)) + '</p>' +
      '<p class="muted small">' + T('הגודל לקריאה הוא נקודת התחלה. את הגודל הנוח לקריאת משפטים מוצאים ב"גודל קריאה נוח" בכל הכלים.') + '</p>';
  }

  DA.screens.learn = { init: init, enter: enter, leave: leave, summaryHtml: summaryHtml };
})(typeof window !== 'undefined' ? window : globalThis);
