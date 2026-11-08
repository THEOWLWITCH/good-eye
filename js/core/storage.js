/*
 * DA — Data storage (spec §11).
 * Trials are stored locally in the browser (localStorage) and can be exported to JSON and CSV
 * and imported back from JSON. An in-progress draft is autosaved so nothing is lost on close.
 */
(function (root) {
  'use strict';
  var DA = (root.DA = root.DA || {});

  var PREFIX = 'da.v1.';
  var INDEX_KEY = PREFIX + 'trials.index';
  var DRAFT_KEY = PREFIX + 'draft';

  function memoryBackend() {
    var m = {};
    return {
      getItem: function (k) { return Object.prototype.hasOwnProperty.call(m, k) ? m[k] : null; },
      setItem: function (k, v) { m[k] = String(v); },
      removeItem: function (k) { delete m[k]; }
    };
  }

  function Store(backend) {
    this.b = backend || browserBackend();
  }

  // localStorage may be missing or throw (sandboxed frames); fall back to memory.
  function browserBackend() {
    try {
      var ls = root.localStorage;
      ls.setItem(PREFIX + 'probe', '1'); ls.removeItem(PREFIX + 'probe');
      return ls;
    } catch (e) { return memoryBackend(); }
  }

  Store.prototype._read = function (k, fallback) {
    var raw = this.b.getItem(k);
    if (raw == null) return fallback;
    try { return JSON.parse(raw); } catch (e) { return fallback; }
  };
  Store.prototype._write = function (k, v) {
    try { this.b.setItem(k, JSON.stringify(v)); }
    catch (e) {
      // storage full or blocked: keep working in memory for this visit
      if (this.b === root.localStorage) {
        var mem = memoryBackend(), old = this.b;
        [INDEX_KEY, DRAFT_KEY].forEach(function (key) { var v0 = old.getItem(key); if (v0 != null) mem.setItem(key, v0); });
        this.listTrials.call({ _read: function (kk, d) { var r = old.getItem(kk); return r == null ? d : JSON.parse(r); } })
          .forEach(function (s) { var r = old.getItem(PREFIX + 'trial.' + s.id); if (r != null) mem.setItem(PREFIX + 'trial.' + s.id, r); });
        this.b = mem;
        this.b.setItem(k, JSON.stringify(v));
      } else throw e;
    }
  };

  Store.prototype.listTrials = function () {
    return this._read(INDEX_KEY, []); // [{id, savedAt, instrument, actions, label, repeatOf}]
  };
  Store.prototype.getTrial = function (id) { return this._read(PREFIX + 'trial.' + id, null); };
  Store.prototype.saveTrial = function (trial) {
    this._write(PREFIX + 'trial.' + trial.id, trial);
    var idx = this.listTrials().filter(function (t) { return t.id !== trial.id; });
    idx.push(summary(trial));
    idx.sort(function (a, b) { return a.savedAt < b.savedAt ? 1 : -1; });
    this._write(INDEX_KEY, idx);
    return trial;
  };
  Store.prototype.deleteTrial = function (id, fromSync) {
    if (!fromSync && root.DA && root.DA.sync) root.DA.sync.tomb('trial', id);
    this.b.removeItem(PREFIX + 'trial.' + id);
    this._write(INDEX_KEY, this.listTrials().filter(function (t) { return t.id !== id; }));
  };
  Store.prototype.allTrials = function () {
    var self = this;
    return this.listTrials().map(function (s) { return self.getTrial(s.id); }).filter(Boolean);
  };

  Store.prototype.saveDraft = function (draft) { this._write(DRAFT_KEY, draft); };
  Store.prototype.loadDraft = function () { return this._read(DRAFT_KEY, null); };
  Store.prototype.clearDraft = function () { this.b.removeItem(DRAFT_KEY); };

  Store.prototype.getPref = function (k, d) { return this._read(PREFIX + 'pref.' + k, d); };
  Store.prototype.setPref = function (k, v) { this._write(PREFIX + 'pref.' + k, v); };

  /** Import trials from an export bundle (or a single trial). Returns number imported. */
  Store.prototype.importBundle = function (data) {
    var trials = Array.isArray(data) ? data : data && data.trials ? data.trials : data && data.id ? [data] : [];
    var n = 0;
    for (var i = 0; i < trials.length; i++) {
      var t = trials[i];
      if (t && t.id && t.schema && String(t.schema).indexOf('da.trial') === 0) { this.saveTrial(t); n++; }
    }
    return n;
  };

  function summary(t) {
    return {
      id: t.id,
      label: t.label || '',
      savedAt: t.savedAt,
      instrument: t.instrument,
      actions: (t.actions || []).length,
      repeatOf: t.repeatOf || null,
      confidence: t.ratings ? t.ratings.confidence : null
    };
  }

  function exportBundle(trials, version) {
    return {
      schema: 'da.export/1',
      softwareVersion: version,
      exportedAt: new Date().toISOString(),
      trials: trials
    };
  }

  // ---------- CSV ----------
  function csvCell(v) {
    if (v == null) return '';
    var s = typeof v === 'object' ? JSON.stringify(v) : String(v);
    return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }
  function toCSV(rows, columns) {
    var lines = [columns.join(',')];
    rows.forEach(function (r) { lines.push(columns.map(function (c) { return csvCell(r[c]); }).join(',')); });
    return '﻿' + lines.join('\r\n'); // BOM so Excel shows Hebrew correctly
  }

  var ACTION_COLUMNS = [
    'trialId', 'trialLabel', 'savedAt', 'softwareVersion', 'instrument', 'repeatOf',
    'stimulusSizePx', 'screenW', 'screenH', 'dpr',
    'distanceCm', 'headPose', 'lighting', 'fixation',
    'seq', 'tMs', 'durationMs', 'pointerType', 'lineId', 'gridDensity', 'displayMode',
    'origX', 'origY', 'fromX', 'fromY', 'toX', 'toY', 'dx', 'dy',
    'distance', 'distancePx', 'directionDeg', 'radius', 'radiusPx', 'clamped',
    'confidence'
  ];

  /** One row per drag action, with trial context — for analysis in Excel/R/Python. */
  function actionsCSV(trials) {
    var rows = [];
    trials.forEach(function (t) {
      var S = t.display ? t.display.stimulusSizePx : null;
      (t.actions || []).forEach(function (a) {
        rows.push({
          trialId: t.id, trialLabel: t.label, savedAt: t.savedAt, softwareVersion: t.softwareVersion,
          instrument: t.instrument, repeatOf: t.repeatOf,
          stimulusSizePx: S, screenW: t.display && t.display.screenW, screenH: t.display && t.display.screenH,
          dpr: t.display && t.display.dpr,
          distanceCm: t.viewing && t.viewing.distanceCm, headPose: t.viewing && t.viewing.headPose,
          lighting: t.viewing && t.viewing.lighting, fixation: t.viewing && t.viewing.fixation,
          seq: a.seq, tMs: a.tMs, durationMs: a.durationMs, pointerType: a.pointerType, lineId: a.lineId,
          gridDensity: a.gridDensity, displayMode: a.displayMode,
          origX: a.original && a.original.x, origY: a.original && a.original.y,
          fromX: a.from.x, fromY: a.from.y, toX: a.to.x, toY: a.to.y, dx: a.dx, dy: a.dy,
          distance: a.distance, distancePx: S ? round(a.distance * S, 2) : null,
          directionDeg: a.directionDeg, radius: a.radius, radiusPx: S ? round(a.radius * S, 2) : null,
          clamped: a.clamped, confidence: t.ratings && t.ratings.confidence
        });
      });
    });
    return toCSV(rows, ACTION_COLUMNS);
  }

  function round(v, d) { var f = Math.pow(10, d); return Math.round(v * f) / f; }

  DA.storage = {
    Store: Store,
    memoryBackend: memoryBackend,
    exportBundle: exportBundle,
    actionsCSV: actionsCSV,
    toCSV: toCSV,
    ACTION_COLUMNS: ACTION_COLUMNS
  };
})(typeof window !== 'undefined' ? window : globalThis);
