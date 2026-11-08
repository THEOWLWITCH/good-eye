/* Node tests for the engine, history and storage modules.  Run:  node tests/run-tests.js */
'use strict';
var path = require('path');
['js/core/i18n-en.js', 'js/core/i18n.js', 'js/engine/deformation.js', 'js/core/history.js', 'js/core/storage.js', 'js/core/settings.js', 'js/vision/eyes.js'].forEach(function (f) {
  require(path.join(__dirname, '..', f));
});
var DA = globalThis.DA, DEF = DA.deformation;
var passed = 0, failed = 0;

function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (e) { failed++; console.log('  ✗ ' + name + '\n      ' + e.message); }
}
function ok(c, m) { if (!c) throw new Error(m || 'assertion failed'); }
function near(a, b, eps, m) { if (Math.abs(a - b) > (eps || 1e-9)) throw new Error((m || '') + ' expected ' + b + ' got ' + a); }

console.log('Deformation engine');
test('kernel is 1 at center and 0 at radius', function () {
  near(DEF.kernel(0), 1); near(DEF.kernel(1), 0); near(DEF.kernel(1.5), 0);
});
test('grabbed point follows the pointer exactly', function () {
  var op = { ax: 0.4, ay: 0.5, dx: 0.03, dy: -0.02, r: 0.15 };
  var p = DEF.apply([op], 0.4, 0.5);
  near(p[0], 0.43, 1e-12); near(p[1], 0.48, 1e-12);
});
test('points outside the radius do not move (local effect)', function () {
  var op = { ax: 0.5, ay: 0.5, dx: 0.05, dy: 0, r: 0.1 };
  var p = DEF.apply([op], 0.7, 0.5);
  near(p[0], 0.7); near(p[1], 0.5);
});
test('field is continuous (no jumps between neighbouring points)', function () {
  var ops = [{ ax: 0.5, ay: 0.5, dx: 0.04, dy: 0.02, r: 0.2 }, { ax: 0.3, ay: 0.6, dx: -0.03, dy: 0.01, r: 0.12 }];
  var h = 1e-4, maxJump = 0;
  for (var i = 0; i < 2000; i++) {
    var x = Math.random(), y = Math.random();
    var a = DEF.apply(ops, x, y), b = DEF.apply(ops, x + h, y);
    maxJump = Math.max(maxJump, Math.hypot(b[0] - a[0], b[1] - a[1]));
  }
  ok(maxJump < 5 * h, 'max jump ' + maxJump);
});
test('analytic jacobian matches finite differences', function () {
  var ops = [{ ax: 0.5, ay: 0.5, dx: 0.04, dy: 0.02, r: 0.2 }, { ax: 0.45, ay: 0.55, dx: -0.02, dy: 0.03, r: 0.1 }];
  var h = 1e-6, x = 0.47, y = 0.53;
  var J = DEF.jacobian(ops, x, y);
  var p = DEF.apply(ops, x, y), px = DEF.apply(ops, x + h, y), py = DEF.apply(ops, x, y + h);
  near(J[0][0], (px[0] - p[0]) / h, 1e-4); near(J[1][0], (px[1] - p[1]) / h, 1e-4);
  near(J[0][1], (py[0] - p[0]) / h, 1e-4); near(J[1][1], (py[1] - p[1]) / h, 1e-4);
});
test('small drags are fold-free', function () {
  var q = DEF.analyze([{ ax: 0.5, ay: 0.5, dx: 0.03, dy: 0, r: 0.15 }]);
  ok(q.foldFree, 'expected fold free, minDet=' + q.minDet);
});
test('large drag relative to radius is reported as a fold', function () {
  var q = DEF.analyze([{ ax: 0.5, ay: 0.5, dx: 0.12, dy: 0, r: 0.15 }], 81);
  ok(q.fold, 'expected fold');
});
test('clampDelta keeps every op fold-free', function () {
  var c = DEF.clampDelta(0.5, 0.2, 0.1);
  ok(c.clamped);
  ok(DEF.opMinDetBound({ ax: 0, ay: 0, dx: c.dx, dy: c.dy, r: 0.1 }) > 0);
});
test('inverse mapping recovers the original point', function () {
  var ops = [{ ax: 0.5, ay: 0.5, dx: 0.04, dy: 0.02, r: 0.2 }, { ax: 0.3, ay: 0.6, dx: -0.03, dy: 0.01, r: 0.12 }];
  var p = DEF.apply(ops, 0.42, 0.57), back = DEF.invert(ops, p[0], p[1]);
  near(back[0], 0.42, 1e-9); near(back[1], 0.57, 1e-9);
});

