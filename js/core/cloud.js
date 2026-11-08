/*
 * DA — Cloud sync for the published (claude.ai) version.
 * When the page runs as a claude.ai artifact with the `db` capability, profiles, calibration trials
 * and learning sessions are mirrored to the artifact's shared store, so they follow the reader to
 * any device and reach the owner. Locally (file:// or localhost) this module stays idle.
 * Local storage is always the working copy; the cloud is mirrored into it.
 */
(function (root) {
  'use strict';
  var DA = (root.DA = root.DA || {});
  var MAX_DOC = 240 * 1024; // store limit is 256 KiB per document

  var db = null, connecting = null, readOnly = false;
  var statusFn = function () {};

  /** Shrink a document so it fits (trials carry optional bulky fields). */
  function slim(doc) {
    var t = JSON.parse(JSON.stringify(doc));
    delete t.history;   // undo stack; ops + actions restore the result exactly
    delete t.original;  // reconstructible from stimulus settings
    if (JSON.stringify(t).length > MAX_DOC) delete t.eventLog;
    if (JSON.stringify(t).length > MAX_DOC) delete t.corrected;
    if (JSON.stringify(t).length > MAX_DOC && t.model) delete t.model.sampledField;
    if (JSON.stringify(t).length > MAX_DOC && t.log) t.log = t.log.slice(-200);
    return t;
  }

  function available() { return !!(root.claude && typeof root.claude.use === 'function'); }

  function connect() {
    if (connecting) return connecting;
    if (!available()) return (connecting = Promise.resolve(false));
    connecting = root.claude.use('db').then(function (d) { db = d || null; return !!db; }).catch(function () { return false; });
    return connecting;
  }

  /**
   * Mirror a collection into local handlers.
   * handlers: { upsert(doc), remove(id), ready(remoteIds) }
   */
  function mirror(collection, handlers) {
    return connect().then(function (ok) {
      if (!ok) return false;
      var first = true;
      var timer = setTimeout(function () { statusFn('השרת עדיין לא זמין — הנתונים נשמרים בינתיים במכשיר הזה.', true); }, 10000);
      db.collection(collection).onSnapshot(function (snap) {
        snap.docChanges().forEach(function (ch) {
          if (ch.type === 'removed') handlers.remove && handlers.remove(ch.doc.id);
          else handlers.upsert && handlers.upsert(JSON.parse(JSON.stringify(ch.doc.data())));
        });
        if (!snap.metadata.fromCache && first) {
          first = false;
          clearTimeout(timer);
          handlers.ready && handlers.ready(snap.docs.map(function (d) { return d.id; }));
          statusFn('מחובר — הנתונים נשמרים בענן.');
        }
        handlers.changed && handlers.changed();
      }, function (err) {
        clearTimeout(timer);
        statusFn('אין חיבור לענן (' + err.code + '). הנתונים נשמרים במכשיר בלבד.', true);
      });
      return true;
    });
  }

  // one write at a time per document
  var chains = {};
  function save(collection, id, data) {
    if (!db || readOnly) return Promise.resolve(false);
    var key = collection + '/' + id;
    var run = function () {
      return db.collection(collection).doc(id).set(slim(data)).then(function () { return true; }, function (err) {
        if (err && err.code === 'invalid_argument') {
          readOnly = true;
          statusFn('אין הרשאת כתיבה לענן (צריך הרשאת "עורך"). הנתונים נשמרים במכשיר בלבד.', true);
        } else if (err && err.code === 'quota_exceeded') {
          statusFn('האחסון בענן מלא. הנתונים נשמרים במכשיר — כדאי לייצא JSON.', true);
        } else {
          statusFn('השמירה בענן נכשלה (' + (err && err.code) + '). הנתונים נשמרים במכשיר.', true);
        }
        return false;
      });
    };
    chains[key] = (chains[key] || Promise.resolve()).then(run, run);
    return chains[key];
  }

  function remove(collection, id) {
    if (!db || readOnly) return Promise.resolve(false);
    return db.collection(collection).doc(id).delete().then(function () { return true; }, function () { return false; });
  }

  DA.cloud = {
    available: available,
    connect: connect,
    mirror: mirror,
    save: save,
    remove: remove,
    slim: slim,
    onStatus: function (fn) { statusFn = fn; },
    isConnected: function () { return !!db && !readOnly; }
  };
  DA.cloudSlim = slim;
})(typeof window !== 'undefined' ? window : globalThis);
