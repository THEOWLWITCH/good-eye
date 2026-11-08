/*
 * DA — Application controller: wires the instrument, history and storage together.
 * Stage 1: flexible grid instrument with save / load / undo / redo / reset / exact restore.
 */
(function (root) {
  'use strict';
  var DA = root.DA;
  DA.screens = DA.screens || {};
  var VERSION = DA.VERSION;
  var DEF = DA.deformation;
  var store, ctx;
  var $ = DA.ui.$, ask = DA.ui.ask, tell = DA.ui.tell, download = DA.ui.download, stamp = DA.ui.stamp;
  var visible = false;
  var grid, trial, history, dirty = false, lastQuality = null;

  function init(c) {
  ctx = c; store = c.store;

  DA.eyePanel.bindSwitch($('calEyes'));
  grid = new DA.GridInstrument($('canvas'), {
    settings: store.getPref('gridSettings', {}),
    onCommit: onCommit,
    onLive: onLive
  });

  function uid() {
    var d = new Date(), p = function (n) { return String(n).padStart(2, '0'); };
    return 'T' + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '-' + p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds()) +
      '-' + Math.random().toString(36).slice(2, 6);
  }

  function newTrialMeta(repeatOf) {
    return {
      id: uid(),
      createdAt: new Date().toISOString(),
      startedAt: Date.now(),
      label: '',
      repeatOf: repeatOf || null,
      eventLog: [],
      ratings: { confidence: null, notes: '' }
    };
  }

  function ops() { return history.present.map(function (e) { return e.op; }); }
  function records() { return history.present.map(function (e) { return e.record; }); }

  function logEvent(type, data) {
    trial.eventLog.push(Object.assign({ type: type, at: new Date().toISOString(), tMs: Date.now() - trial.startedAt }, data || {}));
  }

  // ---------- instrument callbacks ----------
  function onCommit(op, record) {
    var entries = history.get();
    record.seq = entries.length + 1;
    record.tMs = Date.now() - trial.startedAt;
    record.at = new Date().toISOString();
    record.eyes = DA.eyes.snapshot();
    entries.push({ op: op, record: record });
    history.commit(entries);
    logEvent('drag', { lineId: record.lineId, dx: record.dx, dy: record.dy, radius: record.radius });
    changed();
    var msg = 'נשמרה פעולת גרירה #' + record.seq + ' (' + Math.round(record.distance * grid.S) + ' פיקסלים)';
    setStatus(record.clamped ? msg + ' — הגרירה הוגבלה כדי למנוע קיפול. הגדילו את הרדיוס לתיקון גדול יותר.' : msg, record.clamped);
  }

  function onLive(op, clamped) {
    if (!op) return;
    if (clamped) setStatus('הגרירה הוגבלה כדי למנוע קיפול — הגדילו את רדיוס ההשפעה לתיקון גדול יותר.', true);
    else if (DEF.opMinDetBound(op) <= 0) setStatus('אזהרה: הגרירה הנוכחית יוצרת קיפול ברשת.', true);
    else setStatus('גוררים… שחררו כשהקו נראה ישר.');
  }

  // ---------- main update ----------
  function changed(skipDirty) {
    if (!skipDirty) dirty = true;
    grid.setOps(ops());
    updateQuality();
    updateButtons();
    updateTrialInfo();
    saveDraft();
  }

  function updateQuality() {
    var q = DEF.analyze(ops(), 41);
    lastQuality = q;
    var el = $('quality');
    if (!ops().length) { el.textContent = 'אין תיקונים'; el.className = ''; return; }
    var txt = 'שינוי שטח מקומי: בין ×' + q.minDet.toFixed(2) + ' ל-×' + q.maxDet.toFixed(2) +
      ' · תזוזה מרבית: ' + Math.round(q.maxDisplacement * grid.S) + ' פיקסלים';
    if (q.fold) { el.textContent = '⚠ קיפול ברשת! ' + txt + ' — מומלץ לבטל את הפעולה האחרונה'; el.className = 'bad'; }
    else if (q.extreme) { el.textContent = '⚠ עיוות מקומי חזק (מומלץ רדיוס גדול יותר) · ' + txt; el.className = 'warn'; }
    else { el.textContent = '✓ רציף, ללא קיפולים · ' + txt; el.className = 'ok'; }
  }

  function updateButtons() {
    $('undo').disabled = !history.canUndo();
    $('redo').disabled = !history.canRedo();
    $('reset').disabled = history.present.length === 0;
  }

  function updateTrialInfo() {
    var saved = store.getTrial(trial.id);
    $('trialInfo').innerHTML =
      'מזהה: <b>' + trial.id + '</b><br>' +
      'פעולות: ' + history.present.length +
      (trial.repeatOf ? '<br>חזרה על: ' + trial.repeatOf : '') +
      '<br>' + (saved ? (dirty ? '<span style="color:#b26a00">שינויים שלא נשמרו</span>' : 'שמור ✓') : 'עדיין לא נשמר');
    renderTrialList();
  }

  function setStatus(text, warn) {
    var el = $('status');
    el.textContent = text;
    el.className = warn ? 'warn' : '';
  }

  // ---------- draft autosave ----------
  function saveDraft() {
    if (!trial) return;
    store.setPref('calDraft.' + (trial.profileId || 'none'), { version: VERSION, trial: trial, history: history.toJSON(), dirty: dirty, viewing: readViewing() });
  }

  // ---------- settings UI ----------
  function readViewing() {
    return {
      eye: $('eye').value,
      distanceCm: $('distanceCm').value ? Number($('distanceCm').value) : null,
      headPose: $('headPose').value,
      lighting: $('lighting').value,
      fixation: $('fixationNote').value
    };
  }
  function writeViewing(v) {
    v = v || {};
    $('eye').value = v.eye || 'right';
    $('distanceCm').value = v.distanceCm == null ? '' : v.distanceCm;
    $('headPose').value = v.headPose || '';
    $('lighting').value = v.lighting || '';
    $('fixationNote').value = v.fixation || '';
  }

  function syncSettingsUI() {
    var s = grid.settings;
    $('density').value = s.density; $('densityOut').textContent = s.density + '×' + s.density;
    $('mode').value = s.mode;
    $('singleBox').style.display = s.mode === 'single' ? 'flex' : 'none';
    $('singleOrient').value = s.singleOrient;
    $('singleIndex').max = s.density; $('singleIndex').value = s.singleIndex + 1;
    $('lineWidth').value = s.lineWidth; $('lineWidthOut').textContent = s.lineWidth + 'px';
    $('radius').value = s.radius; $('radiusOut').textContent = Math.round(s.radius * grid.S) + 'px';
    ['dark', 'fixation', 'clamp', 'showOriginal', 'showControls'].forEach(function (k) { $(k).checked = !!s[k]; });
    $('stage').classList.toggle('dark', !!s.dark);
  }

  function setSetting(patch, log) {
    grid.setSettings(patch);
    store.setPref('gridSettings', grid.settings);
    syncSettingsUI();
    if (log && trial) { logEvent('setting', patch); saveDraft(); }
  }

  $('density').addEventListener('input', function () { setSetting({ density: +this.value }, true); });
  $('mode').addEventListener('change', function () { setSetting({ mode: this.value }, true); });
  $('singleOrient').addEventListener('change', function () { setSetting({ singleOrient: this.value }, true); });
  $('singleIndex').addEventListener('input', function () {
    var v = Math.max(1, Math.min(grid.settings.density, +this.value || 1));
    setSetting({ singleIndex: v - 1 }, true);
  });
  $('lineWidth').addEventListener('input', function () { setSetting({ lineWidth: +this.value }, true); });
  $('radius').addEventListener('input', function () { setSetting({ radius: +this.value }, false); });
  $('radius').addEventListener('change', function () { logEvent('setting', { radius: grid.settings.radius }); saveDraft(); });
  ['dark', 'fixation', 'clamp', 'showOriginal', 'showControls'].forEach(function (k) {
    $(k).addEventListener('change', function () { var p = {}; p[k] = this.checked; setSetting(p, true); });
  });
  ['eye', 'distanceCm', 'headPose', 'lighting', 'fixationNote'].forEach(function (k) {
    $(k).addEventListener('change', function () { store.setPref('viewing', readViewing()); logEvent('viewing', readViewing()); saveDraft(); });
  });
  $('label').addEventListener('input', function () { trial.label = this.value; dirty = true; saveDraft(); updateTrialInfo(); });

  // ---------- actions ----------
  function undo() { if (history.undo()) { logEvent('undo'); changed(); setStatus('בוטלה הפעולה האחרונה.'); } }
  function redo() { if (history.redo()) { logEvent('redo'); changed(); setStatus('הפעולה שוחזרה.'); } }
  function reset() {
    if (!history.present.length) return;
    ask('לאפס את כל התיקונים בניסיון הנוכחי? (אפשר להחזיר עם "ביטול פעולה")', 'איפוס').then(function (yes) {
      if (!yes) return;
      history.reset([]); logEvent('reset'); changed(); setStatus('הרשת אופסה. אפשר לחזור עם "ביטול".');
    });
  }

  function buildTrial() {
    var S = grid.S, s = grid.settings;
    var o = ops();
    return {
      schema: 'da.trial/1',
      id: trial.id,
      label: trial.label,
      softwareVersion: VERSION,
      instrument: 'flex-grid',
      createdAt: trial.createdAt,
      savedAt: new Date().toISOString(),
      durationMs: Date.now() - trial.startedAt,
      repeatOf: trial.repeatOf,
      profileId: trial.profileId || null,
      stimulus: {
        type: 'grid', density: s.density, margin: DA.GridInstrument.MARGIN, displayMode: s.mode,
        singleLine: s.mode === 'single' ? { orient: s.singleOrient, index: s.singleIndex } : null,
        lineWidthPx: s.lineWidth, polarity: s.dark ? 'white-on-black' : 'black-on-white',
        fixationPoint: !!s.fixation, coordinates: 'normalized 0..1 of stimulus square, origin top-left'
      },
      display: {
        stimulusSizePx: S,
        viewportW: window.innerWidth, viewportH: window.innerHeight,
        screenW: screen.width, screenH: screen.height, dpr: window.devicePixelRatio || 1,
        userAgent: navigator.userAgent
      },
      viewing: readViewing(),
      settings: JSON.parse(JSON.stringify(s)),
      actions: records(),
      eventLog: trial.eventLog,
      model: {
        type: 'sequential-local-displacement',
        kernel: 'wendland-c2',
        ops: o,
        sampledField: DEF.sampleField(o, 33),
        quality: DEF.analyze(o, 41)
      },
      original: { lines: grid.originalLines(true).map(function (L) { return { id: L.id, points: L.points.filter(function (_, k) { return k % 4 === 0; }) }; }) },
      corrected: { lines: grid.correctedGeometry(4) },
      ratings: trial.ratings,
      history: history.toJSON()
    };
  }

  function save() {
    var dlg = $('saveDialog');
    $('notes').value = trial.ratings.notes || '';
    var c = trial.ratings.confidence || 3;
    document.querySelectorAll('input[name=conf]').forEach(function (r) { r.checked = +r.value === c; });
    dlg.returnValue = '';
    dlg.showModal();
  }
  $('saveDialog').addEventListener('close', function () {
    if (this.returnValue !== 'ok') return;
    var sel = document.querySelector('input[name=conf]:checked');
    trial.ratings = { confidence: sel ? +sel.value : null, notes: $('notes').value };
    logEvent('save');
    var t = buildTrial();
    try {
      store.saveTrial(t);
    } catch (e) {
      tell('השמירה נכשלה (ייתכן שהאחסון מלא). ייצאו את הנתונים ל-JSON. ' + e.message);
      return;
    }
    DA.cloud.save('trials', t.id, t);
    dirty = false;
    saveDraft();
    updateTrialInfo();
    setStatus('הניסיון נשמר: ' + t.id);
    // the newest saved calibration becomes the reader's active warp correction
    var prof = ctx.profile();
    if (prof && t.actions.length) {
      prof.settings = DA.settings.normalize(Object.assign({}, prof.settings, { calibrationId: t.id }));
      ctx.profiles.save(prof);
      DA.ui.toast('הכיול הזה ישמש עכשיו לתיקון בקריאה ובמשחק של ' + prof.name);
    }
  });

  function confirmDiscard() {
    if (!dirty || !history.present.length) return Promise.resolve(true);
    return ask('יש שינויים שלא נשמרו בניסיון הנוכחי. להמשיך בלי לשמור?', 'להמשיך בלי לשמור');
  }

  function startTrial(repeatOf) {
    trial = newTrialMeta(repeatOf);
    trial.profileId = ctx.profile() ? ctx.profile().id : null;
    history = new DA.History([]);
    dirty = false;
    $('label').value = '';
    logEvent('start', { settings: grid.settings, repeatOf: repeatOf || null });
    changed(true);
    setStatus(repeatOf ? 'ניסיון חוזר חדש (אותן הגדרות, ללא תיקונים).' : 'ניסיון חדש התחיל.');
  }

  function loadTrial(id) {
    if (!store.getTrial(id)) return;
    confirmDiscard().then(function (yes) { if (yes) doLoadTrial(id); });
  }
  function doLoadTrial(id) {
    var t = store.getTrial(id);
    if (!t) return;
    trial = {
      id: t.id, createdAt: t.createdAt, startedAt: Date.now() - (t.durationMs || 0), label: t.label || '',
      repeatOf: t.repeatOf || null, profileId: t.profileId || null, eventLog: (t.eventLog || []).slice(), ratings: t.ratings || { confidence: null, notes: '' }
    };
    history = t.history ? DA.History.fromJSON(t.history)
      : new DA.History(t.model.ops.map(function (op, i) { return { op: op, record: t.actions[i] }; }));
    grid.setSettings(t.settings || {});
    store.setPref('gridSettings', grid.settings);
    syncSettingsUI();
    writeViewing(t.viewing);
    $('label').value = trial.label;
    dirty = false;
    logEvent('load');
    changed(true);
    setStatus('נטען ניסיון ' + t.id + ' — ' + history.present.length + ' פעולות.');
  }

  // ---------- trial list / compare ----------
  function fmtDate(iso) {
    var d = new Date(iso);
    return d.toLocaleDateString('he-IL') + ' ' + d.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
  }

  function renderTrialList() {
    var list = myTrials(), box = $('trialList');
    box.innerHTML = '';
    list.forEach(function (s) {
      var row = document.createElement('div');
      row.className = 'trial-item' + (trial && s.id === trial.id ? ' active' : '');
      row.innerHTML = '<div class="meta"><b></b><span class="muted"></span></div>';
      row.querySelector('b').textContent = s.label || s.id;
      row.querySelector('.muted').textContent = fmtDate(s.savedAt) + ' · ' + s.actions + ' פעולות' +
        (s.confidence ? ' · ביטחון ' + s.confidence : '') + (s.repeatOf ? ' · חזרה' : '');
      var open = document.createElement('button'); open.textContent = 'פתיחה';
      open.onclick = function () { loadTrial(s.id); };
      var del = document.createElement('button'); del.textContent = '✕'; del.className = 'danger'; del.title = 'מחיקה';
      del.onclick = function () {
        ask('למחוק לצמיתות את הניסיון ' + (s.label || s.id) + '? לא ניתן לשחזר אותו (מומלץ לייצא קודם ל-JSON).', 'מחיקה').then(function (yes) {
          if (!yes) return;
          store.deleteTrial(s.id); DA.cloud.remove('trials', s.id); updateTrialInfo();
        });
      };
      row.appendChild(open); row.appendChild(del);
      box.appendChild(row);
    });
    var cmp = $('compare'), cur = cmp.value;
    cmp.innerHTML = '<option value="">— ללא —</option>';
    list.forEach(function (s) {
      if (trial && s.id === trial.id) return;
      var o = document.createElement('option');
      o.value = s.id; o.textContent = (s.label || s.id) + ' (' + fmtDate(s.savedAt) + ')';
      cmp.appendChild(o);
    });
    cmp.value = list.some(function (s) { return s.id === cur; }) ? cur : '';
    applyCompare();
  }

  function applyCompare() {
    var id = $('compare').value;
    var t = id ? store.getTrial(id) : null;
    grid.setCompare(t ? t.model.ops : null);
  }
  $('compare').addEventListener('change', function () {
    applyCompare();
    if (this.value) setStatus('בכחול: הרשת המתוקנת מהניסיון ' + this.value);
  });

  // ---------- export / import ----------
  $('exportJson').onclick = function () {
    var trials = store.allTrials();
    if (!trials.length) { tell('אין ניסיונות שמורים לייצוא.'); return; }
    var bundle = DA.storage.exportBundle(trials, VERSION);
    bundle.profiles = ctx.profiles.list();
    download('da-trials-' + stamp() + '.json', JSON.stringify(bundle, null, 1), 'application/json');
  };
  $('exportCsv').onclick = function () {
    var trials = store.allTrials();
    if (!trials.length) { tell('אין ניסיונות שמורים לייצוא.'); return; }
    download('da-actions-' + stamp() + '.csv', DA.storage.actionsCSV(trials), 'text/csv;charset=utf-8');
  };
  $('importJson').onclick = function () { $('importFile').click(); };
  $('importFile').addEventListener('change', function () {
    var f = this.files[0]; if (!f) return;
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var data = JSON.parse(reader.result);
        var n = store.importBundle(data);
        (Array.isArray(data) ? data : data.trials || [data]).forEach(function (t) { if (t && t.id && store.getTrial(t.id)) DA.cloud.save('trials', t.id, t); });
        updateTrialInfo();
        setStatus('יובאו ' + n + ' ניסיונות.');
      } catch (e) { tell('קובץ לא תקין: ' + e.message); }
    };
    reader.readAsText(f);
    this.value = '';
  });

  // ---------- buttons & keyboard ----------
  $('undo').onclick = undo;
  $('redo').onclick = redo;
  $('reset').onclick = reset;
  $('save').onclick = save;
  $('newTrial').onclick = function () { confirmDiscard().then(function (yes) { if (yes) startTrial(null); }); };
  $('repeatTrial').onclick = function () {
    if (!store.getTrial(trial.id)) { tell('שמרו קודם את הניסיון הנוכחי, ואז אפשר לבצע ניסיון חוזר.'); return; }
    confirmDiscard().then(function (yes) {
      if (!yes) return;
      var src = trial.id; startTrial(src); $('compare').value = ''; applyCompare();
    });
  };
  $('fullscreen').onclick = toggleFullscreen;
  function toggleFullscreen() {
    if (document.fullscreenElement) document.exitFullscreen();
    else $('stage').requestFullscreen().catch(function () {});
  }
  document.addEventListener('fullscreenchange', function () { setTimeout(function () { grid.resize(); syncSettingsUI(); }, 50); });

  document.addEventListener('keydown', function (e) {
    if (!visible) return;
    if (e.target.matches('input[type=text], input[type=number], textarea')) return;
    var k = e.key.toLowerCase(), mod = e.ctrlKey || e.metaKey;
    if (mod && k === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
    else if (mod && (k === 'y' || (k === 'z' && e.shiftKey))) { e.preventDefault(); redo(); }
    else if (mod && k === 's') { e.preventDefault(); save(); }
    else if (!mod && (e.key === '[' || e.key === ']')) {
      var r = grid.settings.radius * (e.key === ']' ? 1.1 : 1 / 1.1);
      setSetting({ radius: Math.round(Math.max(0.03, Math.min(0.6, r)) * 1000) / 1000 }, true);
    } else if (!mod && k === 'f') toggleFullscreen();
  });

  window.addEventListener('beforeunload', function () { saveDraft(); });
  new ResizeObserver(function () { if (visible) { grid.resize(); syncSettingsUI(); } }).observe($('stage'));
  syncSettingsUI();
  writeViewing(store.getPref('viewing', { eye: 'right' }));
  DA.cloud.mirror('trials', {
    upsert: function (t) { if (t && t.schema) store.saveTrial(t); },
    remove: function (id) { store.deleteTrial(id); },
    ready: function (ids) {
      store.listTrials().forEach(function (s) { if (ids.indexOf(s.id) < 0) { var t = store.getTrial(s.id); if (t) DA.cloud.save('trials', t.id, t); } });
    },
    changed: function () { if (visible && trial) updateTrialInfo(); }
  });
  inner = { writeViewing: writeViewing, saveDraft: saveDraft, changed: changed, startTrial: startTrial, setStatus: setStatus, updateTrialInfo: updateTrialInfo, syncSettingsUI: syncSettingsUI, buildTrial: buildTrial };
  } // init
  var inner = {};

  function myTrials() {
    var pid = ctx.profile() ? ctx.profile().id : null;
    return store.listTrials().filter(function (s) {
      var t = store.getTrial(s.id);
      return t && (!t.profileId || t.profileId === pid);
    });
  }

  /** Called when the screen is shown: restore this reader's draft (or start fresh). */
  function enter() {
    visible = true;
    var pid = ctx.profile() ? ctx.profile().id : 'none';
    if (!trial || (trial.profileId || 'none') !== pid) {
      var draft = store.getPref('calDraft.' + pid, null);
      if (!draft && pid !== 'none') {
        var legacy = store.loadDraft(); // stage-1 draft (before profiles)
        if (legacy && legacy.trial) { legacy.trial.profileId = pid; draft = legacy; store.clearDraft(); }
      }
      if (draft && draft.trial && draft.history) {
        trial = draft.trial;
        history = DA.History.fromJSON(draft.history);
        if (draft.viewing) inner.writeViewing(draft.viewing);
        $('label').value = trial.label || '';
        dirty = !!draft.dirty;
        inner.changed(true);
        if (history.present.length) inner.setStatus('שוחזר הכיול האחרון (' + history.present.length + ' פעולות).');
      } else {
        inner.startTrial(null);
      }
    }
    setTimeout(function () { grid.resize(); inner.syncSettingsUI(); inner.updateTrialInfo(); }, 0);
  }
  function leave() { visible = false; inner.saveDraft(); }

  DA.screens.calibrate = { init: init, enter: enter, leave: leave, getTrial: function () { return inner.buildTrial(); }, grid: function () { return grid; } };
})(typeof window !== 'undefined' ? window : globalThis);
