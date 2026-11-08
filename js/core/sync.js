/*
 * עין טובה — Encrypted sync between devices (standalone / Netlify version).
 *
 * One "family sync code" (16 characters) connects all the devices of a family. Everything on the
 * device — readers, settings, games, calibrations — is merged with the other devices through the
 * site's /api/sync endpoint. Data is ENCRYPTED IN THE BROWSER (AES-GCM, key derived from the code
 * with PBKDF2) before it leaves the device; the server stores only ciphertext under a hash of the
 * code, so it can read neither the data nor the code. Whoever has the code can see the data.
 *
 * Merge: newest wins per item (profiles by updatedAt, calibrations by savedAt; game results never
 * change). Deletions travel as "tombstones" so a deleted reader does not come back.
 */
(function (root) {
  'use strict';
  var DA = (root.DA = root.DA || {});
  var CODE_KEY = 'da.v1.sync.code', TOMB_KEY = 'da.v1.sync.tombs', LAST_KEY = 'da.v1.sync.last';
  var ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  var ctx = null, busy = null, timer = null, statusFn = function () {};

  var mem = {};   // fallback when localStorage is blocked or missing
  function lsGet(k, d) {
    try { var v = localStorage.getItem(k); return v == null ? (k in mem ? mem[k] : d) : JSON.parse(v); } catch (e) { return k in mem ? mem[k] : d; }
  }
  function lsSet(k, v) { mem[k] = v; try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* memory only */ } }

  function available() {
    return !(root.claude && root.claude.use) && !!(root.crypto && crypto.subtle) && typeof location !== 'undefined' && /^https?:$/.test(location.protocol);
  }
  function code() { return lsGet(CODE_KEY, null); }

  function newCode() {
    var b = new Uint8Array(16), out = '';
    crypto.getRandomValues(b);
    for (var i = 0; i < 16; i++) { out += ALPHABET[b[i] % ALPHABET.length]; if (i % 4 === 3 && i < 15) out += '-'; }
    return out;
  }
  function normalize(c) { return String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); }

  // ---------- crypto ----------
  var keyCache = {};
  function hex(buf) { return Array.prototype.map.call(new Uint8Array(buf), function (x) { return ('0' + x.toString(16)).slice(-2); }).join(''); }
  function b64(buf) { var s = '', a = new Uint8Array(buf); for (var i = 0; i < a.length; i += 0x8000) s += String.fromCharCode.apply(null, a.subarray(i, i + 0x8000)); return btoa(s); }
  function unb64(str) { var s = atob(str), a = new Uint8Array(s.length); for (var i = 0; i < s.length; i++) a[i] = s.charCodeAt(i); return a; }

  function keys(c) {
    var n = normalize(c);
    if (keyCache[n]) return keyCache[n];
    var enc = new TextEncoder();
    keyCache[n] = Promise.all([
      crypto.subtle.digest('SHA-256', enc.encode('good-eye-id:' + n)),
      crypto.subtle.importKey('raw', enc.encode(n), 'PBKDF2', false, ['deriveKey']).then(function (base) {
        return crypto.subtle.deriveKey({ name: 'PBKDF2', salt: enc.encode('good-eye-sync-v1'), iterations: 200000, hash: 'SHA-256' },
          base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
      })
    ]).then(function (r) { return { id: hex(r[0]), key: r[1] }; });
    return keyCache[n];
  }

  function compress(bytes) {
    if (!root.CompressionStream) return Promise.resolve({ z: false, bytes: bytes });
    var s = new Blob([bytes]).stream().pipeThrough(new CompressionStream('gzip'));
    return new Response(s).arrayBuffer().then(function (b) { return { z: true, bytes: new Uint8Array(b) }; });
  }
  function decompress(bytes, z) {
    if (!z) return Promise.resolve(bytes);
    var s = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
    return new Response(s).arrayBuffer().then(function (b) { return new Uint8Array(b); });
  }

  function encrypt(obj, k) {
    var iv = crypto.getRandomValues(new Uint8Array(12));
    return compress(new TextEncoder().encode(JSON.stringify(obj))).then(function (c) {
      var plain = new Uint8Array(c.bytes.length + 1);
      plain[0] = c.z ? 1 : 0; plain.set(c.bytes, 1);
      return crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv }, k, plain);
    }).then(function (ct) { return { iv: b64(iv), data: b64(ct) }; });
  }
  function decrypt(payload, k) {
    return crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(payload.iv) }, k, unb64(payload.data)).then(function (pt) {
      var a = new Uint8Array(pt);
      return decompress(a.subarray(1), a[0] === 1);
    }).then(function (bytes) { return JSON.parse(new TextDecoder().decode(bytes)); });
  }

  // ---------- local state ----------
  function tomb(kind, id) {
    if (!code()) return;
    var t = lsGet(TOMB_KEY, {});
    t[kind + ':' + id] = new Date().toISOString();
    lsSet(TOMB_KEY, t);
    touch();
  }

  function bundle() {
    var sessions = [];
    ctx.profiles.list().forEach(function (p) { sessions = sessions.concat(ctx.profiles.sessionsFor(p.id)); });
    return {
      v: 1, app: 'good-eye', at: new Date().toISOString(),
      profiles: ctx.profiles.list(),
      sessions: sessions,
      trials: ctx.store.allTrials().map(function (t) { return DA.cloud.slim(t); }),
      tombs: lsGet(TOMB_KEY, {})
    };
  }

  /** Merge a remote bundle into this device. Returns number of items changed here. */
  function merge(remote) {
    var changed = 0;
    var tombs = lsGet(TOMB_KEY, {});
    Object.keys(remote.tombs || {}).forEach(function (k) { if (!tombs[k] || tombs[k] < remote.tombs[k]) tombs[k] = remote.tombs[k]; });
    lsSet(TOMB_KEY, tombs);
    var dead = function (kind, id) { return !!tombs[kind + ':' + id]; };

    (remote.profiles || []).forEach(function (p) {
      if (!p || !p.id || dead('profile', p.id)) return;
      var l = ctx.profiles.get(p.id);
      if (!l || (p.updatedAt || '') > (l.updatedAt || '')) { ctx.profiles.save(p, true); changed++; }
    });
    var have = {};
    ctx.profiles.list().forEach(function (p) { ctx.profiles.sessionsFor(p.id).forEach(function (s) { have[s.id] = true; }); });
    (remote.sessions || []).forEach(function (s) {
      if (!s || !s.id || have[s.id] || dead('session', s.id)) return;
      ctx.profiles.saveSession(s, true); changed++;
    });
    (remote.trials || []).forEach(function (t) {
      if (!t || !t.id || dead('trial', t.id)) return;
      var l = ctx.store.getTrial(t.id);
      if (!l || (t.savedAt || '') > (l.savedAt || '')) { ctx.store.saveTrial(t); changed++; }
    });
    // apply deletions that happened on other devices
    Object.keys(tombs).forEach(function (k) {
      var kind = k.split(':')[0], id = k.slice(kind.length + 1);
      if (kind === 'profile' && ctx.profiles.get(id)) { ctx.profiles.remove(id, true); changed++; }
      if (kind === 'trial' && ctx.store.getTrial(id)) { ctx.store.deleteTrial(id, true); changed++; }
      if (kind === 'session') ctx.profiles.removeSession(id, true);
    });
    return changed;
  }

  // ---------- network ----------
  function api(id, init) {
    return fetch('api/sync?id=' + id, Object.assign({ cache: 'no-store' }, init || {}));
  }

  /** Download, merge, upload. Resolves { ok, changed } or rejects with a message. */
  function syncNow(quiet) {
    if (busy) return busy;
    var c = code();
    if (!c || !available()) return Promise.resolve({ ok: false });
    if (!navigator.onLine) { status(T('אין אינטרנט כרגע. הסנכרון יקרה כשיחזור החיבור.'), true); return Promise.resolve({ ok: false }); }
    if (!quiet) status(T('מסנכרן…'));
    var k, changed = 0;
    busy = keys(c).then(function (kk) {
      k = kk;
      return api(k.id);
    }).then(function (res) {
      var isJson = (res.headers.get('content-type') || '').indexOf('json') >= 0;
      if (!isJson) throw new Error('nosync');
      if (res.status === 404) return null;
      if (!res.ok) throw new Error('http ' + res.status);
      return res.json();
    }).then(function (payload) {
      if (!payload) return null;
      return decrypt(payload, k.key).catch(function () { throw new Error('badkey'); });
    }).then(function (remote) {
      if (remote) changed = merge(remote);
      return encrypt(bundle(), k.key);
    }).then(function (payload) {
      return api(k.id, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
    }).then(function (res) {
      if (!res.ok) throw new Error('http ' + res.status);
      lsSet(LAST_KEY, new Date().toISOString());
      status(T('✓ מסונכרן') + ' · ' + new Date().toLocaleTimeString(DA.i18n.locale, { hour: '2-digit', minute: '2-digit' }));
      if (changed && ctx.refresh) ctx.refresh();
      return { ok: true, changed: changed };
    }).catch(function (e) {
      var m = e && e.message;
      status(m === 'nosync' ? T('הסנכרון זמין רק באתר של עין טובה ב־Netlify.')
        : m === 'badkey' ? T('הקוד לא מתאים לנתונים שבשרת. בדקו את הקוד.')
        : T('הסנכרון לא הצליח כרגע. ננסה שוב אחר כך.'), true);
      return { ok: false, error: m };
    }).then(function (r) { busy = null; return r; });
    return busy;
  }

  function touch() {
    if (!code()) return;
    clearTimeout(timer);
    timer = setTimeout(function () { syncNow(true); }, 12000);
  }

  function status(msg, warn) { statusFn(msg, warn); }

  function enable(c) {
    lsSet(CODE_KEY, c);
    return syncNow();
  }
  function disable() {
    mem = {};
    try { localStorage.removeItem(CODE_KEY); localStorage.removeItem(TOMB_KEY); } catch (e) { /* ignore */ }
    clearTimeout(timer);
  }

  /** Remove this family's encrypted data from the server, then disconnect this device. */
  function deleteRemote() {
    var c = code();
    if (!c) return Promise.resolve({ ok: false });
    return keys(c).then(function (k) { return api(k.id, { method: 'DELETE' }); })
      .then(function (res) { if (!res.ok) throw new Error('http ' + res.status); disable(); return { ok: true }; });
  }

  function init(c, onStatus) {
    ctx = c;
    statusFn = onStatus || statusFn;
    if (!available()) return;
    root.addEventListener('online', function () { syncNow(true); });
    document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'hidden' && timer) { clearTimeout(timer); syncNow(true); } });
    if (code()) setTimeout(function () { syncNow(true); }, 1500);
  }

  DA.sync = {
    init: init, available: available, code: code, newCode: newCode, normalize: normalize,
    enable: enable, disable: disable, deleteRemote: deleteRemote, syncNow: syncNow, touch: touch, tomb: tomb,
    lastSync: function () { return lsGet(LAST_KEY, null); },
    // exposed for tests
    _keys: keys, _encrypt: encrypt, _decrypt: decrypt, _merge: merge
  };
})(typeof window !== 'undefined' ? window : globalThis);