console.log('History');
test('undo / redo / reset', function () {
  var h = new DA.History([]);
  h.commit([1]); h.commit([1, 2]);
  ok(h.undo()); ok(JSON.stringify(h.present) === '[1]');
  ok(h.redo()); ok(JSON.stringify(h.present) === '[1,2]');
  ok(h.reset([])); ok(h.present.length === 0);
  ok(h.undo()); ok(JSON.stringify(h.present) === '[1,2]', 'reset is undoable');
  h.undo(); h.commit([9]); ok(!h.canRedo(), 'new action clears redo');
});
test('history survives JSON round-trip', function () {
  var h = new DA.History([]); h.commit([1]); h.commit([1, 2]); h.undo();
  var h2 = DA.History.fromJSON(JSON.parse(JSON.stringify(h.toJSON())));
  ok(h2.canRedo() && h2.canUndo()); h2.redo(); ok(JSON.stringify(h2.present) === '[1,2]');
});

console.log('Storage');
function fakeTrial(id) {
  var ops = [{ ax: 0.5, ay: 0.3, dx: 0.01, dy: 0.02, r: 0.15 }];
  return {
    schema: 'da.trial/1', id: id, label: 'בדיקה, "עם" גרשיים', savedAt: new Date().toISOString(), instrument: 'flex-grid',
    display: { stimulusSizePx: 800 }, viewing: { distanceCm: 50 },
    actions: [{ seq: 1, lineId: 'h2', from: { x: 0.5, y: 0.3 }, to: { x: 0.51, y: 0.32 }, original: { x: 0.5, y: 0.3 }, dx: 0.01, dy: 0.02, distance: 0.0224, directionDeg: 63.4, radius: 0.15 }],
    model: { ops: ops }, ratings: { confidence: 4 }
  };
}
test('save, list, reload exactly ("close and reopen")', function () {
  var backend = DA.storage.memoryBackend();
  var s1 = new DA.storage.Store(backend);
  var t = fakeTrial('T1');
  s1.saveTrial(t);
  var s2 = new DA.storage.Store(backend); // simulates a fresh app start on same storage
  ok(s2.listTrials().length === 1);
  ok(JSON.stringify(s2.getTrial('T1')) === JSON.stringify(t), 'restored trial must be identical');
  var a = DEF.apply(t.model.ops, 0.5, 0.3), b = DEF.apply(s2.getTrial('T1').model.ops, 0.5, 0.3);
  ok(a[0] === b[0] && a[1] === b[1], 'restored geometry identical');
});
test('export bundle imports back', function () {
  var s = new DA.storage.Store(DA.storage.memoryBackend());
  var bundle = JSON.parse(JSON.stringify(DA.storage.exportBundle([fakeTrial('A'), fakeTrial('B')], 'x')));
  ok(s.importBundle(bundle) === 2); ok(s.listTrials().length === 2);
});
test('CSV escapes commas and quotes, has a row per action', function () {
  var csv = DA.storage.actionsCSV([fakeTrial('A')]);
  var lines = csv.replace(/^﻿/, '').split('\r\n');
  ok(lines.length === 2, 'header + 1 row');
  ok(lines[1].indexOf('"בדיקה, ""עם"" גרשיים"') >= 0, 'escaped label');
  ok(lines[0].split(',').length === DA.storage.ACTION_COLUMNS.length);
});
test('delete removes trial', function () {
  var s = new DA.storage.Store(DA.storage.memoryBackend());
  s.saveTrial(fakeTrial('A')); s.deleteTrial('A');
  ok(s.listTrials().length === 0 && s.getTrial('A') === null);
});

