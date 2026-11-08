/*
 * DA — Reader profiles. One device serves several readers: each has a name, an emoji avatar and a
 * personal code, their own calibrations, learned settings, a "best" state (⭐) and pinned states.
 * Stored locally and mirrored to the cloud (collections "profiles" and "sessions").
 */
(function (root) {
  'use strict';
  var DA = (root.DA = root.DA || {});
  var P = 'da.v1.';
  var AVATARS = ['🦊', '🐼', '🦁', '🐸', '🐙', '🦄', '🐢', '🐝', '🦉', '🐬', '🐯', '🐨', '🚀', '⚽', '🌈', '⭐'];

  function ProfileStore(store) {
    this.s = store; // DA.storage.Store (shares its backend)
    this.listeners = [];
  }

  ProfileStore.prototype._idx = function () { return this.s._read(P + 'profiles.index', []); };
  ProfileStore.prototype._setIdx = function (ids) { this.s._write(P + 'profiles.index', ids); };

  ProfileStore.prototype.list = function () {
    var self = this;
    return this._idx().map(function (id) { return self.get(id); }).filter(Boolean)
      .sort(function (a, b) { return a.name.localeCompare(b.name, 'he'); });
  };
  ProfileStore.prototype.get = function (id) { return id ? this.s._read(P + 'profile.' + id, null) : null; };

  ProfileStore.prototype.create = function (name, emoji) {
    var used = {}; this.list().forEach(function (p) { used[p.code] = true; });
    var code;
    do { code = String(1000 + Math.floor(Math.random() * 9000)); } while (used[code]);
    var p = {
      schema: 'da.profile/1',
      id: 'P' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      name: name, emoji: emoji || AVATARS[0], code: code,
      createdAt: new Date().toISOString(),
      settings: DA.settings.normalize({}),
      best: null,
      pinned: [],
      notes: ''
    };
    return this.save(p);
  };

  /** Save locally and mirror to the cloud. `fromCloud` skips the upload (it came from there). */
  ProfileStore.prototype.save = function (p, fromCloud) {
    if (!fromCloud) p.updatedAt = new Date().toISOString();
    this.s._write(P + 'profile.' + p.id, p);
    var idx = this._idx();
    if (idx.indexOf(p.id) < 0) { idx.push(p.id); this._setIdx(idx); }
    if (!fromCloud) DA.cloud.save('profiles', p.id, p);
    this._emit();
    return p;
  };

  ProfileStore.prototype.remove = function (id, fromCloud) {
    this.s.b.removeItem(P + 'profile.' + id);
    this._setIdx(this._idx().filter(function (x) { return x !== id; }));
    if (!fromCloud) DA.cloud.remove('profiles', id);
    this._emit();
  };

  ProfileStore.prototype.findByCode = function (code) {
    code = String(code || '').trim();
    return this.list().filter(function (p) { return p.code === code; })[0] || null;
  };

  // ---- current reader on this device ----
  ProfileStore.prototype.currentId = function () { return this.s.getPref('currentProfile', null); };
  ProfileStore.prototype.setCurrent = function (id) { this.s.setPref('currentProfile', id); };

  // ---- pinned states ----
  ProfileStore.prototype.pin = function (p, name, settings) {
    p.pinned = p.pinned || [];
    p.pinned.push({ id: 'S' + Date.now().toString(36), name: name, settings: DA.settings.normalize(settings), at: new Date().toISOString() });
    return this.save(p);
  };
  ProfileStore.prototype.setBest = function (p, settings) {
    p.best = { settings: DA.settings.normalize(settings), at: new Date().toISOString() };
    return this.save(p);
  };

  // ---- learning sessions ----
  ProfileStore.prototype.saveSession = function (sess, fromCloud) {
    this.s._write(P + 'session.' + sess.id, sess);
    var idx = this.s._read(P + 'sessions.index', []);
    if (idx.indexOf(sess.id) < 0) { idx.push(sess.id); this.s._write(P + 'sessions.index', idx); }
    if (!fromCloud) DA.cloud.save('sessions', sess.id, sess);
    return sess;
  };
  ProfileStore.prototype.sessionsFor = function (pid) {
    var self = this;
    return this.s._read(P + 'sessions.index', []).map(function (id) { return self.s._read(P + 'session.' + id, null); })
      .filter(function (x) { return x && x.profileId === pid; })
      .sort(function (a, b) { return a.startedAt < b.startedAt ? 1 : -1; });
  };

  ProfileStore.prototype.onChange = function (fn) { this.listeners.push(fn); };
  ProfileStore.prototype._emit = function () { this.listeners.forEach(function (fn) { try { fn(); } catch (e) { console.error(e); } }); };

  /** Start mirroring profiles and sessions from the cloud; uploads local-only ones once connected. */
  ProfileStore.prototype.sync = function () {
    var self = this;
    DA.cloud.mirror('profiles', {
      upsert: function (p) {
        var local = self.get(p.id);
        if (!local || (p.updatedAt || '') >= (local.updatedAt || '')) self.save(p, true);
      },
      remove: function (id) { self.remove(id, true); },
      ready: function (ids) {
        self.list().forEach(function (p) { if (ids.indexOf(p.id) < 0) DA.cloud.save('profiles', p.id, p); });
      }
    });
    DA.cloud.mirror('sessions', {
      upsert: function (s) { self.saveSession(s, true); },
      ready: function (ids) {
        self.s._read(P + 'sessions.index', []).forEach(function (id) {
          if (ids.indexOf(id) < 0) { var s = self.s._read(P + 'session.' + id, null); if (s) DA.cloud.save('sessions', id, s); }
        });
      },
      changed: function () { self._emit(); }
    });
  };

  DA.ProfileStore = ProfileStore;
  DA.AVATARS = AVATARS;
})(typeof window !== 'undefined' ? window : globalThis);
