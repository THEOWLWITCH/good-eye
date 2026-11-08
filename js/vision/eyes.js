/*
 * עין טובה — Eye tracking with an ordinary camera (standalone / Netlify version).
 *
 * Uses Google MediaPipe Face Landmarker (478 points incl. irises + blendshapes), running entirely
 * on the device. No image is stored or sent anywhere — only numbers leave this module.
 *
 * What it measures (reliable with a webcam or phone camera):
 *  - viewing distance, from the iris diameter (≈11.7 mm in almost everyone);
 *  - leaning in (distance drops well below the reader's usual distance → print may be too small);
 *  - whether the gaze stays at the centre (fixation check for calibration and the warp test);
 *  - blinks and squinting (fatigue / effort).
 * Gaze-contingent warping needs a dedicated eye tracker and is NOT attempted here.
 */
(function (root) {
  'use strict';
  var DA = (root.DA = root.DA || {});

  var MP_VER = '0.10.14';
  var MP_BASE = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@' + MP_VER;
  var MODEL = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';
  var IRIS_MM = 11.7;
  var DEFAULT_HFOV = 62; // degrees; typical laptop/phone front camera

  // ---------- pure geometry (unit-tested) ----------
  // Landmark indices (MediaPipe face mesh with refined irises)
  var L = {
    rIris: [468, 469, 470, 471, 472], lIris: [473, 474, 475, 476, 477],
    rOuter: 33, rInner: 133, rTop: 159, rBottom: 145,
    lInner: 362, lOuter: 263, lTop: 386, lBottom: 374
  };

  function px(p, w, h) { return [p.x * w, p.y * h]; }
  function dist(a, b) { return Math.hypot(a[0] - b[0], a[1] - b[1]); }

  /** Mean iris diameter in pixels (horizontal points of both irises). */
  function irisDiameterPx(lm, w, h) {
    var r = dist(px(lm[469], w, h), px(lm[471], w, h));
    var l = dist(px(lm[474], w, h), px(lm[476], w, h));
    var rv = dist(px(lm[470], w, h), px(lm[472], w, h));
    var lv = dist(px(lm[475], w, h), px(lm[477], w, h));
    return (r + l + rv + lv) / 4;
  }

  function focalFromFov(videoW, hfovDeg) { return (videoW / 2) / Math.tan((hfovDeg || DEFAULT_HFOV) * Math.PI / 360); }

  /** Distance camera→eyes in cm from iris size and focal length (pixels). */
  function distanceCm(irisPx, focalPx) { return irisPx > 0 ? (focalPx * IRIS_MM / irisPx) / 10 : null; }

  /** Focal length (px) from a known distance — the "sit at 40 cm" calibration. */
  function focalFromKnown(irisPx, knownCm) { return irisPx * knownCm * 10 / IRIS_MM; }

  /**
   * Where the irises sit inside the eye openings: h 0..1 (outer→inner corner, mirrored so that
   * both eyes agree) and v 0..1 (top→bottom lid). Combined with head pose this gives a coarse gaze.
   */
  function gazeRatios(lm, w, h) {
    function one(irisIdx, outer, inner, top, bottom) {
      var c = px(lm[irisIdx], w, h), o = px(lm[outer], w, h), i = px(lm[inner], w, h);
      var t = px(lm[top], w, h), b = px(lm[bottom], w, h);
      var ex = i[0] - o[0], ey = i[1] - o[1], len2 = ex * ex + ey * ey || 1;
      var hr = ((c[0] - o[0]) * ex + (c[1] - o[1]) * ey) / len2;
      var vspan = b[1] - t[1] || 1;
      return { h: hr, v: (c[1] - t[1]) / vspan, open: Math.abs(vspan) / Math.sqrt(len2) };
    }
    var r = one(468, L.rOuter, L.rInner, L.rTop, L.rBottom);
    var l = one(473, L.lOuter, L.lInner, L.lTop, L.lBottom);
    // right eye: outer→inner runs left→right in the image; left eye the opposite. Use x-direction consistent gaze:
    return { h: (r.h + (1 - l.h)) / 2, v: (r.v + l.v) / 2, open: (r.open + l.open) / 2 };
  }

  /** Head yaw/pitch (degrees) from the facial transformation matrix (column-major 4×4). */
  function headAngles(m) {
    if (!m || m.length < 16) return null;
    // rotation part, column-major: r00=m[0], r10=m[1], r20=m[2], r01=m[4], r11=m[5], r21=m[6], r02=m[8], r12=m[9], r22=m[10]
    var yaw = Math.atan2(-m[2], Math.sqrt(m[6] * m[6] + m[10] * m[10]));
    var pitch = Math.atan2(m[6], m[10]);
    var roll = Math.atan2(m[1], m[0]);
    var d = 180 / Math.PI;
    return { yaw: yaw * d, pitch: pitch * d, roll: roll * d };
  }

  /**
   * For each 10° band of head turn, how much the eyes jitter (mean frame-to-frame gaze change).
   * Returns the steadiest band when it is clearly steadier than looking straight ahead.
   */
  function steadiest(hist) {
    var bins = {};
    for (var i = 1; i < hist.length; i++) {
      var b = Math.round(hist[i].yaw / 10) * 10;
      if (Math.round(hist[i - 1].yaw / 10) * 10 !== b) continue;
      (bins[b] = bins[b] || []).push(Math.abs(hist[i].h - hist[i - 1].h));
    }
    var stats = Object.keys(bins).filter(function (k) { return bins[k].length >= 40; }).map(function (k) {
      return { yaw: +k, jitter: bins[k].reduce(function (s, v) { return s + v; }, 0) / bins[k].length };
    });
    if (stats.length < 2) return null;
    stats.sort(function (a, b) { return a.jitter - b.jitter; });
    var centre = stats.filter(function (x) { return x.yaw === 0; })[0];
    var best = stats[0];
    if (!centre || best.yaw === 0 || best.jitter > centre.jitter * 0.75) return null;
    return { yaw: best.yaw, gainPct: Math.round((1 - best.jitter / centre.jitter) * 100) };
  }

  function median(a) { if (!a.length) return null; var s = a.slice().sort(function (x, y) { return x - y; }); return s[Math.floor(s.length / 2)]; }

  // ---------- live tracker ----------
  function Eyes() {
    this.listeners = [];
    this.state = { running: false, face: false, distanceCm: null, gaze: null, head: null, blinkPerMin: null, squint: 0, centered: null, leaning: false };
    this._dist = []; this._blinks = []; this._blinkOpen = true;
    this._baseline = null;     // gaze/head while looking at the centre
    this._usualDist = null;    // reader's usual distance (set by the app)
    this._leanSince = 0;
  }

  Eyes.prototype.supported = function () {
    return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia) && !(root.claude && root.claude.use);
  };

  Eyes.prototype.on = function (fn) { this.listeners.push(fn); };
  Eyes.prototype._emit = function () { var s = this.state; this.listeners.forEach(function (f) { try { f(s); } catch (e) { console.error(e); } }); };

  Eyes.prototype.start = function () {
    var self = this;
    if (this.state.running) return Promise.resolve(true);
    if (this._starting) return this._starting;
    this._starting = Promise.all([
      navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false }),
      import(MP_BASE + '/vision_bundle.mjs')
    ]).then(function (r) {
      self.stream = r[0];
      var vision = r[1];
      var v = self.video = document.createElement('video');
      v.autoplay = true; v.playsInline = true; v.muted = true;
      v.srcObject = self.stream;
      return v.play().then(function () {
        return vision.FilesetResolver.forVisionTasks(MP_BASE + '/wasm');
      }).then(function (fileset) {
        return vision.FaceLandmarker.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: MODEL, delegate: 'GPU' },
          runningMode: 'VIDEO', numFaces: 1,
          outputFaceBlendshapes: true, outputFacialTransformationMatrixes: true
        });
      });
    }).then(function (fl) {
      self.fl = fl;
      self.state.running = true;
      self._loop();
      self._emit();
      return true;
    }).catch(function (e) {
      self.stop();
      self.error = e;
      throw e;
    }).finally(function () { self._starting = null; });
    return this._starting;
  };

  Eyes.prototype.stop = function () {
    this.state.running = false;
    if (this.stream) this.stream.getTracks().forEach(function (t) { t.stop(); });
    this.stream = null;
    if (this.fl && this.fl.close) { try { this.fl.close(); } catch (e) { /* ignore */ } }
    this.fl = null;
    cancelAnimationFrame(this._raf);
    this._emit();
  };

  Eyes.prototype.focal = function () {
    var key = 'da.v1.eyes.focal';
    var saved = null;
    try { saved = JSON.parse(localStorage.getItem(key) || 'null'); } catch (e) { /* ignore */ }
    var w = this.video ? this.video.videoWidth : 1280;
    if (saved && saved.w === w) return saved.f;
    return focalFromFov(w, DEFAULT_HFOV);
  };
  /** "Sit exactly 40 cm from the screen" — improves the distance estimate on this device. */
  Eyes.prototype.calibrateDistance = function (knownCm) {
    if (!this._lastIrisPx || !this.video) return false;
    var f = focalFromKnown(median(this._irisHist || [this._lastIrisPx]), knownCm);
    try { localStorage.setItem('da.v1.eyes.focal', JSON.stringify({ w: this.video.videoWidth, f: f })); } catch (e) { /* ignore */ }
    this._dist = [];
    return true;
  };

  /** Record "now looking at the centre" as the reference for the fixation check. */
  Eyes.prototype.setCenterBaseline = function () {
    var g = this._gazeHist || [];
    if (!g.length) return false;
    this._baseline = {
      h: median(g.map(function (x) { return x.h; })), v: median(g.map(function (x) { return x.v; })),
      yaw: median(g.map(function (x) { return x.yaw; })), pitch: median(g.map(function (x) { return x.pitch; }))
    };
    return true;
  };
  Eyes.prototype.setUsualDistance = function (cm) { this._usualDist = cm || null; this._auto = []; };

  Eyes.prototype._loop = function () {
    var self = this, last = 0;
    function frame(t) {
      if (!self.state.running) return;
      self._raf = requestAnimationFrame(frame);
      if (t - last < 66) return; // ~15 fps is plenty
      last = t;
      var v = self.video;
      if (!v || v.readyState < 2) return;
      var res;
      try { res = self.fl.detectForVideo(v, performance.now()); } catch (e) { return; }
      self._process(res, v.videoWidth, v.videoHeight, t);
    }
    this._raf = requestAnimationFrame(frame);
  };

  Eyes.prototype._process = function (res, w, h, t) {
    var s = this.state;
    var lm = res && res.faceLandmarks && res.faceLandmarks[0];
    s.face = !!(lm && lm.length >= 478);
    if (!s.face) { s.centered = null; this._emit(); return; }

    var irisPx = irisDiameterPx(lm, w, h);
    this._lastIrisPx = irisPx;
    (this._irisHist = this._irisHist || []).push(irisPx); if (this._irisHist.length > 20) this._irisHist.shift();
    var d = distanceCm(irisPx, this.focal());
    this._dist.push(d); if (this._dist.length > 9) this._dist.shift();
    s.distanceCm = Math.round(median(this._dist));

    var g = gazeRatios(lm, w, h);
    var m = res.facialTransformationMatrixes && res.facialTransformationMatrixes[0];
    var head = headAngles(m && m.data);
    s.gaze = g; s.head = head;
    (this._gazeHist = this._gazeHist || []).push({ h: g.h, v: g.v, yaw: head ? head.yaw : 0, pitch: head ? head.pitch : 0 });
    if (this._gazeHist.length > 20) this._gazeHist.shift();

    // fixation check against the centre baseline
    if (this._baseline) {
      var b = this._baseline;
      var eyeDev = Math.abs(g.h - b.h) * 1.0 + Math.abs(g.v - b.v) * 0.6;
      var headDev = head ? (Math.abs(head.yaw - b.yaw) + Math.abs(head.pitch - b.pitch)) / 40 : 0;
      s.gazeDeviation = Math.round((eyeDev + headDev) * 100) / 100;
      s.centered = s.gazeDeviation < 0.12;
    }

    // gaze steadiness by head turn (for shaking eyes / nystagmus: some head positions calm the eyes)
    if (head) {
      var hist = this._steady = this._steady || [];
      hist.push({ yaw: head.yaw, h: g.h });
      if (hist.length > 600) hist.shift();
      if (hist.length % 30 === 0) s.steadiest = steadiest(hist);
    }

    // blinks & squint from blendshapes
    var bs = {};
    ((res.faceBlendshapes && res.faceBlendshapes[0] && res.faceBlendshapes[0].categories) || []).forEach(function (c) { bs[c.categoryName] = c.score; });
    var blink = ((bs.eyeBlinkLeft || 0) + (bs.eyeBlinkRight || 0)) / 2;
    if (blink > 0.55 && this._blinkOpen) { this._blinks.push(t); this._blinkOpen = false; }
    if (blink < 0.3) this._blinkOpen = true;
    var cutoff = t - 60000;
    while (this._blinks.length && this._blinks[0] < cutoff) this._blinks.shift();
    this._startT = this._startT || t;
    var span = Math.min(60000, t - this._startT);
    s.blinkPerMin = span > 15000 ? Math.round(this._blinks.length * 60000 / span) : null;
    s.squint = Math.round((((bs.eyeSquintLeft || 0) + (bs.eyeSquintRight || 0)) / 2) * 100) / 100;

    // the reader's usual distance: set by the app, or learned from the first ~10 s with a face
    if (!this._usualDist && s.distanceCm) {
      (this._auto = this._auto || []).push(s.distanceCm);
      if (this._auto.length >= 150) { this._usualDist = median(this._auto); this._auto = []; }
    }
    // leaning in: ≥20% closer than usual for 3 seconds
    if (this._usualDist && s.distanceCm) {
      if (s.distanceCm < this._usualDist * 0.8) { this._leanSince = this._leanSince || t; }
      else this._leanSince = 0;
      s.leaning = !!this._leanSince && t - this._leanSince > 3000;
    } else s.leaning = false;

    this._emit();
  };

  /** Snapshot for logging with a trial (numbers only). */
  Eyes.prototype.snapshot = function () {
    var s = this.state;
    if (!s.running || !s.face) return null;
    return { distanceCm: s.distanceCm, centered: s.centered, gazeDeviation: s.gazeDeviation, blinkPerMin: s.blinkPerMin, squint: s.squint };
  };

  DA.eyes = new Eyes();
  DA.eyeMath = { steadiest: steadiest, irisDiameterPx: irisDiameterPx, distanceCm: distanceCm, focalFromKnown: focalFromKnown, focalFromFov: focalFromFov, gazeRatios: gazeRatios, headAngles: headAngles, IRIS_MM: IRIS_MM };
})(typeof window !== 'undefined' ? window : globalThis);