console.log('Eye-tracking math');
var EM = DA.eyeMath;
test('distance from iris size round-trips with focal calibration', function () {
  var f = 1000, irisPx = f * EM.IRIS_MM / 500; // iris seen at 50 cm
  near(EM.distanceCm(irisPx, f), 50, 1e-9);
  near(EM.focalFromKnown(irisPx, 50), f, 1e-9);
});
test('focal length from field of view is plausible', function () {
  var f = EM.focalFromFov(1280, 62);
  ok(f > 900 && f < 1200, 'f=' + f);
});
test('iris centred in both eyes gives gaze ratio ~0.5; moving both irises shifts it', function () {
  var lm = []; for (var i = 0; i < 478; i++) lm.push({ x: 0.5, y: 0.5 });
  function P(i, x, y) { lm[i] = { x: x, y: y }; }
  P(33, .30, .5); P(133, .40, .5); P(159, .35, .48); P(145, .35, .52); P(468, .35, .5);
  P(362, .60, .5); P(263, .70, .5); P(386, .65, .48); P(374, .65, .52); P(473, .65, .5);
  var g = EM.gazeRatios(lm, 1000, 1000);
  near(g.h, 0.5, 1e-6); near(g.v, 0.5, 1e-6);
  P(468, .37, .5); P(473, .67, .5);
  var g2 = EM.gazeRatios(lm, 1000, 1000);
  ok(Math.abs(g2.h - 0.5) > 0.15, 'h=' + g2.h);
});
test('settings keep eye-tracking fields', function () {
  var s = DA.settings.normalize({ eyesKeepAngle: true, refDistanceCm: 45 });
  ok(s.eyesKeepAngle === true && s.refDistanceCm === 45);
});

console.log('Colour-vision help & comfort settings');
test('daltonize keeps grays gray and makes red visible to a deutan viewer', function () {
  var src = require('fs').readFileSync(path.join(__dirname, '..', 'js/render/lens.js'), 'utf8');
  var tables = src.slice(src.indexOf('var CVD_SIM'), src.indexOf('/** D = I'));
  var fn = src.slice(src.indexOf('function daltonizeMatrix'), src.indexOf('var cvdReady'));
  var dalt = new Function(tables + fn + 'return daltonizeMatrix;')();
  ['protan', 'deutan', 'tritan'].forEach(function (t) {
    var D = dalt(t);
    for (var r = 0; r < 3; r++) near(D[r][0] + D[r][1] + D[r][2], 1, 5e-3, t + ' row ' + r);
  });
  var D = dalt('deutan');
  ok(Math.abs(D[2][0]) > 0.1, 'red gains a blue component');
});
test('logMAR sizes: logmarToPx is the inverse of printSize, and a 0.1 step is ×1.26', function () {
  if (!global.localStorage) global.localStorage = { getItem: function () { return null; }, setItem: function () {} };
  if (!global.screen) global.screen = { width: 1920, height: 1080 };
  global.window = global; require(path.join(__dirname, '..', 'js/core/device.js'));
  var D = DA.device;
  [0, 0.4, 1.0, 1.3].forEach(function (L) { near(D.printSize(D.logmarToPx(L, 40), 40).logMAR, L, 0.011, 'logMAR ' + L); });
  near(D.logmarToPx(0.5, 40) / D.logmarToPx(0.4, 40), Math.pow(10, 0.1), 0.002, 'step');
});
test('gaze calibration fits a linear map and reports its error', function () {
  global.window = global; require(path.join(__dirname, '..', 'js/vision/gaze.js'));
  var G = DA.gazeMath, truth = { cx: [960, -1500, 12], cy: [540, 1100, -9] }, L = [], C = [];
  [[.1, .1], [.5, .1], [.9, .1], [.1, .5], [.5, .5], [.9, .5], [.1, .9], [.5, .9], [.9, .9]].forEach(function (p, i) {
    var f = { h: 0.35 + p[0] * 0.3, v: 0.3 + p[1] * 0.4, yaw: Math.sin(i * 1.7) * 3, pitch: Math.cos(i * 2.3) * 2 };
    var q = G.predict(truth, f); L.push(Object.assign(f, { x: q.x, y: q.y }));
  });
  var m = G.fit(L);
  ok(m && G.meanError(m, L) < 0.01, 'recovers an exact linear map: ' + (m && G.meanError(m, L)));
  var f2 = { h: 0.5, v: 0.5, yaw: 1, pitch: 0 }, q2 = G.predict(truth, f2);
  C.push(Object.assign(f2, { x: q2.x + 30, y: q2.y - 40 }));
  near(G.meanError(m, C), 50, 0.05, 'error of a check point 50 px off');
});
test('Machado matrices: a deutan viewer confuses red/green, and the correction separates them', function () {
  var src = require('fs').readFileSync(path.join(__dirname, '..', 'js/render/lens.js'), 'utf8');
  var tables = src.slice(src.indexOf('var CVD_SIM'), src.indexOf('/** D = I'));
  var fn = src.slice(src.indexOf('function daltonizeMatrix'), src.indexOf('var cvdReady'));
  var lib = new Function(tables + fn + 'return { S: CVD_SIM, dalt: daltonizeMatrix };')();
  function mul(M, v) { return M.map(function (r) { return r[0] * v[0] + r[1] * v[1] + r[2] * v[2]; }); }
  function dist(a, b) { return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]); }
  var red = [0.6, 0.2, 0.1], green = [0.25, 0.4, 0.1];          // linear RGB, similar brightness
  var S = lib.S.deutan, D = lib.dalt('deutan');
  var before = dist(mul(S, red), mul(S, green)), after = dist(mul(S, mul(D, red)), mul(S, mul(D, green)));
  ok(before < dist(red, green) * 0.5, 'simulated colours are close: ' + before.toFixed(3));
  ok(after > before * 1.3, 'corrected colours are further apart for the viewer: ' + after.toFixed(3));
});
test('comfort settings are kept within range', function () {
  var s = DA.settings.normalize({ brightness: 0.1, warmth: 3, cvd: 'xyz', calm: true });
  ok(s.brightness === 0.4 && s.warmth === 1 && s.cvd === 'none' && s.calm === true);
});

