/*
 * עין טובה — The lab: the remaining calibration tools of the engineering spec, for detailed work
 * with an adult (made for Dani's needs, useful to anyone):
 *   6.1 Blur shape (PSF)          6.2 Sharpening & deblurring     6.3 Stripes (spatial frequency)
 *   6.4 Local blur (brush)        6.5 Local brightness/contrast   5.1 Depth (sunken/raised)
 *   7.2 Motion (reported effects)
 * Everything is saved as a calibration record of the reader. The blur shape and the chosen
 * sharpening method can be applied to pictures, photos and PDF pages in the reader.
 * Helper tool only — these are adjustments, not measurements of eye health.
 */
(function (root) {
  'use strict';
  var DA = root.DA;
  DA.screens = DA.screens || {};
  var $ = DA.ui.$, esc = DA.ui.esc, IP = DA.imageproc;
  var ctx, tab = 'psf', cleanup = null;

  var TABS = [
    ['psf', T('צורת הטשטוש')], ['deblur', T('חידוד')], ['stripes', T('▦ פסים')], ['localblur', T('טשטוש מקומי')],
    ['contrast', T('◐ בהירות מקומית')], ['depth', T('שקוע/בולט')], ['motion', T('תנועה')]
  ];

  function init(c) {
    ctx = c;
    var bar = $('labTabs');
    TABS.forEach(function (t) {
      var b = document.createElement('button');
      b.textContent = t[1]; b.setAttribute('data-tab', t[0]);
      b.onclick = function () { show(t[0]); };
      bar.appendChild(b);
    });
  }
  function enter() { if (!ctx.profile()) { ctx.go('home'); return; } show(ctx.store.getPref('lab.tab', 'psf')); }
  function leave() { if (cleanup) { cleanup(); cleanup = null; } }

  function show(t) {
    if (cleanup) { cleanup(); cleanup = null; }
    tab = t; ctx.store.setPref('lab.tab', t);
    document.querySelectorAll('#labTabs button').forEach(function (b) { b.classList.toggle('on', b.getAttribute('data-tab') === t); });
    var body = $('labBody');
    body.innerHTML = '';
    ({ psf: psfTab, deblur: deblurTab, stripes: stripesTab, localblur: localBlurTab, contrast: contrastTab, depth: depthTab, motion: motionTab })[t](body);
  }

  // ---------------- shared helpers ----------------
  function el(html) { var d = document.createElement('div'); d.innerHTML = html; return d.firstElementChild; }
  function canvas(w, h) { var c = document.createElement('canvas'); c.width = w; c.height = h; c.style.width = w + 'px'; c.style.height = h + 'px'; return c; }
  function slider(label, min, max, step, val, fmt, on) {
    var w = el('<label class="lab-slider">' + esc(label) + ' <output></output><input type="range"></label>');
    var i = w.querySelector('input'), o = w.querySelector('output');
    i.min = min; i.max = max; i.step = step; i.value = val;
    var f = fmt || function (v) { return v; };
    o.textContent = f(+val);
    i.oninput = function () { o.textContent = f(+i.value); on(+i.value); };
    w.set = function (v) { i.value = v; o.textContent = f(+v); };
    return w;
  }
  function rating(label) {
    var w = el('<label class="lab-rating">' + esc(label) + ' <span></span></label>'), s = w.querySelector('span'), val = 3;
    [1, 2, 3, 4, 5].forEach(function (n) {
      var b = document.createElement('button'); b.type = 'button'; b.textContent = n;
      b.onclick = function () { val = n; s.querySelectorAll('button').forEach(function (x) { x.classList.toggle('on', +x.textContent === n); }); };
      if (n === 3) b.classList.add('on');
      s.appendChild(b);
    });
    w.value = function () { return val; };
    return w;
  }
  function saveRecord(instrument, data, label) {
    var p = ctx.profile();
    var t = Object.assign({
      schema: 'da.trial/1', id: 'B' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), label: label || '',
      softwareVersion: DA.VERSION, instrument: instrument, createdAt: new Date().toISOString(), savedAt: new Date().toISOString(),
      profileId: p.id, display: { screenW: screen.width, screenH: screen.height, dpr: root.devicePixelRatio || 1 },
      viewing: { distanceCm: DA.device.distanceCm(null), glasses: ctx.glasses() }, model: { ops: [] }, actions: []
    }, data);
    ctx.store.saveTrial(t);
    DA.cloud.save('trials', t.id, t);
    if (DA.sync) DA.sync.touch();
    return t;
  }
  function records(instrument) {
    var p = ctx.profile();
    return ctx.store.allTrials().filter(function (t) { return t.profileId === p.id && t.instrument === instrument; })
      .sort(function (a, b) { return a.savedAt < b.savedAt ? 1 : -1; });
  }
  function f1(v) { return (+v).toFixed(1); }
  function deg(v) { return Math.round(v) + '°'; }

  /** Draw a luminance plane into a canvas. */
  function putLuma(c, Y, w, h) {
    var g = c.getContext('2d'), im = g.createImageData(w, h);
    for (var i = 0; i < w * h; i++) { var v = Math.round(Y[i] * 255); im.data[i * 4] = im.data[i * 4 + 1] = im.data[i * 4 + 2] = v; im.data[i * 4 + 3] = 255; }
    g.putImageData(im, 0, 0);
  }
  /** Render something with the 2D API into a luminance plane. */
  function lumaOf(w, h, draw) {
    var c = canvas(w, h), g = c.getContext('2d');
    draw(g, w, h);
    return IP.toLuma(g.getImageData(0, 0, w, h));
  }

  // ================= 6.1 Blur shape (PSF) =================
  var PRESETS = {
    gauss: { radius: 2, stretch: 1, angle: 0, smear: 0, tail: 0, tailLen: 8, halo: 0, haloR: 8 },
    ellipse: { radius: 1.6, stretch: 2.2, angle: 30, smear: 0, tail: 0, tailLen: 8, halo: 0, haloR: 8 },
    smear: { radius: 1, stretch: 1, angle: 90, smear: 10, tail: 0, tailLen: 8, halo: 0, haloR: 8 },
    tail: { radius: 1.2, stretch: 1, angle: 90, smear: 0, tail: 0.8, tailLen: 12, halo: 0, haloR: 8 },
    halo: { radius: 1.2, stretch: 1, angle: 0, smear: 0, tail: 0, tailLen: 8, halo: 0.7, haloR: 9 }
  };
  function psfTab(body) {
    var cur = Object.assign({}, ctx.profile().settings.psf || PRESETS.gauss), dark = true, pos = 'c';
    body.appendChild(el('<p class="lab-help">' + T('משמאל: נקודה חדה. מימין: "דמיון" של טשטוש. משנים את הכפתורים עד שהנקודה הימנית נראית כמו שאתם רואים את השמאלית. אפשר לשלב כמה סוגי טשטוש.') + '</p>'));
    var row = el('<div class="lab-pair"></div>'), A = canvas(170, 170), B = canvas(170, 170);
    row.appendChild(wrapCap(A, T('כך זה מוצג'))); row.appendChild(wrapCap(B, T('כך אני רואה (דמיון)')));
    body.appendChild(row);
    var controls = el('<div class="lab-controls"></div>');
    var pre = el('<div class="row wrap"></div>');
    [['gauss', T('עגול (גאוסי)')], ['ellipse', T('אליפטי')], ['smear', T('מריחה בכיוון')], ['tail', T('זנב לצד אחד')], ['halo', T('הילה')]].forEach(function (p) {
      var b = el('<button type="button">' + esc(p[1]) + '</button>'); b.onclick = function () { cur = Object.assign({}, PRESETS[p[0]]); sync(); draw(); }; pre.appendChild(b);
    });
    controls.appendChild(pre);
    var S = {};
    [['radius', T('גודל הטשטוש'), 0.3, 6, 0.1, f1], ['stretch', T('מתיחה (אליפטי)'), 1, 4, 0.1, f1], ['angle', T('כיוון'), 0, 180, 1, deg],
      ['smear', T('אורך מריחה'), 0, 24, 0.5, f1], ['tail', T('עוצמת זנב'), 0, 1, 0.05, f1], ['tailLen', T('אורך זנב'), 2, 24, 1, f1],
      ['halo', T('עוצמת הילה'), 0, 1, 0.05, f1], ['haloR', T('גודל הילה'), 3, 20, 0.5, f1]].forEach(function (d) {
      S[d[0]] = slider(d[1], d[2], d[3], d[4], cur[d[0]], d[5], function (v) { cur[d[0]] = v; draw(); });
      controls.appendChild(S[d[0]]);
    });
    var opts = el('<div class="row wrap"><label class="check"><input type="checkbox" checked> ' + T('נקודה בהירה על רקע כהה') + '</label>' +
      '<label>' + T('מיקום על המסך') + ' <select><option value="c">' + T('מרכז') + '</option><option value="e">' + T('ימינה') + '</option><option value="w">' + T('שמאלה') + '</option><option value="n">' + T('למעלה') + '</option><option value="s">' + T('למטה') + '</option></select></label></div>');
    opts.querySelector('input').onchange = function () { dark = this.checked; draw(); };
    opts.querySelector('select').onchange = function () { pos = this.value; row.style.justifyContent = { c: 'center', e: 'flex-start', w: 'flex-end', n: 'center', s: 'center' }[pos]; };
    controls.appendChild(opts);
    var rate = rating(T('כמה הדמיון דומה למה שאני רואה?'));
    controls.appendChild(rate);
    var actions = el('<div class="row wrap"><button type="button" class="primary">' + T('לשמור צורת טשטוש') + '</button></div>');
    actions.querySelector('button').onclick = function () {
      DA.ui.prompt(T('שם לצורת הטשטוש (למשל "עין ימין, ערב"):'), '').then(function (name) {
        if (name == null) return;
        saveRecord('psf', { psf: cur, background: dark ? 'dark' : 'light', position: pos, match: rate.value(), result: { summary: describePsf(cur) } }, name);
        DA.ui.toast(T('נשמר: ') + (name || T('צורת טשטוש'))); list();
      });
    };
    controls.appendChild(actions);
    body.appendChild(controls);
    var listBox = el('<div class="lab-list"></div>'), compare = el('<div class="lab-compare"></div>');
    body.appendChild(el('<h3>' + T('צורות שמורות') + '</h3>')); body.appendChild(listBox); body.appendChild(compare);

    function sync() { Object.keys(S).forEach(function (k) { S[k].set(cur[k]); }); }
    function draw() {
      var n = 170, bg = dark ? 0.08 : 0.95, fg = dark ? 0.98 : 0.05;
      var Y = new Float32Array(n * n).fill(bg);
      for (var y = -2; y <= 2; y++) for (var x = -2; x <= 2; x++) if (x * x + y * y <= 4) Y[(85 + y) * n + 85 + x] = fg;
      putLuma(A, Y, n, n);
      putLuma(B, IP.convolve(Y, n, n, IP.psfKernel(cur)), n, n);
    }
    function list() {
      var rs = records('psf');
      listBox.innerHTML = rs.length ? '' : '<p class="muted small">' + T('אין עדיין צורות שמורות.') + '</p>';
      rs.forEach(function (t) {
        var r = el('<div class="trial-item"><div class="meta"><b></b><span class="muted"></span></div></div>');
        r.querySelector('b').textContent = t.label || T('צורת טשטוש');
        r.querySelector('.muted').textContent = describePsf(t.psf) + T(' · דמיון ') + t.match + '/5';
        var use = el('<button>' + T('להשתמש') + '</button>');
        use.onclick = function () { ctx.updateSettings({ psf: t.psf }); DA.ui.toast(T('צורת הטשטוש הזו תשמש לחידוד תמונות')); };
        var del = el('<button class="danger">✕</button>');
        del.onclick = function () { DA.ui.ask(T('למחוק את השמירה הזו?'), T('מחיקה')).then(function (y) { if (y) { ctx.store.deleteTrial(t.id); list(); } }); };
        r.appendChild(use); r.appendChild(del); listBox.appendChild(r);
      });
      // compare saved shapes on a new stimulus (spec 6.1 acceptance)
      compare.innerHTML = '';
      if (rs.length) {
        compare.appendChild(el('<h3>' + T('השוואה על טקסט') + '</h3>'));
        var wrap = el('<div class="lab-pair wrap"></div>');
        rs.slice(0, 4).forEach(function (t) {
          var c = canvas(220, 70), Y = lumaOf(220, 70, function (g) { g.fillStyle = '#fff'; g.fillRect(0, 0, 220, 70); g.fillStyle = '#000'; g.font = '28px Rubik, Arial'; g.textAlign = 'center'; g.fillText(DA.i18n.content === 'en' ? 'Good eye' : T('עין טובה'), 110, 45); });
          putLuma(c, IP.convolve(Y, 220, 70, IP.psfKernel(t.psf)), 220, 70);
          wrap.appendChild(wrapCap(c, t.label || ''));
        });
        compare.appendChild(wrap);
      }
    }
    draw(); list();
  }
  function describePsf(p) {
    if (!p) return '';
    var parts = [T('גודל ') + f1(p.radius)];
    if (p.stretch > 1.05) parts.push(T('מתיחה ') + f1(p.stretch) + ' @' + deg(p.angle));
    if (p.smear > 0.5) parts.push(T('מריחה ') + f1(p.smear) + ' @' + deg(p.angle));
    if (p.tail > 0.05) parts.push(T('זנב ') + f1(p.tail));
    if (p.halo > 0.05) parts.push(T('הילה ') + f1(p.halo));
    return parts.join(' · ');
  }
  function wrapCap(c, cap) { var d = el('<figure class="lab-fig"></figure>'); d.appendChild(c); d.appendChild(el('<figcaption>' + esc(cap) + '</figcaption>')); return d; }

  // ================= 6.2 Sharpening & deblurring =================
  var METHOD_LABEL = { unsharp: 'Unsharp Mask', directional: T('חידוד כיווני'), local: T('ניגודיות מקומית'), wiener: 'Wiener', rl: 'Richardson–Lucy' };
  function deblurTab(body) {
    var psf = ctx.profile().settings.psf || PRESETS.gauss, method = 'unsharp', stim = 'edges';
    var prm = { amount: 1, radius: 1.5, K: 0.01, iterations: 10 };
    body.appendChild(el('<p class="lab-help">' + T('משמאל המקור, מימין אחרי עיבוד. העיבוד "מחדד מראש" לפי צורת הטשטוש שלכם, כדי שאחרי הטשטוש בעין זה ייראה ברור יותר. משווים שיטות, מדרגים, ובוחרים מה להפעיל בתמונות.') + '</p>'));
    if (!ctx.profile().settings.psf) body.appendChild(el('<p class="muted small">' + T('טיפ: קודם שומרים צורת טשטוש בלשונית "צורת הטשטוש" ולוחצים "להשתמש". בינתיים משתמשים בטשטוש עגול רגיל.') + '</p>'));
    var row = el('<div class="lab-pair"></div>'), A = canvas(260, 260), B = canvas(260, 260);
    row.appendChild(wrapCap(A, T('המקור'))); row.appendChild(wrapCap(B, T('אחרי עיבוד')));
    body.appendChild(row);
    var c = el('<div class="lab-controls"></div>');
    var sel = el('<div class="row wrap"><label>' + T('גירוי') + ' <select data-k="stim"><option value="edges">' + T('קצוות') + '</option><option value="lines">' + T('קווים דקים') + '</option><option value="corners">' + T('פינות') + '</option><option value="text">' + T('טקסט') + '</option></select></label>' +
      '<label>' + T('שיטה') + ' <select data-k="method">' + IP.METHODS.map(function (m) { return '<option value="' + m + '">' + esc(METHOD_LABEL[m]) + '</option>'; }).join('') + '</select></label></div>');
    sel.querySelector('[data-k=stim]').onchange = function () { stim = this.value; draw(); };
    sel.querySelector('[data-k=method]').onchange = function () { method = this.value; showParams(); draw(); };
    c.appendChild(sel);
    var pAmount = slider(T('עוצמה'), 0, 3, 0.05, prm.amount, f1, function (v) { prm.amount = v; draw(); });
    var pRadius = slider(T('רדיוס'), 0.5, 20, 0.5, prm.radius, f1, function (v) { prm.radius = v; draw(); });
    var pK = slider(T('ריסון רעש (רגולריזציה)'), 0.001, 0.1, 0.001, prm.K, function (v) { return v.toFixed(3); }, function (v) { prm.K = v; draw(); });
    var pIt = slider(T('מספר סבבים'), 1, 30, 1, prm.iterations, String, function (v) { prm.iterations = v; draw(); });
    [pAmount, pRadius, pK, pIt].forEach(function (x) { c.appendChild(x); });
    var stats = el('<p class="hint"></p>'); c.appendChild(stats);
    var rS = rating(T('חדות')), rH = rating(T('הילות (פחות = טוב)')), rN = rating(T('רעש (פחות = טוב)')), rC = rating(T('נוחות'));
    [rS, rH, rN, rC].forEach(function (x) { c.appendChild(x); });
    var acts = el('<div class="row wrap"><button type="button" class="primary">' + T('לשמור דירוג') + '</button><button type="button">' + T('✓ להפעיל את השיטה הזו בתמונות') + '</button></div>');
    acts.children[0].onclick = function () {
      saveRecord('deblur', { method: method, params: Object.assign({}, prm), psf: psf, stimulus: stim, ratings: { sharpness: rS.value(), halos: rH.value(), noise: rN.value(), comfort: rC.value() }, metrics: lastMetrics,
        result: { summary: METHOD_LABEL[method] + ' · ' + T('נוחות ') + rC.value() + '/5' } });
      DA.ui.toast(T('הדירוג נשמר')); table();
    };
    acts.children[1].onclick = function () {
      ctx.updateSettings({ deblur: method, deblurAmount: prm.amount, deblurRadius: prm.radius, deblurK: prm.K, deblurIter: prm.iterations, psf: psf });
      DA.ui.toast(T('השיטה תופעל על תמונות, צילומים ועמודי PDF בקריאה'));
    };
    c.appendChild(acts);
    body.appendChild(c);
    var tbl = el('<div class="lab-list"></div>'); body.appendChild(el('<h3>' + T('השוואת שיטות (ממוצע הדירוגים שלי)') + '</h3>')); body.appendChild(tbl);

    var lastMetrics = null, timer = null;
    function showParams() {
      pRadius.style.display = method === 'unsharp' || method === 'directional' || method === 'local' ? '' : 'none';
      pAmount.style.display = method === 'wiener' || method === 'rl' ? 'none' : '';
      pK.style.display = method === 'wiener' ? '' : 'none';
      pIt.style.display = method === 'rl' ? '' : 'none';
    }
    function stimulus() {
      return lumaOf(260, 260, function (g) {
        g.fillStyle = '#fff'; g.fillRect(0, 0, 260, 260); g.fillStyle = '#000'; g.strokeStyle = '#000';
        if (stim === 'edges') { g.fillRect(130, 0, 130, 130); g.save(); g.translate(130, 195); g.rotate(-0.5); g.fillRect(-90, 0, 180, 80); g.restore(); }
        else if (stim === 'lines') { for (var i = 0; i < 9; i++) { g.lineWidth = 1 + (i % 3); g.beginPath(); g.moveTo(20 + i * 26, 20); g.lineTo(20 + i * 26, 120); g.stroke(); g.beginPath(); g.moveTo(20, 140 + i * 12); g.lineTo(240, 150 + i * 12); g.stroke(); } }
        else if (stim === 'corners') { g.lineWidth = 3; [[30, 30], [140, 30], [30, 140], [140, 140]].forEach(function (p, i) { g.save(); g.translate(p[0] + 45, p[1] + 45); g.rotate(i * 0.4); g.strokeRect(-35, -35, 70, 70); g.restore(); }); }
        else { g.font = '30px Rubik, Arial'; g.textAlign = 'center'; var he = DA.i18n.content !== 'en'; g.fillText(he ? T('ספר טוב') : 'A good book', 130, 70); g.font = '20px Rubik, Arial'; g.fillText(he ? T('הילדה קוראת בגינה') : 'She reads in the park', 130, 130); g.font = '14px Rubik, Arial'; g.fillText(he ? T('אותיות קטנות וברורות') : 'small clear letters', 130, 180); }
      });
    }
    function draw() {
      clearTimeout(timer);
      timer = setTimeout(function () {
        var Y = stimulus();
        putLuma(A, Y, 260, 260);
        var Z = IP.run(method, Y, 260, 260, psf, prm);
        putLuma(B, Z, 260, 260);
        lastMetrics = IP.measure(Y, Z, 260, 260);
        stats.textContent = T('מדדים: חדות ') + lastMetrics.sharpness.toFixed(3) + T(' · הילות ') + lastMetrics.halos.toFixed(4) + T(' · רעש ') + lastMetrics.noise.toFixed(4);
      }, 60);
    }
    function table() {
      var rs = records('deblur'), by = {};
      rs.forEach(function (t) { (by[t.method] = by[t.method] || []).push(t.ratings); });
      tbl.innerHTML = rs.length ? '<table class="sum"><tr><th>' + T('שיטה') + '</th><th>' + T('דירוגים') + '</th><th>' + T('חדות') + '</th><th>' + T('הילות') + '</th><th>' + T('רעש') + '</th><th>' + T('נוחות') + '</th></tr>' +
        Object.keys(by).map(function (m) {
          var a = by[m], avg = function (k) { return (a.reduce(function (s, r) { return s + r[k]; }, 0) / a.length).toFixed(1); };
          return '<tr><td>' + esc(METHOD_LABEL[m] || m) + '</td><td>' + a.length + '</td><td>' + avg('sharpness') + '</td><td>' + avg('halos') + '</td><td>' + avg('noise') + '</td><td><b>' + avg('comfort') + '</b></td></tr>';
        }).join('') + '</table>' : '<p class="muted small">' + T('עוד אין דירוגים.') + '</p>';
    }
    showParams(); draw(); table();
  }

  // ================= 6.3 Stripes (spatial frequency) =================
  function stripesTab(body) {
    var FREQS = [4, 6, 9, 13, 19, 27, 38, 54, 76];   // cycles across the patch
    body.appendChild(el('<p class="lab-help">' + T('מופיעים פסים שהולכים ונעשים צפופים. בכל פעם עונים: עדיין רואים פסים, או שזה נראה כמו אפור אחיד. הסדר של הכיוונים משתנה בכל פעם.') + '</p>'));
    if (ctx.profile().settings.calm) body.appendChild(el('<p class="bad small">' + T('מצב רגוע פועל: אם פסים מפריעים או גורמים לאי־נוחות, מדלגים על הכלי הזה.') + '</p>'));
    var c = canvas(300, 300), info = el('<p class="hint"></p>');
    var ctr = el('<div class="row wrap"><label>' + T('ניגודיות') + ' <select><option value="1">100%</option><option value="0.3">30%</option><option value="0.1">10%</option></select></label><button type="button" class="primary">' + T('▶ להתחיל') + '</button></div>');
    var ans = el('<div class="row wrap center" style="display:none"><button type="button" class="big">' + T('רואה פסים') + '</button><button type="button" class="big">' + T('נראה אפור אחיד') + '</button></div>');
    body.appendChild(ctr); body.appendChild(wrapCap(c, '')); body.appendChild(ans); body.appendChild(info);
    var res = el('<div class="lab-list"></div>'); body.appendChild(res);
    var order, oi, fi, contrast, results, merged;
    ctr.querySelector('button').onclick = function () {
      contrast = +ctr.querySelector('select').value;
      order = [0, 45, 90, 135].sort(function () { return Math.random() - 0.5; });
      oi = 0; fi = 0; merged = 0; results = {}; ans.style.display = ''; draw();
    };
    ans.children[0].onclick = function () { answer(true); };
    ans.children[1].onclick = function () { answer(false); };
    function draw() {
      var n = 300, Y = new Float32Array(n * n), a = order[oi] * Math.PI / 180, f = FREQS[fi];
      for (var y = 0; y < n; y++) for (var x = 0; x < n; x++) {
        var u = ((x - n / 2) * Math.cos(a) + (y - n / 2) * Math.sin(a)) / n;
        var r = Math.hypot(x - n / 2, y - n / 2) / (n / 2), win = r < 1 ? Math.cos(r * Math.PI / 2) : 0;
        Y[y * n + x] = 0.5 + 0.5 * contrast * win * Math.sin(2 * Math.PI * f * u);
      }
      putLuma(c, Y, n, n);
      info.textContent = T('כיוון ') + (oi + 1) + '/4 · ' + T('צפיפות ') + (fi + 1) + '/' + FREQS.length;
    }
    function answer(seen) {
      if (!seen) merged++; else merged = 0;
      var done = merged >= 2 || fi >= FREQS.length - 1;
      if (done) {
        var thr = seen ? FREQS[fi] : FREQS[Math.max(0, fi - (merged >= 2 ? 2 : 1))];
        results[order[oi]] = thr;
        oi++; fi = 0; merged = 0;
        if (oi >= order.length) { finish(); return; }
      } else fi++;
      draw();
    }
    function finish() {
      ans.style.display = 'none';
      var prev = records('stripes').filter(function (t) { return t.contrast === contrast; })[0];
      var agree = prev ? Object.keys(results).map(function (k) { return Math.abs(Math.log(results[k] / (prev.thresholds[k] || results[k]))); }) : null;
      var t = saveRecord('stripes', { contrast: contrast, thresholds: results, order: order, result: { summary: Object.keys(results).map(function (k) { return k + '°: ' + results[k]; }).join(' · ') } });
      res.innerHTML = '<table class="sum"><tr><th>' + T('כיוון') + '</th><th>' + T('הצפיפות האחרונה שבה ראו פסים (מחזורים לאורך הריבוע)') + '</th></tr>' +
        [0, 45, 90, 135].map(function (k) { return '<tr><td>' + k + '°</td><td>' + results[k] + '</td></tr>'; }).join('') + '</table>' +
        (agree ? '<p>' + T('התאמה לפעם הקודמת: ') + (agree.every(function (v) { return v < 0.45; }) ? T('דומה ✓') : T('יש הבדלים. כדאי לחזור שוב.')) + '</p>' : '<p class="muted small">' + T('אחרי חזרה נוספת תוצג גם ההתאמה בין הפעמים.') + '</p>');
      info.textContent = T('נשמר ✓');
      return t;
    }
  }

  // ================= 6.4 Local blur (brush) =================
  function localBlurTab(body) {
    var N = 320, MASK = 64, mask = new Uint8Array(MASK * MASK), shape = 'rect', angle = 90, strength = 4, brush = 18, coords = 'shape';
    var off = [0, 0];
    body.appendChild(el('<p class="lab-help">' + T('צובעים במברשת את האזור שנראה מטושטש, ומכוונים את כיוון המריחה ועוצמתה עד שהציור דומה למה שרואים. אחר כך מזיזים את הצורה ובודקים: הטשטוש זז איתה, או נשאר באותו מקום על המסך?') + '</p>'));
    var c = canvas(N, N); c.style.touchAction = 'none'; c.style.cursor = 'crosshair';
    body.appendChild(wrapCap(c, ''));
    var ctl = el('<div class="lab-controls"></div>');
    var r1 = el('<div class="row wrap"><label>' + T('צורה') + ' <select data-k="shape"><option value="rect">' + T('מלבן') + '</option><option value="line">' + T('קו') + '</option><option value="letter">' + T('אות') + '</option><option value="circle">' + T('עיגול') + '</option></select></label>' +
      '<label>' + T('המסכה צמודה ל') + ' <select data-k="coords"><option value="shape">' + T('צורה') + '</option><option value="screen">' + T('מסך') + '</option></select></label>' +
      '<button type="button" data-k="clear">' + T('למחוק סימון') + '</button><button type="button" data-k="move">' + T('להזיז את הצורה') + '</button></div>');
    ctl.appendChild(r1);
    ctl.appendChild(slider(T('גודל מברשת'), 6, 50, 1, brush, String, function (v) { brush = v; }));
    ctl.appendChild(slider(T('כיוון המריחה'), 0, 180, 1, angle, deg, function (v) { angle = v; draw(); }));
    ctl.appendChild(slider(T('עוצמת הטשטוש'), 0, 12, 0.5, strength, f1, function (v) { strength = v; draw(); }));
    var q = el('<div class="row wrap" style="display:none"><span>' + T('אחרי ההזזה, הטשטוש:') + '</span><button type="button">' + T('זז עם הצורה') + '</button><button type="button">' + T('נשאר במקום על המסך') + '</button></div>');
    ctl.appendChild(q);
    var save = el('<div class="row wrap"><button type="button" class="primary">' + T('לשמור') + '</button></div>');
    ctl.appendChild(save);
    body.appendChild(ctl);
    var moveAnswer = null;
    r1.querySelector('[data-k=shape]').onchange = function () { shape = this.value; draw(); };
    r1.querySelector('[data-k=coords]').onchange = function () { coords = this.value; draw(); };
    r1.querySelector('[data-k=clear]').onclick = function () { mask.fill(0); draw(); };
    r1.querySelector('[data-k=move]').onclick = function () { off = [Math.round((Math.random() - 0.5) * 90), Math.round((Math.random() - 0.5) * 90)]; q.style.display = ''; draw(); };
    q.children[1].onclick = function () { moveAnswer = 'moves-with-shape'; DA.ui.toast(T('נרשם')); };
    q.children[2].onclick = function () { moveAnswer = 'stays-on-screen'; DA.ui.toast(T('נרשם')); };
    save.querySelector('button').onclick = function () {
      var bits = []; for (var i = 0; i < mask.length; i++) if (mask[i]) bits.push(i);
      saveRecord('local-blur', { shape: shape, coords: coords, angle: angle, strength: strength, mask: { size: MASK, on: bits }, moved: off, moveAnswer: moveAnswer,
        result: { summary: T('אזור מסומן: ') + Math.round(bits.length / mask.length * 100) + '% · ' + deg(angle) } });
      DA.ui.toast(T('נשמר ✓'));
    };
    var painting = false;
    function paint(e) {
      var r = c.getBoundingClientRect(), k = c.width / r.width, x = (e.clientX - r.left) * k, y = (e.clientY - r.top) * k;   // the canvas may be scaled down on phones
      if (coords === 'shape') { x -= off[0]; y -= off[1]; }
      var mx = Math.floor(x / N * MASK), my = Math.floor(y / N * MASK), br = Math.max(1, Math.round(brush / N * MASK));
      for (var j = -br; j <= br; j++) for (var i = -br; i <= br; i++) if (i * i + j * j <= br * br) { var X = mx + i, Y = my + j; if (X >= 0 && Y >= 0 && X < MASK && Y < MASK) mask[Y * MASK + X] = 1; }
      draw();
    }
    c.addEventListener('pointerdown', function (e) { painting = true; c.setPointerCapture(e.pointerId); paint(e); });
    c.addEventListener('pointermove', function (e) { if (painting) paint(e); });
    c.addEventListener('pointerup', function () { painting = false; });
    function drawShape(g) {
      g.fillStyle = '#000'; g.strokeStyle = '#000';
      g.save(); g.translate(off[0], off[1]);
      if (shape === 'rect') g.fillRect(90, 110, 140, 100);
      else if (shape === 'line') { g.lineWidth = 6; g.beginPath(); g.moveTo(60, 160); g.lineTo(260, 160); g.stroke(); }
      else if (shape === 'circle') { g.beginPath(); g.arc(160, 160, 70, 0, Math.PI * 2); g.fill(); }
      else { g.font = 'bold 170px Rubik, Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(DA.i18n.content === 'en' ? 'B' : T('ב'), 160, 165); }
      g.restore();
    }
    function draw() {
      var g = c.getContext('2d');
      g.fillStyle = '#fff'; g.fillRect(0, 0, N, N);
      drawShape(g);
      // simulated local smear: draw the shape several times shifted along the angle, clipped to the mask
      var mc = canvas(N, N), mg = mc.getContext('2d'), a = angle * Math.PI / 180, steps = Math.max(1, Math.round(strength * 2));
      mg.globalAlpha = 1 / (steps + 1);
      for (var s = -steps; s <= steps; s++) { mg.save(); mg.translate(Math.cos(a) * s * strength / steps, Math.sin(a) * s * strength / steps); drawShape(mg); mg.restore(); }
      var clip = canvas(N, N), cg = clip.getContext('2d'), cell = N / MASK, dx = coords === 'shape' ? off[0] : 0, dy = coords === 'shape' ? off[1] : 0;
      cg.fillStyle = '#000';
      for (var i = 0; i < mask.length; i++) if (mask[i]) cg.fillRect((i % MASK) * cell + dx, Math.floor(i / MASK) * cell + dy, cell + 0.5, cell + 0.5);
      cg.globalCompositeOperation = 'source-in';
      cg.fillStyle = '#fff'; cg.fillRect(0, 0, N, N);
      cg.drawImage(mc, 0, 0);
      g.drawImage(clip, 0, 0);
      g.strokeStyle = 'rgba(122,60,220,.5)'; g.lineWidth = 1;
      for (i = 0; i < mask.length; i++) if (mask[i]) { var x = (i % MASK) * cell + dx, y = Math.floor(i / MASK) * cell + dy; if (!mask[i - 1] || !mask[i + 1] || !mask[i - MASK] || !mask[i + MASK]) g.strokeRect(x, y, cell, cell); }
    }
    draw();
  }

  // ================= 6.5 Local brightness & contrast =================
  function contrastTab(body) {
    var regions = []; for (var i = 0; i < 9; i++) regions.push({ b: 0, c: 1 });
    var sel = 4, bgc = 'white', invert = false, N = 330;
    body.appendChild(el('<p class="lab-help">' + T('לוחצים על אזור במסך (יש 9 אזורים), ומשנים את הבהירות והניגודיות שלו עד שהפרטים נראים ברורים ונוחים. אפשר להחליף רקע וקוטביות.') + '</p>'));
    var c = canvas(N, N); body.appendChild(wrapCap(c, ''));
    var ctl = el('<div class="lab-controls"></div>');
    var r = el('<div class="row wrap"><label>' + T('רקע') + ' <select><option value="white">' + T('לבן') + '</option><option value="gray">' + T('אפור') + '</option><option value="black">' + T('שחור') + '</option></select></label><label class="check"><input type="checkbox"> ' + T('היפוך שחור־לבן') + '</label></div>');
    r.querySelector('select').onchange = function () { bgc = this.value; draw(); };
    r.querySelector('input').onchange = function () { invert = this.checked; draw(); };
    ctl.appendChild(r);
    var sb = slider(T('בהירות האזור'), -0.4, 0.4, 0.02, 0, function (v) { return Math.round(v * 100) + '%'; }, function (v) { regions[sel].b = v; draw(); });
    var sc = slider(T('ניגודיות האזור'), 0.4, 1.8, 0.05, 1, f1, function (v) { regions[sel].c = v; draw(); });
    ctl.appendChild(sb); ctl.appendChild(sc);
    var rate = rating(T('נוחות')); ctl.appendChild(rate);
    var sv = el('<div class="row wrap"><button type="button" class="primary">' + T('לשמור') + '</button></div>');
    sv.querySelector('button').onclick = function () {
      saveRecord('local-contrast', { regions: regions, background: bgc, invert: invert, comfort: rate.value(),
        result: { summary: T('רקע ') + bgc + (invert ? T(' · הפוך') : '') + T(' · נוחות ') + rate.value() + '/5' } });
      DA.ui.toast(T('נשמר ✓'));
    };
    ctl.appendChild(sv); body.appendChild(ctl);
    c.addEventListener('click', function (e) {
      var rr = c.getBoundingClientRect(), x = Math.floor((e.clientX - rr.left) / rr.width * 3), y = Math.floor((e.clientY - rr.top) / rr.height * 3);
      sel = Math.max(0, Math.min(8, y * 3 + x)); sb.set(regions[sel].b); sc.set(regions[sel].c); draw();
    });
    function draw() {
      var Y = lumaOf(N, N, function (g) {
        g.fillStyle = { white: '#fff', gray: '#888', black: '#000' }[bgc]; g.fillRect(0, 0, N, N);
        for (var i = 0; i < 11; i++) { var v = Math.round(i / 10 * 255); g.fillStyle = 'rgb(' + v + ',' + v + ',' + v + ')'; g.fillRect(i * N / 11, 8, N / 11 + 1, 40); }
        [[60, 120, '#222'], [160, 130, '#666'], [260, 120, '#aaa'], [70, 230, '#ddd'], [170, 240, '#333'], [270, 230, '#999']].forEach(function (p) { g.fillStyle = p[2]; g.beginPath(); g.arc(p[0], p[1], 28, 0, Math.PI * 2); g.fill(); });
        var grd = g.createLinearGradient(0, 0, N, 0); grd.addColorStop(0, '#000'); grd.addColorStop(1, '#fff'); g.fillStyle = grd; g.fillRect(0, 290, N, 30);
        g.fillStyle = '#000'; g.font = '16px Rubik, Arial'; g.fillText(DA.i18n.content === 'en' ? 'Small text' : T('טקסט קטן'), 120, 190);
      });
      var out = new Float32Array(N * N), cell = N / 3;
      for (var y = 0; y < N; y++) for (var x = 0; x < N; x++) {
        var reg = regions[Math.min(2, Math.floor(y / cell)) * 3 + Math.min(2, Math.floor(x / cell))];
        var v = Y[y * N + x]; if (invert) v = 1 - v;
        out[y * N + x] = Math.max(0, Math.min(1, (v - 0.5) * reg.c + 0.5 + reg.b));
      }
      putLuma(c, out, N, N);
      var g = c.getContext('2d'); g.strokeStyle = 'rgba(122,60,220,.9)'; g.lineWidth = 3;
      g.strokeRect((sel % 3) * cell + 1.5, Math.floor(sel / 3) * cell + 1.5, cell - 3, cell - 3);
    }
    draw();
  }

  // ================= 5.1 Depth (sunken / raised) =================
  function depthTab(body) {
    var N = 320, n = 5, dots = [], sel = -1, param = 'size';
    for (var j = 0; j < n; j++) for (var i = 0; i < n; i++) dots.push({ x: 40 + i * 60, y: 40 + j * 60, size: 1, bright: 0, sharp: 0, dx: 0 });
    body.appendChild(el('<p class="lab-help">' + T('כל הנקודות זהות. לוחצים על נקודה שנראית שקועה או בולטת, מדרגים כמה, ואז משנים רק דבר אחד שלה (גודל, בהירות, חדות או מיקום) כדי לראות אם התחושה פוחתת.') + '</p>'));
    var c = canvas(N, N); body.appendChild(wrapCap(c, ''));
    var ctl = el('<div class="lab-controls"></div>');
    var r = el('<div class="row wrap"><label>' + T('התחושה') + ' <select data-k="kind"><option value="sunken">' + T('שקועה') + '</option><option value="raised">' + T('בולטת') + '</option></select></label>' +
      '<label>' + T('מה משנים') + ' <select data-k="param"><option value="size">' + T('גודל') + '</option><option value="bright">' + T('בהירות') + '</option><option value="sharp">' + T('חדות') + '</option><option value="dx">' + T('מיקום') + '</option></select></label></div>');
    r.querySelector('[data-k=param]').onchange = function () { param = this.value; if (sel >= 0) adj.set(valOf()); };
    ctl.appendChild(r);
    var before = rating(T('עוצמת התחושה לפני')), after = rating(T('עוצמת התחושה אחרי'));
    var adj = slider(T('שינוי'), -1, 1, 0.02, 0, f1, function (v) { if (sel < 0) return; setVal(v); draw(); });
    ctl.appendChild(before); ctl.appendChild(adj); ctl.appendChild(after);
    var sv = el('<div class="row wrap"><button type="button" class="primary">' + T('לשמור את הנקודה הזו') + '</button></div>');
    sv.querySelector('button').onclick = function () {
      if (sel < 0) { DA.ui.toast(T('קודם בוחרים נקודה')); return; }
      var d = dots[sel];
      saveRecord('depth', { dot: sel, position: { x: d.x / N, y: d.y / N }, feeling: r.querySelector('[data-k=kind]').value, before: before.value(), after: after.value(), param: param, change: valOf(),
        result: { summary: r.querySelector('[data-k=kind]').selectedOptions[0].textContent + ' ' + before.value() + '→' + after.value() + ' (' + r.querySelector('[data-k=param]').selectedOptions[0].textContent + ')' } });
      DA.ui.toast(T('נשמר ✓'));
    };
    ctl.appendChild(sv); body.appendChild(ctl);
    function valOf() { var d = dots[sel]; return param === 'size' ? d.size - 1 : param === 'bright' ? d.bright : param === 'sharp' ? d.sharp : d.dx / 20; }
    function setVal(v) { var d = dots[sel]; if (param === 'size') d.size = 1 + v; else if (param === 'bright') d.bright = v; else if (param === 'sharp') d.sharp = v; else d.dx = v * 20; }
    c.addEventListener('click', function (e) {
      var rr = c.getBoundingClientRect(), kk = c.width / rr.width, x = (e.clientX - rr.left) * kk, y = (e.clientY - rr.top) * kk, best = -1, bd = 26;
      dots.forEach(function (d, i) { var dd = Math.hypot(d.x + d.dx - x, d.y - y); if (dd < bd) { bd = dd; best = i; } });
      if (best >= 0) { sel = best; adj.set(valOf()); draw(); }
    });
    function draw() {
      var g = c.getContext('2d');
      g.fillStyle = '#c8c8c8'; g.fillRect(0, 0, N, N);
      dots.forEach(function (d, i) {
        var v = Math.round(Math.max(0, Math.min(1, 0.15 - d.bright * 0.5)) * 255);
        g.save();
        g.filter = d.sharp < 0 ? 'blur(' + (-d.sharp * 3).toFixed(1) + 'px)' : 'none';
        g.fillStyle = 'rgb(' + v + ',' + v + ',' + v + ')';
        g.beginPath(); g.arc(d.x + d.dx, d.y, 9 * Math.max(0.2, d.size), 0, Math.PI * 2); g.fill();
        if (d.sharp > 0) { g.filter = 'none'; g.lineWidth = d.sharp * 2; g.strokeStyle = '#000'; g.stroke(); }
        g.restore();
        if (i === sel) { g.strokeStyle = 'rgba(122,60,220,.9)'; g.lineWidth = 2; g.beginPath(); g.arc(d.x + d.dx, d.y, 18, 0, Math.PI * 2); g.stroke(); }
      });
    }
    draw();
  }

  // ================= 7.2 Motion =================
  function motionTab(body) {
    var N = 340, path = 'h', speed = 0.5, playing = false, t = 0, last = 0, raf = 0, events = [];
    body.appendChild(el('<p class="lab-help">' + T('נקודה נעה במסלול. עוקבים אחריה במבט, וכשקורה משהו מוזר לוחצים על הכפתור המתאים: קפיצה, מריחה, כפילות, עיכוב או היעלמות.') + '</p>'));
    var c = canvas(N, N); body.appendChild(wrapCap(c, ''));
    var ctl = el('<div class="lab-controls"></div>');
    var r = el('<div class="row wrap"><label>' + T('מסלול') + ' <select><option value="h">' + T('אופקי') + '</option><option value="v">' + T('אנכי') + '</option><option value="d">' + T('אלכסון') + '</option><option value="c">' + T('מעגל') + '</option></select></label><button type="button" class="primary">' + T('▶ הפעלה') + '</button></div>');
    r.querySelector('select').onchange = function () { path = this.value; t = 0; };
    r.querySelector('button').onclick = function () { playing = !playing; this.textContent = playing ? T('⏸ עצירה') : T('▶ הפעלה'); if (playing) { last = performance.now(); loop(); } };
    ctl.appendChild(r);
    ctl.appendChild(slider(T('מהירות'), 0.05, 1, 0.05, speed, function (v) { return Math.round(v * 100) + '%'; }, function (v) { speed = v; }));
    var ev = el('<div class="row wrap"></div>');
    [['jump', T('קפיצה')], ['smear', T('מריחה')], ['double', T('כפילות')], ['lag', T('עיכוב')], ['vanish', T('נעלמה')]].forEach(function (k) {
      var b = el('<button type="button" class="big">' + esc(k[1]) + '</button>');
      b.onclick = function () { var p = pos(); events.push({ type: k[0], path: path, speed: speed, t: Math.round(t * 1000) / 1000, x: Math.round(p[0]) / N, y: Math.round(p[1]) / N, at: new Date().toISOString() }); info.textContent = T('דיווחים: ') + events.length; };
      ev.appendChild(b);
    });
    ctl.appendChild(ev);
    var info = el('<p class="hint">' + T('דיווחים: 0') + '</p>'); ctl.appendChild(info);
    var sv = el('<div class="row wrap"><button type="button" class="primary">' + T('לשמור את הדיווחים') + '</button></div>');
    sv.querySelector('button').onclick = function () {
      if (!events.length) { DA.ui.toast(T('אין עדיין דיווחים')); return; }
      saveRecord('motion', { events: events, result: { summary: events.length + T(' דיווחים') } });
      events = []; info.textContent = T('נשמר ✓');
    };
    ctl.appendChild(sv); body.appendChild(ctl);
    function pos() {
      var ph = t % 1, u = ph < 0.5 ? ph * 2 : 2 - ph * 2, m = 40;   // constant speed back and forth
      if (path === 'h') return [m + u * (N - 2 * m), N / 2];
      if (path === 'v') return [N / 2, m + u * (N - 2 * m)];
      if (path === 'd') return [m + u * (N - 2 * m), m + u * (N - 2 * m)];
      return [N / 2 + Math.cos(t * Math.PI * 2) * (N / 2 - m), N / 2 + Math.sin(t * Math.PI * 2) * (N / 2 - m)];
    }
    function draw() {
      var g = c.getContext('2d'), p = pos();
      g.fillStyle = '#fff'; g.fillRect(0, 0, N, N);
      g.fillStyle = '#000'; g.beginPath(); g.arc(p[0], p[1], 8, 0, Math.PI * 2); g.fill();
    }
    function loop(now) {
      if (!playing) return;
      now = now || performance.now();
      t += (now - last) / 1000 * speed * 0.35; last = now;
      draw();
      raf = requestAnimationFrame(loop);
    }
    cleanup = function () { playing = false; cancelAnimationFrame(raf); };
    draw();
  }

  DA.screens.lab = { init: init, enter: enter, leave: leave, describePsf: describePsf };
})(typeof window !== 'undefined' ? window : globalThis);
