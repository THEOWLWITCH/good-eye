/*
 * DA — Reader ("לקרוא"): any text, picture, document, photo or live camera, shown through the
 * reader's personal Lens. Few big buttons for children; everything else is in the settings drawer.
 *
 * Sources: paste/type · file (txt, md, docx, pdf, images) · photo (phone camera) · live camera
 * (outside claude.ai only) · a new text written by Claude by level and topic.
 * Modes: whole page · one sentence at a time · one word at a time (RSVP).
 */
(function (root) {
  'use strict';
  var DA = root.DA;
  DA.screens = DA.screens || {};
  var $ = DA.ui.$, esc = DA.ui.esc;
  var ctx, lens, doc = null, mode = 'page', segs = [], segIdx = 0, rsvpTimer = null, stream = null, aiCtl = null;

  function init(c) {
    ctx = c;
    lens = new DA.Lens($('readLens'));

    // kid toolbar
    $('rSmaller').onclick = function () { bump('fontSize', 1 / 1.15); };
    $('rBigger').onclick = function () { bump('fontSize', 1.15); };
    $('rGlasses').oninput = function () { ctx.previewSettings(Object.assign({}, ctx.profile().settings, { warpStrength: +this.value })); };
    $('rGlasses').onchange = function () { ctx.updateSettings({ warpStrength: +this.value }); };
    $('rStar').onclick = function () {
      var p = ctx.profile();
      if (p.best) { ctx.updateSettings(p.best.settings); DA.ui.toast('⭐ המצב שלי'); }
      else DA.ui.toast('עוד אין "מצב שלי". אפשר לקבוע אחרי המשחק או בהגדרות.');
    };
    $('rTheme').onclick = cycleTheme;
    $('rRuler').onclick = function () {
      var order = ['off', 'band', 'mask'], cur = ctx.profile().settings.ruler;
      ctx.updateSettings({ ruler: order[(order.indexOf(cur) + 1) % 3] });
    };
    $('rSpeak').onclick = speak;
    $('rSettings').onclick = function () { DA.drawer.open(); };
    $('rSources').onclick = showSources;
    DA.eyePanel.bindSwitch($('rEyes'));
    $('rMode').onchange = function () { setMode(this.value); };
    $('segPrev').onclick = function () { stepSeg(-1); };
    $('segNext').onclick = function () { stepSeg(1); };
    $('segPlay').onclick = toggleRsvp;

    // sources
    $('srcPasteGo').onclick = function () {
      var t = $('srcPasteText').value.trim();
      if (!t) { DA.ui.toast('הדביקו או כתבו טקסט'); return; }
      openDoc({ type: 'text', text: t, title: '' });
    };
    $('srcFileBtn').onclick = function () { $('srcFile').click(); };
    $('srcFile').onchange = function () { if (this.files[0]) loadFile(this.files[0]); this.value = ''; };
    $('srcPhotoBtn').onclick = function () { $('srcPhoto').click(); };
    $('srcPhoto').onchange = function () { if (this.files[0]) loadFile(this.files[0]); this.value = ''; };
    $('srcCamBtn').onclick = startCamera;
    $('srcGenBtn').onclick = generate;
    $('srcSample').onclick = function () {
      openDoc({ type: 'text', title: 'דוגמה', text: DA.stimuli.SENTENCES.map(function (s) { return s.he + '.'; }).join(' ') + '\n\n' +
        DA.stimuli.SENTENCES.slice(0, 5).map(function (s) { return s.en + '.'; }).join(' ') + '\n\nחשבון: $3 + 4 = 7$ ו־$\\frac{1}{2} + \\frac{1}{4} = \\frac{3}{4}$' });
    };
    $('aiStop').onclick = function () { if (aiCtl) aiCtl.abort(); };
    var lastT = 0;
    DA.eyes.on(function (e) {
      if (ctx.current() !== 'read' || !e.distanceCm) return;
      var p = ctx.profile(); if (!p || !p.settings.eyesKeepAngle) return;
      var now = Date.now();
      if (lastDist && Math.abs(e.distanceCm - lastDist) / lastDist < 0.08) return;
      if (now - lastT < 800) return;
      lastDist = e.distanceCm; lastT = now;
      refresh();
    });

    document.addEventListener('keydown', function (e) {
      if (ctx.current() !== 'read' || e.target.matches('input, textarea, select')) return;
      if (e.key === 'ArrowDown') { lens.moveRuler(1); e.preventDefault(); }
      else if (e.key === 'ArrowUp') { lens.moveRuler(-1); e.preventDefault(); }
      else if (mode !== 'page' && e.key === 'ArrowLeft') stepSeg(1);
      else if (mode !== 'page' && e.key === 'ArrowRight') stepSeg(-1);
      else if (e.key === ' ' && mode === 'word') { toggleRsvp(); e.preventDefault(); }
    });

    DA.ai.available().then(function (ok) { $('srcGenCard').classList.toggle('disabled', !ok); $('srcGenNote').style.display = ok ? 'none' : ''; });
    $('srcCamNote').style.display = (root.claude && root.claude.use) ? '' : 'none';
  }

  function enter() {
    var p = ctx.profile();
    if (!p) { ctx.go('home'); return; }
    refresh();
    if (!doc) {
      var last = ctx.store.getPref('lastDoc.' + p.id, null);
      if (last && last.type === 'text') openDoc(last, true); else showSources();
    }
  }
  function leave() { stopCamera(); stopRsvp(); if (root.speechSynthesis) speechSynthesis.cancel(); }

  /** Re-apply the reader's settings (called after any settings change). */
  function refresh(previewSettings) {
    var p = ctx.profile();
    if (!p) return;
    var s = effective(previewSettings || p.settings);
    lens.apply(s, ctx.opsFor(s));
    var hasCal = !!ctx.opsFor(s);
    $('rGlassesWrap').style.display = hasCal ? '' : 'none';
    $('rGlasses').value = s.warpStrength;
    $('rRuler').classList.toggle('on', s.ruler !== 'off');
  }

  function bump(k, f) {
    var s = ctx.profile().settings, v = Math.round(s[k] * f);
    if (v === s[k]) v += f > 1 ? 1 : -1;
    var patch = {}; patch[k] = v;
    // with eye tracking on, remember the distance at which this size was chosen
    if (DA.eyes.state.running && DA.eyes.state.distanceCm) patch.refDistanceCm = DA.eyes.state.distanceCm;
    ctx.updateSettings(patch);
  }

  /** Keep letters the same size for the eye: scale with measured distance (eye tracking). */
  var lastDist = null;
  function effective(s) {
    var e = DA.eyes.state;
    if (!s.eyesKeepAngle || !s.refDistanceCm || !e.running || !e.distanceCm) return s;
    var f = Math.min(2.5, Math.max(0.5, e.distanceCm / s.refDistanceCm));
    return Object.assign({}, s, { fontSize: Math.round(s.fontSize * f) });
  }

  function cycleTheme() {
    var favs = ['white', 'cream', 'yellow', 'dark', 'darkyellow', 'blue'];
    var cur = ctx.profile().settings.theme;
    ctx.updateSettings({ theme: favs[(favs.indexOf(cur) + 1) % favs.length] });
    DA.ui.toast(DA.settings.theme(ctx.profile().settings.theme).label);
  }

  // ---------------- sources ----------------
  function showSources() {
    stopCamera(); stopRsvp();
    $('readSources').style.display = '';
    $('readView').style.display = 'none';
  }
  function showView() {
    $('readSources').style.display = 'none';
    $('readView').style.display = '';
  }

  function loadFile(f) {
    var name = f.name.toLowerCase(), type = f.type || '';
    if (/^image\//.test(type) || /\.(png|jpe?g|webp|gif|heic)$/.test(name)) {
      openDoc({ type: 'image', url: URL.createObjectURL(f), blob: f, title: f.name });
    } else if (/\.pdf$/.test(name) || type === 'application/pdf') {
      loadPdf(f);
    } else if (/\.docx$/.test(name)) {
      busy('קורא את קובץ ה־Word…');
      f.arrayBuffer().then(function (buf) {
        return DA.loader.mammoth().then(function (m) { return m.extractRawText({ arrayBuffer: buf }); });
      }).then(function (r) { openDoc({ type: 'text', text: r.value, title: f.name }); })
        .catch(function (e) { DA.ui.tell('לא הצלחתי לקרוא את הקובץ: ' + e.message); showSources(); });
    } else {
      f.text().then(function (t) { openDoc({ type: 'text', text: t, title: f.name }); });
    }
  }

  function loadPdf(f) {
    busy('קורא את ה־PDF…');
    var pdfLib;
    DA.loader.pdfjs().then(function (lib) { pdfLib = lib; return f.arrayBuffer(); })
      .then(function (buf) { return pdfLib.getDocument({ data: buf }).promise; })
      .then(function (pdf) {
        var pages = [], texts = [];
        var n = Math.min(pdf.numPages, 30);
        var chain = Promise.resolve();
        for (var i = 1; i <= n; i++) (function (i) {
          chain = chain.then(function () { return pdf.getPage(i); }).then(function (page) {
            var vp = page.getViewport({ scale: 2 });
            var c = document.createElement('canvas'); c.width = vp.width; c.height = vp.height;
            return page.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise.then(function () {
              pages.push(c.toDataURL('image/png'));
              return page.getTextContent();
            }).then(function (tc) {
              texts.push(tc.items.map(function (it) { return it.str + (it.hasEOL ? '\n' : ''); }).join(' '));
            });
          });
        })(i);
        return chain.then(function () {
          var text = texts.join('\n\n').replace(/[ \t]+\n/g, '\n').trim();
          openDoc({ type: 'pages', pages: pages, text: text, title: f.name });
        });
      })
      .catch(function (e) { DA.ui.tell('לא הצלחתי לקרוא את ה־PDF: ' + (e && e.message)); showSources(); });
  }

  function busy(text) {
    showView();
    $('readContent').innerHTML = '<p class="busy">⏳ ' + esc(text) + '</p>';
  }

  // ---------------- camera (live) ----------------
  function startCamera() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { camFallback(); return; }
    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1920 } }, audio: false }).then(function (s) {
      stream = s;
      doc = { type: 'camera', title: 'מצלמה' };
      showView();
      $('readContent').innerHTML = '<div class="cam-wrap"><video id="camVideo" autoplay playsinline muted></video></div>';
      $('camVideo').srcObject = s;
      $('readExtra').innerHTML = '<button id="camFreeze" class="big">📸 להקפיא</button>';
      $('camFreeze').onclick = freezeFrame;
      setMode('page');
    }).catch(camFallback);
  }
  function camFallback() {
    DA.ui.tell('המצלמה החיה לא זמינה כאן (בתוך claude.ai היא חסומה). אפשר לצלם תמונה עם "📷 צילום" — היא תוצג עם כל התיקונים.');
  }
  function freezeFrame() {
    var v = $('camVideo');
    if (!v) return;
    var c = document.createElement('canvas'); c.width = v.videoWidth; c.height = v.videoHeight;
    c.getContext('2d').drawImage(v, 0, 0);
    c.toBlob(function (b) { stopCamera(); openDoc({ type: 'image', url: URL.createObjectURL(b), blob: b, title: 'צילום' }); }, 'image/jpeg', 0.92);
  }
  function stopCamera() {
    if (stream) { stream.getTracks().forEach(function (t) { t.stop(); }); stream = null; }
  }

  // ---------------- AI text ----------------
  function generate() {
    DA.ai.available().then(function (ok) {
      if (!ok) { DA.ui.tell('כתיבת טקסטים חדשים זמינה בגרסה שב־claude.ai.'); return; }
      var s = ctx.profile().settings;
      $('genNikud').checked = !!s.nikud;
      $('genLevel').value = ctx.profile().kind === 'adult' ? 'adult' : 'g2';
      var dlg = $('genDialog');
      dlg.returnValue = '';
      dlg.onclose = function () {
        if (dlg.returnValue !== 'ok') return;
        var o = { level: $('genLevel').value, kind: $('genKind').value, topic: $('genTopic').value.trim(), lang: $('genLang').value, length: $('genLength').value, nikud: $('genNikud').checked };
        runAi('כותב טקסט חדש…', function (onText, signal) { return DA.ai.generate(o, onText, signal); }, o);
      };
      dlg.showModal();
    });
  }

  function photoToText() {
    if (!doc || !doc.blob) return;
    var blob = doc.blob;
    runAi('קורא את התמונה…', function (onText, signal) { return DA.ai.photoToText(blob, onText, signal); }, { from: 'photo' });
  }

  function runAi(label, call, meta) {
    showView();
    $('readContent').innerHTML = '<p class="busy">⏳ ' + esc(label) + '</p>';
    $('aiBar').style.display = '';
    aiCtl = new AbortController();
    call(function (u) { $('readContent').innerHTML = '<div class="read-text">' + paragraphs(u.text) + '</div>'; }, aiCtl.signal)
      .then(function (r) {
        var text = r.text.trim(), title = '';
        if (meta && meta.level) { var parts = text.split(/\n\s*\n/); title = parts.shift().trim(); text = parts.join('\n\n'); }
        openDoc({ type: 'text', text: text, title: title, generated: meta || null });
      })
      .catch(function (e) {
        if (e && e.text) openDoc({ type: 'text', text: e.text, title: '' });
        DA.ui.tell(DA.ai.errorText(e));
        if (!(e && e.text)) showSources();
      })
      .then(function () { $('aiBar').style.display = 'none'; aiCtl = null; });
  }

  // ---------------- display ----------------
  function openDoc(d, silent) {
    stopCamera(); stopRsvp();
    doc = d;
    if (d.type === 'text') ctx.store.setPref('lastDoc.' + ctx.profile().id, { type: 'text', text: d.text, title: d.title || '' });
    showView();
    var extra = '';
    if (d.type === 'image') extra = '<button id="toText" class="big">📝 להפוך לטקסט</button>';
    if (d.type === 'pages') extra = '<label class="inline">תצוגה <select id="pagesAs"><option value="text">טקסט מסודר</option><option value="pages">עמודים כמו במקור</option></select></label>';
    $('readExtra').innerHTML = extra;
    if ($('toText')) DA.ai.canImages().then(function (ok) { $('toText').style.display = ok ? '' : 'none'; $('toText').onclick = photoToText; });
    if ($('pagesAs')) $('pagesAs').onchange = function () { render(); };
    $('rMode').disabled = d.type !== 'text' && !(d.type === 'pages');
    render();
    if (!silent) $('readScroll').scrollTop = 0;
  }

  function docText() {
    if (!doc) return '';
    if (doc.type === 'text') return doc.text;
    if (doc.type === 'pages' && (!$('pagesAs') || $('pagesAs').value === 'text')) return doc.text;
    return null;
  }

  function render() {
    var box = $('readContent');
    var text = docText();
    $('segNav').style.display = 'none';
    if (doc.type === 'image') {
      box.innerHTML = '<div class="img-wrap"><img class="lens-img" alt="" src="' + doc.url + '"></div>';
      return;
    }
    if (doc.type === 'pages' && text == null) {
      box.innerHTML = '<div class="img-wrap">' + doc.pages.map(function (u) { return '<img class="lens-img page" alt="" src="' + u + '">'; }).join('') + '</div>';
      return;
    }
    if (text == null) return;
    if (mode === 'page') {
      box.innerHTML = (doc.title ? '<h2 class="read-title" dir="auto">' + esc(doc.title) + '</h2>' : '') + '<div class="read-text">' + paragraphs(text) + '</div>';
      typesetMath(box);
    } else {
      segs = mode === 'sentence' ? sentences(text) : text.split(/\s+/).filter(Boolean);
      segIdx = Math.min(segIdx, Math.max(0, segs.length - 1));
      $('segNav').style.display = '';
      $('segPlay').style.display = mode === 'word' ? '' : 'none';
      showSeg();
    }
  }

  function paragraphs(text) {
    return String(text).split(/\n\s*\n|\r\n\s*\r\n/).map(function (p) {
      return '<p dir="auto">' + esc(p.trim()).replace(/\n/g, '<br>') + '</p>';
    }).join('');
  }
  function sentences(text) {
    return String(text).replace(/\s+/g, ' ').match(/[^.!?。؟\n]+[.!?؟]*["”׳]?\s*/g) || [text];
  }

  function typesetMath(el) {
    if (!/\$|\\\(|\\\[/.test(el.textContent)) return;
    DA.loader.mathjax().then(function (MJ) { return MJ.typesetPromise([el]); }).catch(function () {});
  }

  function setMode(m) {
    mode = m; segIdx = 0; stopRsvp();
    $('rMode').value = m;
    if (doc) render();
  }
  function showSeg() {
    var box = $('readContent');
    box.innerHTML = '<div class="seg ' + mode + '" dir="auto">' + esc(segs[segIdx] || '') + '</div>';
    $('segCount').textContent = (segIdx + 1) + ' / ' + segs.length;
    typesetMath(box);
  }
  function stepSeg(d) {
    segIdx = Math.max(0, Math.min(segs.length - 1, segIdx + d));
    showSeg();
  }
  function toggleRsvp() {
    if (rsvpTimer) { stopRsvp(); return; }
    $('segPlay').textContent = '⏸';
    var tick = function () {
      if (segIdx >= segs.length - 1) { stopRsvp(); return; }
      segIdx++; showSeg();
      var w = segs[segIdx] || '';
      rsvpTimer = setTimeout(tick, (380 + w.length * 45) / ctx.profile().settings.speechRate);
    };
    rsvpTimer = setTimeout(tick, 500);
  }
  function stopRsvp() { clearTimeout(rsvpTimer); rsvpTimer = null; if ($('segPlay')) $('segPlay').textContent = '▶️'; }

  // ---------------- read aloud ----------------
  function speak() {
    var synth = root.speechSynthesis;
    if (!synth) { DA.ui.toast('הקראה לא זמינה בדפדפן הזה'); return; }
    if (synth.speaking) { synth.cancel(); return; }
    var text = mode === 'page' ? docText() : segs[segIdx];
    if (!text) return;
    var u = new SpeechSynthesisUtterance(text.replace(/\$[^$]*\$/g, ' '));
    var he = /[֐-׿]/.test(text);
    u.lang = he ? 'he-IL' : 'en-US';
    var v = synth.getVoices().filter(function (x) { return x.lang && x.lang.toLowerCase().indexOf(he ? 'he' : 'en') === 0; })[0];
    if (v) u.voice = v;
    else if (he) DA.ui.toast('לא נמצא קול בעברית במכשיר הזה');
    u.rate = ctx.profile().settings.speechRate;
    synth.speak(u);
  }

  DA.screens.read = { init: init, enter: enter, leave: leave, refresh: refresh, openDoc: openDoc };
})(typeof window !== 'undefined' ? window : globalThis);
