/*
 * עין טובה — "My history" (optional). Only when the reader (or an adult) turns it on, results are
 * kept over time and shown as simple charts. Nothing is interpreted or flagged: this is to help the
 * reader see how their own settings and preferences change, not a medical follow-up.
 * When history is off, only the latest result of each kind is kept (needed to start the next game).
 */
(function (root) {
  'use strict';
  var DA = root.DA;
  DA.screens = DA.screens || {};
  var $ = DA.ui.$, esc = DA.ui.esc;
  var ctx;

  function init(c) {
    ctx = c;
    $('histToggle').onclick = toggle;
    $('hubHistToggle').onclick = toggle;
    $('hubHistShow').onclick = function () { ctx.go('history'); };
    $('histClear').onclick = clearAll;
  }

  function toggle() {
    var p = ctx.profile();
    if (!p) return;
    if (p.keepHistory) {
      DA.ui.ask(T('לכבות את שמירת ההיסטוריה? מעכשיו תישמר רק התוצאה האחרונה מכל סוג. מה שכבר נשמר יימחק.'), T('לכבות')).then(function (y) {
        if (!y) return;
        p.keepHistory = false; ctx.profiles.save(p); ctx.profiles.prune(p.id);
        render(); DA.ui.toast(T('שמירת ההיסטוריה כבויה'));
      });
    } else {
      p.keepHistory = true; ctx.profiles.save(p);
      render(); DA.ui.toast(T('📈 מעכשיו התוצאות נשמרות לאורך זמן'));
    }
  }

  function clearAll() {
    var p = ctx.profile();
    DA.ui.ask(T('למחוק את כל ההיסטוריה של ') + p.name + T('? ההגדרות והכיולים נשארים.'), T('מחיקה')).then(function (y) {
      if (!y) return;
      ctx.profiles.removeSessionsFor(p.id);
      render(); DA.ui.toast(T('ההיסטוריה נמחקה'));
    });
  }

  function labelFor(p) { return p.keepHistory ? T('📈 שמירת היסטוריה: פועלת (לחצו לכיבוי)') : T('📈 שמירת היסטוריה: כבויה (לחצו להפעלה)'); }

  /** Called by the hub to refresh its small history card. */
  function hubCard() {
    var p = ctx.profile();
    if (!p) return;
    $('hubHistToggle').textContent = labelFor(p);
    $('hubHistToggle').classList.toggle('on', !!p.keepHistory);
  }

  function enter() { render(); }
  function leave() {}

  function render() {
    var p = ctx.profile();
    if (!p) { ctx.go('home'); return; }
    $('histToggle').textContent = labelFor(p);
    $('histToggle').classList.toggle('on', !!p.keepHistory);
    var ss = ctx.profiles.sessionsFor(p.id).slice().reverse(); // oldest first
    var box = $('histBody');
    if (!p.keepHistory) {
      box.innerHTML = '<p class="muted">' + T('שמירת ההיסטוריה כבויה. אפשר להפעיל אותה, ואז כל משחק, מדידה וכיול יישמרו ויוצגו כאן לאורך זמן.') + '</p>';
      return;
    }
    var parts = [];
    var mn = ss.filter(function (s) { return s.kind === 'mnread'; }).map(function (s) {
      var r = (s.runs || []).filter(function (x) { return x.condition === 'with'; })[0] || (s.runs || [])[0];
      return r && r.result ? { t: s.startedAt, size: r.result.cps, speed: r.result.mrsWpm } : null;
    }).filter(Boolean);
    if (mn.length) {
      parts.push(section(T('⏱️ גודל קריאה נוח (פיקסלים)'), mn.map(function (x) { return { t: x.t, v: x.size }; })));
      parts.push(section(T('⏱️ מהירות קריאה (מילים לדקה)'), mn.map(function (x) { return { t: x.t, v: x.speed }; })));
    }
    var learn = ss.filter(function (s) { return !s.kind || s.kind === 'learn'; });
    var cats = {};
    learn.forEach(function (s) { Object.keys(s.recognition || {}).forEach(function (k) { if (s.recognition[k].corrected) (cats[k] = cats[k] || []).push({ t: s.startedAt, v: s.recognition[k].corrected.threshold }); }); });
    var CAT = {}; DA.stimuli.CATEGORIES.forEach(function (c) { CAT[c.id] = c.icon + ' ' + c.label; });
    Object.keys(cats).forEach(function (k) { parts.push(section('🎮 ' + T('הגודל הקטן שזוהה במשחק: ') + (CAT[k] || k), cats[k])); });
    var fm = ss.filter(function (s) { return s.kind === 'fieldmap' && s.result; }).map(function (s) { return { t: s.startedAt, v: s.result.defects }; });
    if (fm.length) parts.push(section(T('🎯 מפת נוחות: נקודות שנראו פחות'), fm));
    var trials = ctx.store.allTrials().filter(function (t) { return t.profileId === p.id && t.model && t.model.quality; })
      .sort(function (a, b) { return a.savedAt < b.savedAt ? -1 : 1; })
      .map(function (t) { return { t: t.savedAt, v: Math.round(t.model.quality.maxDisplacement * ((t.display && t.display.stimulusSizePx) || 600)) }; });
    if (trials.length) parts.push(section(T('🎯 כיול עיוות: התזוזה הגדולה ביותר (פיקסלים)'), trials));
    box.innerHTML = parts.length ? parts.join('') : '<p class="muted">' + T('עוד אין מספיק נתונים. אחרי כמה משחקים או מדידות יופיעו כאן גרפים.') + '</p>';
  }

  function section(title, pts) {
    return '<div class="card hist-card"><h3>' + esc(title) + '</h3>' + chart(pts) + '</div>';
  }

  function chart(pts) {
    if (!pts.length) return '';
    var W = 520, H = 150, P = 30;
    var vs = pts.map(function (p) { return p.v; }), lo = Math.min.apply(null, vs), hi = Math.max.apply(null, vs);
    if (hi === lo) { hi += 1; lo = Math.max(0, lo - 1); }
    var x = function (i) { return pts.length === 1 ? W / 2 : P + i / (pts.length - 1) * (W - 2 * P); };
    var y = function (v) { return H - P - (v - lo) / (hi - lo) * (H - 2 * P); };
    var svg = '<svg class="hist-chart" viewBox="0 0 ' + W + ' ' + H + '" dir="ltr">';
    svg += '<text x="4" y="' + (P + 4) + '" font-size="11" fill="#6d7a86">' + Math.round(hi) + '</text><text x="4" y="' + (H - P + 4) + '" font-size="11" fill="#6d7a86">' + Math.round(lo) + '</text>';
    svg += '<polyline fill="none" stroke="#1b6ef3" stroke-width="2.5" points="' + pts.map(function (p, i) { return x(i).toFixed(1) + ',' + y(p.v).toFixed(1); }).join(' ') + '"/>';
    pts.forEach(function (p, i) {
      var d = new Date(p.t);
      svg += '<circle cx="' + x(i).toFixed(1) + '" cy="' + y(p.v).toFixed(1) + '" r="4" fill="#1b6ef3"><title>' + d.toLocaleDateString(DA.i18n.locale) + ': ' + p.v + '</title></circle>';
      if (pts.length <= 8 || i === 0 || i === pts.length - 1) svg += '<text x="' + x(i).toFixed(1) + '" y="' + (H - 8) + '" font-size="10" text-anchor="middle" fill="#6d7a86">' + d.toLocaleDateString(DA.i18n.locale, { day: 'numeric', month: 'numeric' }) + '</text>';
    });
    return svg + '</svg>';
  }

  DA.screens.history = { init: init, enter: enter, leave: leave, hubCard: hubCard };
})(typeof window !== 'undefined' ? window : globalThis);
