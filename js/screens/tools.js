/*
 * עין טובה — More geometric calibration tools from the engineering spec:
 *   4.2 Dot array    — drag each dot until rows and columns look straight and evenly spaced.
 *   4.4 Equal spacing — six dots in a row / column / diagonal; make the gaps look equal.
 *   4.5 Equal size    — make two shapes look the same size (width and height separately; swap sides).
 * Dot tools produce the same kind of correction model (local displacement ops) as the line grid,
 * so a dot calibration can also be chosen as the active distortion correction for reading.
 */
(function (root) {
  'use strict';
  var DA = root.DA;
  DA.screens = DA.screens || {};
  var $ = DA.ui.$, esc = DA.ui.esc, DEF = DA.deformation;
  var ctx, cv, g, S = 400, ox = 0, oy = 0, dpr = 1;
  var mode = 'dots', trial, history, drag = null, visible = false;
  var opt = { n: 7, showOrig: true, orient: 'h', pos: 'mid', gap: 'm', shape: 'circle', layout: 'lr' };

  // ---------------- geometry of each tool ----------------
  function baseDots() {
    if (mode === 'dots') {
      var n = opt.n, out = [], m = 0.12;
      for (var j = 0; j < n; j++) for (var i = 0; i < n; i++) out.push([m + i * (1 - 2 * m) / (n - 1), m + j * (1 - 2 * m) / (n - 1)]);
      return out;
    }
    if (mode === 'spacing') {
      var gap = { s: 0.09, m: 0.13, l: 0.16 }[opt.gap] || 0.13;
      var off = { top: -0.25, mid: 0, bottom: 0.25 }[opt.pos] || 0;
      var pts = [];
      for (var k = 0; k < 6; k++) {
        var t = (k - 2.5) * gap;
        if (opt.orient === 'h') pts.push([0.5 + t, 0.5 + off]);
        else if (opt.orient === 'v') pts.push([0.5 + off, 0.5 + t]);
        else pts.push([0.5 + t * 0.75, 0.5 + t * 0.75 + off * 0.5]);
      }
      return pts;
    }
    return [];
  }
  function spacingOf() { return mode === 'dots' ? (1 - 0.24) / (opt.n - 1) : ({ s: 0.09, m: 0.13, l: 0.16 }[opt.gap] || 0.13); }

  // state: dots → array of [dx,dy]; size → { w, h } of the adjustable shape (reference = 1)
  function emptyState() {
    if (mode === 'size') return { w: 0.75 + Math.random() * 0.5, h: 0.75 + Math.random() * 0.5, swapped: false, measures: [] };
    return baseDots().map(function () { return [0, 0]; });
  }
  function opsFromState(st) {
    if (mode === 'size') return [];
    var base = baseDots(), r = spacingOf(), out = [];
    st.forEach(function (d, i) {
      if (Math.abs(d[0]) + Math.abs(d[1]) < 1e-6) return;
      out.push({ ax: r6(base[i][0]), ay: r6(base[i][1]), dx: r6(d[0]), dy: r6(d[1]), r: r6(r) });
    });
    return out;
  }
  function r6(v) { return Math.round(v * 1e6) / 1e6; }

  // ---------------- screen ----------------
  function init(c) {
    ctx = c;
    cv = $('tlCanvas'); g = cv.getContext('2d');
    cv.style.touchAction = 'none';
    $('tlMode').onchange = function () { switchMode(this.value); };
    $('tlUndo').onclick = function () { if (history.undo()) changed(); };
    $('tlRedo').onclick = function () { if (history.redo()) changed(); };
    $('tlReset').onclick = function () { history.reset(emptyState()); changed(); };
    $('tlSave').onclick = save;
    $('tlBack').onclick = function () { ctx.go('calibrate'); };
    $('tlN').onchange = function () { opt.n = +this.value; restart(); };
    $('tlOrig').onchange = function () { opt.showOrig = this.checked; render(); };
    $('tlOrient').onchange = function () { opt.orient = this.value; restart(); };
    $('tlPos').onchange = function () { opt.pos = this.value; restart(); };
    $('tlGap').onchange = function () { opt.gap = this.value; restart(); };
    $('tlShape').onchange = function () { opt.shape = this.value; render(); };
    $('tlLayout').onchange = function () { opt.layout = this.value; render(); };
    $('tlSwap').onclick = function () { var st = clone(history.present); st.swapped = !st.swapped; history.commit(st); changed(); };
    $('tlMeasure').onclick = addMeasure;
    cv.addEventListener('pointerdown', down);
    cv.addEventListener('pointermove', move);
    cv.addEventListener('pointerup', up);
    cv.addEventListener('pointercancel', function () { drag = null; render(); });
    if (typeof ResizeObserver !== 'undefined') new ResizeObserver(function () { if (visible) resize(); }).observe($('tlStage'));
  }

  function enter() {
    if (!ctx.profile()) { ctx.go('home'); return; }
    visible = true;
    switchMode(ctx.store.getPref('tools.mode', 'dots'), true);
    setTimeout(resize, 0);
  }
  function leave() { visible = false; }

  function switchMode(m, silent) {
    mode = ['dots', 'spacing', 'size'].indexOf(m) >= 0 ? m : 'dots';
    ctx.store.setPref('tools.mode', mode);
    $('tlMode').value = mode;
    document.querySelectorAll('[data-tl]').forEach(function (e) { e.style.display = e.getAttribute('data-tl').split(' ').indexOf(mode) >= 0 ? '' : 'none'; });
    $('tlHelp').textContent = {
      dots: T('גוררים כל נקודה עד שהשורות והעמודות נראות ישרות והמרווחים נראים שווים. הסימון החלש מראה איפה הנקודה הייתה.'),
      spacing: T('גוררים את הנקודות עד שהמרווחים ביניהן נראים שווים. אפשר לשנות כיוון, מיקום ומרווח התחלתי בין ניסיונות.'),
      size: T('גוררים את קצה הצורה המסומנת (ימינה־שמאלה לרוחב, למעלה־למטה לגובה) עד ששתי הצורות נראות באותו גודל. אחר כך "לשמור מדידה" ולהחליף צדדים.')
    }[mode];
    restart(silent);
  }

  function restart() {
    trial = { id: 'K' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), createdAt: new Date().toISOString(), startedAt: Date.now(), actions: [] };
    history = new DA.History(emptyState());
    changed(true);
  }

  function resize() {
    var p = $('tlStage'), w = p.clientWidth, h = p.clientHeight;
    dpr = root.devicePixelRatio || 1;
    cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
    cv.style.width = w + 'px'; cv.style.height = h + 'px';
    S = Math.max(50, Math.floor(Math.min(w, h) - 16));
    ox = Math.floor((w - S) / 2); oy = Math.floor((h - S) / 2);
    render();
  }

  function clone(v) { return JSON.parse(JSON.stringify(v)); }
  function norm(e) { var r = cv.getBoundingClientRect(); return [(e.clientX - r.left - ox) / S, (e.clientY - r.top - oy) / S]; }

  // ---------------- size tool geometry ----------------
  var REF = 0.22;   // reference shape size (fraction of the square)
  function sizeShapes(st) {
    var a = opt.layout === 'lr' ? [[0.28, 0.5], [0.72, 0.5]] : [[0.5, 0.28], [0.5, 0.72]];
    var adj = st.swapped ? 0 : 1;           // index of the adjustable shape
    return a.map(function (c, i) { return { c: c, w: i === adj ? REF * st.w : REF, h: i === adj ? REF * st.h : REF, adj: i === adj }; });
  }

  // ---------------- interaction ----------------
  function down(e) {
    var p = norm(e);
    if (mode === 'size') {
      var sh = sizeShapes(history.present).filter(function (x) { return x.adj; })[0];
      var dx = Math.abs(p[0] - sh.c[0]) - sh.w / 2, dy = Math.abs(p[1] - sh.c[1]) - sh.h / 2;
      var tol = 24 / S;
      var edgeX = Math.abs(dx) < tol && Math.abs(p[1] - sh.c[1]) < sh.h / 2 + tol;
      var edgeY = Math.abs(dy) < tol && Math.abs(p[0] - sh.c[0]) < sh.w / 2 + tol;
      if (!edgeX && !edgeY) return;
      drag = { kind: edgeX && !edgeY ? 'w' : edgeY && !edgeX ? 'h' : (Math.abs(dx) < Math.abs(dy) ? 'w' : 'h'), start: p, st0: clone(history.present), c: sh.c, t0: performance.now() };
    } else {
      var base = baseDots(), st = history.present, best = -1, bd = 22 / S;
      base.forEach(function (b, i) {
        var d = Math.hypot(b[0] + st[i][0] - p[0], b[1] + st[i][1] - p[1]);
        if (d < bd) { bd = d; best = i; }
      });
      if (best < 0) return;
      drag = { kind: 'dot', i: best, start: p, st0: clone(st), t0: performance.now() };
    }
    cv.setPointerCapture(e.pointerId);
    e.preventDefault();
  }

  function move(e) {
    if (!drag) {
      cv.style.cursor = 'default';
      return;
    }
    var p = norm(e), st = clone(drag.st0);
    if (drag.kind === 'dot') {
      st[drag.i][0] += p[0] - drag.start[0];
      st[drag.i][1] += p[1] - drag.start[1];
    } else if (drag.kind === 'w') {
      st.w = Math.max(0.3, Math.min(2.5, Math.abs(p[0] - drag.c[0]) * 2 / REF));
    } else {
      st.h = Math.max(0.3, Math.min(2.5, Math.abs(p[1] - drag.c[1]) * 2 / REF));
    }
    drag.live = st;
    render(st);
  }

  function up() {
    if (!drag) return;
    var d = drag; drag = null;
    if (!d.live) { render(); return; }
    var rec = { seq: trial.actions.length + 1, at: new Date().toISOString(), tMs: Date.now() - trial.startedAt, durationMs: Math.round(performance.now() - d.t0), eyes: DA.eyes.snapshot() };
    if (d.kind === 'dot') {
      var b = baseDots()[d.i];
      rec.type = 'dot'; rec.dot = d.i;
      rec.original = { x: r6(b[0]), y: r6(b[1]) };
      rec.from = { x: r6(b[0] + d.st0[d.i][0]), y: r6(b[1] + d.st0[d.i][1]) };
      rec.to = { x: r6(b[0] + d.live[d.i][0]), y: r6(b[1] + d.live[d.i][1]) };
    } else {
      rec.type = 'size-' + d.kind; rec.w = r6(d.live.w); rec.h = r6(d.live.h);
    }
    trial.actions.push(rec);
    history.commit(d.live);
    changed();
  }

  function addMeasure() {
    var st = clone(history.present);
    st.measures.push({ widthRatio: r6(st.w), heightRatio: r6(st.h), adjustable: st.swapped ? 'first' : 'second', layout: opt.layout, shape: opt.shape, at: new Date().toISOString() });
    // next measurement: swap sides and start from a new random size
    st.swapped = !st.swapped; st.w = 0.75 + Math.random() * 0.5; st.h = 0.75 + Math.random() * 0.5;
    history.commit(st);
    changed();
    DA.ui.toast(T('📏 המדידה נשמרה. עכשיו הצדדים התחלפו, מודדים שוב.'));
  }

  // ---------------- stats ----------------
  function stats() {
    var st = history.present;
    if (mode === 'size') {
      var m = st.measures;
      if (!m.length) return T('עדיין אין מדידות. מתאימים את הגודל ולוחצים "לשמור מדידה".');
      var w = m.map(function (x) { return x.widthRatio; }), h = m.map(function (x) { return x.heightRatio; });
      var avg = function (a) { return a.reduce(function (s, v) { return s + v; }, 0) / a.length; };
      return T('מדידות: ') + m.length + T(' · רוחב ×') + avg(w).toFixed(2) + T(' · גובה ×') + avg(h).toFixed(2) +
        T(' (1.00 = אותו גודל נתפס)');
    }
    var base = baseDots(), pts = base.map(function (b, i) { return [b[0] + st[i][0], b[1] + st[i][1]]; });
    var moved = st.filter(function (d) { return Math.abs(d[0]) + Math.abs(d[1]) > 1e-6; }).length;
    var out = T('נקודות שהוזזו: ') + moved + '/' + pts.length;
    if (mode === 'spacing') {
      var gaps = [];
      for (var k = 1; k < pts.length; k++) gaps.push(Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]) * S);
      out += T(' · מרווחים: ') + gaps.map(function (x) { return Math.round(x); }).join(', ') + T(' פיקסלים');
    }
    if (mode === 'dots' && moved) {
      // compare with the reader's latest line-grid calibration (spec 4.2 processing)
      var p = ctx.profile(), gridT = ctx.store.allTrials().filter(function (t) { return t.instrument === 'flex-grid' && (!t.profileId || t.profileId === p.id) && t.model && t.model.ops.length; })
        .sort(function (a, b) { return a.savedAt < b.savedAt ? 1 : -1; })[0];
      if (gridT) {
        var diff = 0;
        base.forEach(function (b, i) { var q = DEF.apply(gridT.model.ops, b[0], b[1]); diff += Math.hypot(q[0] - b[0] - st[i][0], q[1] - b[1] - st[i][1]) * S; });
        out += T(' · הבדל ממוצע מכיול הרשת: ') + (diff / base.length).toFixed(1) + T(' פיקסלים');
      }
    }
    return out;
  }

  // ---------------- render ----------------
  function render(live) {
    if (!g) return;
    var st = live || history.present;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, cv.width, cv.height);
    g.setTransform(dpr, 0, 0, dpr, dpr * ox, dpr * oy);
    g.fillStyle = '#fff'; g.fillRect(0, 0, S, S);
    g.strokeStyle = '#ccc'; g.lineWidth = 1; g.strokeRect(0.5, 0.5, S - 1, S - 1);
    if (mode === 'size') {
      sizeShapes(st).forEach(function (sh) {
        var x = sh.c[0] * S, y = sh.c[1] * S, w = sh.w * S, h = sh.h * S;
        g.fillStyle = '#111';
        g.beginPath();
        if (opt.shape === 'circle') g.ellipse(x, y, w / 2, h / 2, 0, 0, Math.PI * 2); else g.rect(x - w / 2, y - h / 2, w, h);
        g.fill();
        if (sh.adj) {
          g.strokeStyle = 'rgba(122,60,220,.8)'; g.setLineDash([5, 4]); g.lineWidth = 2;
          g.strokeRect(x - w / 2 - 6, y - h / 2 - 6, w + 12, h + 12); g.setLineDash([]);
        }
      });
      return;
    }
    var base = baseDots(), r = Math.max(4, Math.min(9, S / 70));
    if (opt.showOrig) {
      g.fillStyle = 'rgba(0,0,0,.14)';
      base.forEach(function (b) { g.beginPath(); g.arc(b[0] * S, b[1] * S, r, 0, Math.PI * 2); g.fill(); });
    }
    g.fillStyle = '#000';
    base.forEach(function (b, i) { g.beginPath(); g.arc((b[0] + st[i][0]) * S, (b[1] + st[i][1]) * S, r, 0, Math.PI * 2); g.fill(); });
  }

  function changed(fresh) {
    render();
    $('tlUndo').disabled = !history.canUndo();
    $('tlRedo').disabled = !history.canRedo();
    $('tlStats').textContent = stats();
    if (!fresh) $('tlSaved').textContent = T('יש שינויים שלא נשמרו');
    else $('tlSaved').textContent = '';
    renderList();
  }

  // ---------------- save & list ----------------
  var INSTR = { dots: 'dot-array', spacing: 'spacing-row', size: 'size-match' };
  function save() {
    var p = ctx.profile(), st = history.present, o = opsFromState(st);
    var t = {
      schema: 'da.trial/1', id: trial.id, label: '', softwareVersion: DA.VERSION, instrument: INSTR[mode],
      createdAt: trial.createdAt, savedAt: new Date().toISOString(), durationMs: Date.now() - trial.startedAt,
      profileId: p.id, repeatOf: null,
      stimulus: mode === 'dots' ? { type: 'dot-array', n: opt.n } : mode === 'spacing' ? { type: 'spacing-row', orient: opt.orient, position: opt.pos, gap: opt.gap, dots: 6 }
        : { type: 'size-match', shape: opt.shape, layout: opt.layout, referenceSize: REF },
      display: { stimulusSizePx: S, screenW: screen.width, screenH: screen.height, dpr: root.devicePixelRatio || 1 },
      viewing: { distanceCm: DA.device.distanceCm(null), glasses: ctx.glasses() },
      actions: trial.actions,
      result: mode === 'size' ? { measures: st.measures } : { offsets: st.map(function (d) { return [r6(d[0]), r6(d[1])]; }), summary: stats() },
      model: { type: 'sequential-local-displacement', kernel: 'wendland-c2', ops: o, quality: DEF.analyze(o, 31) },
      ratings: { confidence: null, notes: '' }
    };
    ctx.store.saveTrial(t);
    DA.cloud.save('trials', t.id, t);
    if (DA.sync) DA.sync.touch();
    $('tlSaved').textContent = T('נשמר ✓');
    renderList();
    DA.ui.toast(T('נשמר: ') + $('tlMode').selectedOptions[0].textContent);
  }

  function renderList() {
    var p = ctx.profile(), box = $('tlList');
    if (!p) return;
    var list = ctx.store.allTrials().filter(function (t) { return t.profileId === p.id && t.instrument === INSTR[mode]; })
      .sort(function (a, b) { return a.savedAt < b.savedAt ? 1 : -1; });
    box.innerHTML = list.length ? '' : '<p class="muted small">' + T('אין עדיין שמירות בכלי הזה.') + '</p>';
    list.forEach(function (t) {
      var row = document.createElement('div');
      row.className = 'trial-item';
      row.innerHTML = '<div class="meta"><b></b><span class="muted"></span></div>';
      row.querySelector('b').textContent = new Date(t.savedAt).toLocaleString(DA.i18n.locale);
      row.querySelector('.muted').textContent = (t.result && t.result.summary) || (t.result && t.result.measures ? t.result.measures.length + T(' מדידות') : '');
      var del = document.createElement('button'); del.textContent = '✕'; del.className = 'danger'; del.title = T('מחיקה');
      del.onclick = function () {
        DA.ui.ask(T('למחוק את השמירה הזו?'), T('מחיקה')).then(function (y) { if (y) { ctx.store.deleteTrial(t.id); DA.cloud.remove('trials', t.id); renderList(); } });
      };
      row.appendChild(del);
      box.appendChild(row);
    });
  }

  DA.screens.tools = { init: init, enter: enter, leave: leave };
})(typeof window !== 'undefined' ? window : globalThis);