console.log('Image processing (blur & deblur)');
require(path.join(__dirname, '..', 'js/engine/imageproc.js'));
var IP = DA.imageproc;
function testImage(w, h) { // bars and a step edge
  var Y = new Float32Array(w * h);
  for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) Y[y * w + x] = (x > w / 2 ? 0.9 : 0.1) * ((Math.floor(y / 6) % 2) ? 1 : 0.85);
  return Y;
}
function err(a, b) { var s = 0; for (var i = 0; i < a.length; i++) s += (a[i] - b[i]) * (a[i] - b[i]); return Math.sqrt(s / a.length); }
test('PSF kernels are normalized for every component', function () {
  [{ radius: 1 }, { radius: 2, stretch: 2, angle: 30 }, { radius: 1, smear: 8, angle: 90 }, { radius: 1, tail: 0.8, tailLen: 10 }, { radius: 1, halo: 0.6, haloR: 7 }].forEach(function (p) {
    var k = IP.psfKernel(p), s = 0; for (var i = 0; i < k.data.length; i++) s += k.data[i];
    near(s, 1, 1e-5);
  });
});
test('FFT round-trip returns the original', function () {
  var N = 16, re = new Float64Array(N * N), im = new Float64Array(N * N), orig = [];
  for (var i = 0; i < N * N; i++) { re[i] = Math.sin(i * 0.37); orig.push(re[i]); }
  IP.fft2(re, im, N, false); IP.fft2(re, im, N, true);
  for (i = 0; i < N * N; i++) near(re[i], orig[i], 1e-9);
});
test('Wiener and Richardson-Lucy bring a blurred image closer to the original', function () {
  var w = 48, h = 48, Y = testImage(w, h), psf = { radius: 1.6 };
  var B = IP.convolve(Y, w, h, IP.psfKernel(psf));
  var eB = err(B, Y), eW = err(IP.wiener(B, w, h, IP.psfKernel(psf), { K: 0.002 }), Y), eR = err(IP.richardsonLucy(B, w, h, IP.psfKernel(psf), { iterations: 15 }), Y);
  ok(eW < eB, 'wiener ' + eW.toFixed(4) + ' < blurred ' + eB.toFixed(4));
  ok(eR < eB, 'RL ' + eR.toFixed(4) + ' < blurred ' + eB.toFixed(4));
});
test('unsharp mask increases measured sharpness', function () {
  var w = 40, h = 40, Y = testImage(w, h), B = IP.convolve(Y, w, h, IP.psfKernel({ radius: 1.5 }));
  ok(IP.measure(B, IP.unsharp(B, w, h, { amount: 1 }), w, h).sharpness > IP.measure(B, B, w, h).sharpness);
});

