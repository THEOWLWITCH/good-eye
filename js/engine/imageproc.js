/*
 * עין טובה — Image-processing engine (spec §6, §9): point-spread functions (PSF) and the
 * sharpening / deblurring methods that use them.
 *
 *   psfKernel(p)        — a normalized blur kernel from a personal PSF description:
 *                         gaussian core + elliptical stretch + directional smear + one-sided tail + ring halo.
 *   unsharp(...)        — Unsharp Mask.
 *   directional(...)    — sharpening only across the smear direction.
 *   localContrast(...)  — large-radius unsharp (local contrast enhancement) with noise limit.
 *   wiener(...)         — Wiener deconvolution in the frequency domain (regularized).
 *   richardsonLucy(...) — iterative Richardson–Lucy deconvolution.
 * All work on a Float32Array luminance plane (0..1). Helpers convert to/from RGBA ImageData,
 * processing luminance only and keeping colour.
 */
(function (root) {
  'use strict';
  var DA = (root.DA = root.DA || {});

  // ---------------- PSF ----------------
  /**
   * p: { radius (px σ of the core), stretch (≥1, ellipse ratio), angle (deg), smear (px length of
   *      directional smear), tail (0..1 one-sided tail strength), tailLen (px), halo (0..1 ring
   *      weight), haloR (px ring radius) }
   */
  function psfKernel(p) {
    p = Object.assign({ radius: 1.5, stretch: 1, angle: 0, smear: 0, tail: 0, tailLen: 8, halo: 0, haloR: 8 }, p || {});
    var ext = Math.ceil(Math.max(3 * p.radius * Math.max(1, p.stretch), p.smear / 2 + 2 * p.radius, p.tail > 0 ? p.tailLen + 2 * p.radius : 0, p.halo > 0 ? p.haloR + 3 * p.radius : 0, 1));
    ext = Math.min(ext, 40);
    var size = 2 * ext + 1, k = new Float32Array(size * size);
    var a = p.angle * Math.PI / 180, ca = Math.cos(a), sa = Math.sin(a);
    var sx = Math.max(0.3, p.radius * Math.max(1, p.stretch)), sy = Math.max(0.3, p.radius);
    for (var y = -ext; y <= ext; y++) {
      for (var x = -ext; x <= ext; x++) {
        var u = x * ca + y * sa, v = -x * sa + y * ca;       // along / across the angle
        var core = 0;
        if (p.smear > 0) {                                     // line smear convolved with the core
          var half = p.smear / 2, du = Math.max(0, Math.abs(u) - half);
          core = Math.exp(-(du * du) / (2 * sx * sx) - (v * v) / (2 * sy * sy));
        } else {
          core = Math.exp(-(u * u) / (2 * sx * sx) - (v * v) / (2 * sy * sy));
        }
        var tail = 0;
        if (p.tail > 0 && u > 0 && u < p.tailLen + 3 * sy) tail = p.tail * Math.exp(-u / Math.max(1, p.tailLen / 2)) * Math.exp(-(v * v) / (2 * sy * sy)) * 0.6;
        var halo = 0;
        if (p.halo > 0) { var rr = Math.hypot(x, y) - p.haloR; halo = p.halo * 0.15 * Math.exp(-(rr * rr) / (2 * Math.max(1, p.radius) * Math.max(1, p.radius))); }
        k[(y + ext) * size + (x + ext)] = core + tail + halo;
      }
    }
    var s = 0;
    for (var i = 0; i < k.length; i++) s += k[i];
    for (i = 0; i < k.length; i++) k[i] /= s;
    return { data: k, size: size, ext: ext };
  }

  // ---------------- planes ----------------
  function toLuma(img) {
    var n = img.width * img.height, Y = new Float32Array(n), d = img.data;
    for (var i = 0; i < n; i++) Y[i] = (0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2]) / 255;
    return Y;
  }
  /** Write a processed luminance back, keeping each pixel's colour (adds the luminance change). */
  function fromLuma(img, Y0, Y1) {
    var out = new ImageData(img.width, img.height), d = img.data, o = out.data;
    for (var i = 0; i < Y0.length; i++) {
      var dl = (Y1[i] - Y0[i]) * 255;
      o[i * 4] = clamp255(d[i * 4] + dl); o[i * 4 + 1] = clamp255(d[i * 4 + 1] + dl); o[i * 4 + 2] = clamp255(d[i * 4 + 2] + dl); o[i * 4 + 3] = d[i * 4 + 3];
    }
    return out;
  }
  function clamp255(v) { return v < 0 ? 0 : v > 255 ? 255 : v; }
  function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }

  // ---------------- spatial filters ----------------
  function convolve(Y, w, h, k) {
    var out = new Float32Array(w * h), e = k.ext, s = k.size, kd = k.data;
    for (var y = 0; y < h; y++) {
      for (var x = 0; x < w; x++) {
        var acc = 0;
        for (var j = -e; j <= e; j++) {
          var yy = y + j; yy = yy < 0 ? 0 : yy >= h ? h - 1 : yy;
          var row = yy * w, krow = (j + e) * s;
          for (var i = -e; i <= e; i++) {
            var xx = x + i; xx = xx < 0 ? 0 : xx >= w ? w - 1 : xx;
            acc += Y[row + xx] * kd[krow + i + e];
          }
        }
        out[y * w + x] = acc;
      }
    }
    return out;
  }
  function gaussKernel(sigma) { return psfKernel({ radius: sigma }); }

  /** Unsharp Mask: Y + amount·(Y − blur(Y)). */
  function unsharp(Y, w, h, o) {
    o = Object.assign({ radius: 1.5, amount: 1 }, o);
    var b = convolve(Y, w, h, gaussKernel(o.radius)), out = new Float32Array(Y.length);
    for (var i = 0; i < Y.length; i++) out[i] = clamp01(Y[i] + o.amount * (Y[i] - b[i]));
    return out;
  }
  /** Directional sharpening: only across the smear direction (the blur's angle). */
  function directional(Y, w, h, o) {
    o = Object.assign({ radius: 2, amount: 1, angle: 0 }, o);
    // blur only along the direction perpendicular to the smear, so edges crossing the smear get sharpened
    var b = convolve(Y, w, h, psfKernel({ radius: 0.4, smear: o.radius * 3, angle: o.angle + 90 }));
    var out = new Float32Array(Y.length);
    for (var i = 0; i < Y.length; i++) out[i] = clamp01(Y[i] + o.amount * (Y[i] - b[i]));
    return out;
  }
  /** Local contrast enhancement: large-radius unsharp, with the boost limited where the image is flat (noise). */
  function localContrast(Y, w, h, o) {
    o = Object.assign({ radius: 12, amount: 0.6, noiseLimit: 0.02 }, o);
    var b = convolve(Y, w, h, gaussKernel(o.radius)), out = new Float32Array(Y.length);
    for (var i = 0; i < Y.length; i++) {
      var d = Y[i] - b[i], g = Math.abs(d) < o.noiseLimit ? Math.abs(d) / o.noiseLimit : 1;
      out[i] = clamp01(Y[i] + o.amount * d * g);
    }
    return out;
  }

  // ---------------- FFT (radix-2, in place) ----------------
  function fft1(re, im, inv) {
    var n = re.length, i, j, k, l;
    for (i = 1, j = 0; i < n; i++) {
      var bit = n >> 1;
      for (; j & bit; bit >>= 1) j ^= bit;
      j ^= bit;
      if (i < j) { var t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; }
    }
    for (l = 2; l <= n; l <<= 1) {
      var ang = 2 * Math.PI / l * (inv ? 1 : -1), wr = Math.cos(ang), wi = Math.sin(ang);
      for (i = 0; i < n; i += l) {
        var cr = 1, ci = 0;
        for (k = 0; k < l / 2; k++) {
          var ar = re[i + k + l / 2] * cr - im[i + k + l / 2] * ci, ai = re[i + k + l / 2] * ci + im[i + k + l / 2] * cr;
          re[i + k + l / 2] = re[i + k] - ar; im[i + k + l / 2] = im[i + k] - ai;
          re[i + k] += ar; im[i + k] += ai;
          var nr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = nr;
        }
      }
    }
    if (inv) for (i = 0; i < n; i++) { re[i] /= n; im[i] /= n; }
  }
  function fft2(re, im, N, inv) {
    var r = new Float64Array(N), c = new Float64Array(N), x, y;
    for (y = 0; y < N; y++) {
      for (x = 0; x < N; x++) { r[x] = re[y * N + x]; c[x] = im[y * N + x]; }
      fft1(r, c, inv);
      for (x = 0; x < N; x++) { re[y * N + x] = r[x]; im[y * N + x] = c[x]; }
    }
    for (x = 0; x < N; x++) {
      for (y = 0; y < N; y++) { r[y] = re[y * N + x]; c[y] = im[y * N + x]; }
      fft1(r, c, inv);
      for (y = 0; y < N; y++) { re[y * N + x] = r[y]; im[y * N + x] = c[y]; }
    }
  }
  function pow2(n) { var p = 1; while (p < n) p <<= 1; return p; }

  /** Pad an image plane into N×N (edge-extended) and the kernel centred at the origin (wrapped). */
  function padded(Y, w, h, N) {
    // mirror the image into the padding: the right part mirrors the right edge, the far part mirrors
    // the left edge (so the periodic wrap of the FFT is continuous at both image borders)
    var re = new Float64Array(N * N);
    function idx(v, len) {
      if (v < len) return v;
      var pad = N - len, d = v - len;
      return d < pad / 2 ? Math.max(0, len - 1 - d) : Math.min(len - 1, N - v - 1);
    }
    for (var y = 0; y < N; y++) { var yy = idx(y, h); for (var x = 0; x < N; x++) re[y * N + x] = Y[yy * w + idx(x, w)]; }
    return re;
  }
  function kernelFFT(k, N) {
    var re = new Float64Array(N * N), im = new Float64Array(N * N), e = k.ext;
    for (var j = -e; j <= e; j++) for (var i = -e; i <= e; i++) re[((j + N) % N) * N + ((i + N) % N)] = k.data[(j + e) * k.size + (i + e)];
    fft2(re, im, N, false);
    return { re: re, im: im };
  }

  /** Wiener deconvolution: X = conj(H)·Y / (|H|² + K). K = noise-to-signal (regularization). */
  function wiener(Y, w, h, k, o) {
    o = Object.assign({ K: 0.01 }, o);
    var N = pow2(Math.max(w, h) + 6 * k.ext), H = kernelFFT(k, N);
    var re = padded(Y, w, h, N), im = new Float64Array(N * N);
    fft2(re, im, N, false);
    for (var i = 0; i < N * N; i++) {
      var hr = H.re[i], hi = H.im[i], den = hr * hr + hi * hi + o.K;
      var xr = (re[i] * hr + im[i] * hi) / den, xi = (im[i] * hr - re[i] * hi) / den;
      re[i] = xr; im[i] = xi;
    }
    fft2(re, im, N, true);
    var out = new Float32Array(w * h);
    for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) out[y * w + x] = clamp01(re[y * N + x]);
    return out;
  }

  /** Convolution through the FFT (used by Richardson–Lucy). conj → correlation (flipped kernel). */
  function convFFT(P, N, H, conj) {
    var re = Float64Array.from(P), im = new Float64Array(N * N);
    fft2(re, im, N, false);
    for (var i = 0; i < N * N; i++) {
      var hr = H.re[i], hi = conj ? -H.im[i] : H.im[i];
      var r = re[i] * hr - im[i] * hi, m = re[i] * hi + im[i] * hr;
      re[i] = r; im[i] = m;
    }
    fft2(re, im, N, true);
    return re;
  }

  /** Richardson–Lucy: x ← x · (Hᵀ ∗ (y / (H ∗ x))). Iterations limited; small damping avoids blow-up. */
  function richardsonLucy(Y, w, h, k, o) {
    o = Object.assign({ iterations: 10 }, o);
    var N = pow2(Math.max(w, h) + 6 * k.ext), H = kernelFFT(k, N);
    var y0 = padded(Y, w, h, N), x = Float64Array.from(y0), eps = 1e-4;
    for (var it = 0; it < o.iterations; it++) {
      var est = convFFT(x, N, H, false), ratio = new Float64Array(N * N);
      for (var i = 0; i < N * N; i++) ratio[i] = (y0[i] + eps) / (est[i] + eps);
      var corr = convFFT(ratio, N, H, true);
      for (i = 0; i < N * N; i++) x[i] = Math.min(1.5, Math.max(0, x[i] * corr[i]));
    }
    var out = new Float32Array(w * h);
    for (var yy = 0; yy < h; yy++) for (var xx = 0; xx < w; xx++) out[yy * w + xx] = clamp01(x[yy * N + xx]);
    return out;
  }

  /** Simple quality numbers for comparing methods: edge sharpness, overshoot (halos), noise. */
  function measure(Y0, Y1, w, h) {
    var grad = 0, over = 0, noise = 0, n = 0;
    for (var y = 1; y < h - 1; y++) for (var x = 1; x < w - 1; x++) {
      var i = y * w + x;
      grad += Math.abs(Y1[i + 1] - Y1[i - 1]) + Math.abs(Y1[i + w] - Y1[i - w]);
      var lo = Math.min(Y0[i - 1], Y0[i + 1], Y0[i - w], Y0[i + w], Y0[i]), hi = Math.max(Y0[i - 1], Y0[i + 1], Y0[i - w], Y0[i + w], Y0[i]);
      over += Math.max(0, Y1[i] - hi - 0.02) + Math.max(0, lo - Y1[i] - 0.02);
      if (hi - lo < 0.02) noise += Math.abs(Y1[i] - Y0[i]);
      n++;
    }
    return { sharpness: grad / n, halos: over / n, noise: noise / n };
  }

  /** Run a named method on a luminance plane. */
  function run(method, Y, w, h, psf, o) {
    o = o || {};
    switch (method) {
      case 'unsharp': return unsharp(Y, w, h, { radius: o.radius || 1.5, amount: o.amount != null ? o.amount : 1 });
      case 'directional': return directional(Y, w, h, { radius: o.radius || 2, amount: o.amount != null ? o.amount : 1, angle: psf ? psf.angle || 0 : 0 });
      case 'local': return localContrast(Y, w, h, { radius: o.radius || 12, amount: o.amount != null ? o.amount : 0.6 });
      case 'wiener': return wiener(Y, w, h, psfKernel(psf), { K: o.K != null ? o.K : 0.01 });
      case 'rl': return richardsonLucy(Y, w, h, psfKernel(psf), { iterations: o.iterations || 10 });
    }
    return Float32Array.from(Y);
  }

  /** Process a canvas (or ImageData) and return new ImageData. Large images are processed as-is. */
  function processImageData(img, method, psf, o) {
    var Y0 = toLuma(img);
    var Y1 = run(method, Y0, img.width, img.height, psf, o);
    return fromLuma(img, Y0, Y1);
  }

  DA.imageproc = {
    psfKernel: psfKernel, convolve: convolve, unsharp: unsharp, directional: directional, localContrast: localContrast,
    wiener: wiener, richardsonLucy: richardsonLucy, run: run, measure: measure,
    toLuma: toLuma, fromLuma: fromLuma, processImageData: processImageData, fft2: fft2, pow2: pow2,
    METHODS: ['unsharp', 'directional', 'local', 'wiener', 'rl']
  };
})(typeof window !== 'undefined' ? window : globalThis);