console.log('Reading aids');
require(path.join(__dirname, '..', 'js/content/readaids.js'));
var RA = DA.readaids;
test('pointed Hebrew splits into syllables; unpointed stays whole', function () {
  var s = RA.syllables('שָׁלוֹם');            // sha-lom
  ok(s.join('|') === 'שָׁ|לוֹם', JSON.stringify(s));
  var t = RA.syllables('תַּפּוּחַ');          // ta-pu-ach (furtive patah)
  ok(t.join('|') === 'תַּ|פּוּחַ', JSON.stringify(t));
  var s2 = RA.syllables('יְלָדִים');           // ye-la-dim
  ok(s2.join('') === 'יְלָדִים' && s2.length >= 2, JSON.stringify(s2));
  ok(RA.syllables('שלום').length === 1);
});
test('Hebrew syllables ignore punctuation around the word (furtive patah at the end of a sentence)', function () {
  ok(RA.syllables('יָרֵחַ.').join('|') === 'יָ|רֵחַ.', JSON.stringify(RA.syllables('יָרֵחַ.')));
  ok(RA.syllables('תַּפּוּחַ,').join('|') === 'תַּ|פּוּחַ,', JSON.stringify(RA.syllables('תַּפּוּחַ,')));
  ok(RA.syllables('"שָׁלוֹם!"').join('|') === '"שָׁ|לוֹם!"', JSON.stringify(RA.syllables('"שָׁלוֹם!"')));
});
test('English consonant + le keeps its own syllable; silent e does not', function () {
  ok(RA.syllables('apple').join('|') === 'ap|ple', JSON.stringify(RA.syllables('apple')));
  ok(RA.syllables('little').join('|') === 'lit|tle', JSON.stringify(RA.syllables('little')));
  ok(RA.syllables('table').join('|') === 'ta|ble', JSON.stringify(RA.syllables('table')));
  ok(RA.syllables('cake').length === 1 && RA.syllables('while').length === 1);
});
test('syllable / word-edge accent reads at 4.5:1 on every theme and differs from the text', function () {
  DA.settings.THEMES.forEach(function (t) {
    var c = DA.settings.accentFor(t.id);
    ok(c !== t.fg && DA.settings.contrast(c, t.bg) >= 4.5, t.id + ' ' + c + ' ' + DA.settings.contrast(c, t.bg).toFixed(2));
  });
});
test('English splits into syllables and keeps punctuation', function () {
  var s = RA.syllables('elephant.');
  ok(s.join('') === 'elephant.' && s.length >= 2, JSON.stringify(s));
  ok(RA.syllables('cat').length === 1);
});
test('picture dictionary finds words with Hebrew prefixes, nikud and plurals', function () {
  ok(RA.lookup('הכלב') === '🐕');
  ok(RA.lookup('וְהַכֶּלֶב') === '🐕', 'nikud and two prefixes');
  ok(RA.lookup('dogs.') === '🐕');
  ok(RA.lookup('xyzzy') === null);
  ok(RA.lookup('כַּלְבִּי') === '🐕', 'possessive ending');
});
test('gaze steadiness finds the calmer head turn', function () {
  var hist = [], i;
  for (i = 0; i < 200; i++) hist.push({ yaw: 0, h: 0.5 + (i % 2 ? 0.04 : -0.04) });      // jittery straight ahead
  for (i = 0; i < 200; i++) hist.push({ yaw: 20, h: 0.5 + (i % 2 ? 0.01 : -0.01) });     // calmer at 20°
  var r = DA.eyeMath.steadiest(hist);
  ok(r && r.yaw === 20 && r.gainPct > 50, JSON.stringify(r));
});

console.log('\n' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
