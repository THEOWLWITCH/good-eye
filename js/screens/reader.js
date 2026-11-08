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
      if (p.best) { ctx.updateSettings(p.best.settings); DA.ui.toast(T('⭐ המצב שלי')); }
      else DA.ui.toast(T('עוד אין "מצב שלי". אפשר לקבוע אחרי המשחק או בהגדרות.'));
    };
    $('rTheme').onclick = cycleTheme;
    $('rRuler').onclick = function () {
      var order = ['off', 'band', 'mask'], cur = ctx.profile().settings.ruler;
      ctx.updateSettings({ ruler: order[(order.indexOf(cur) + 1) % 3] });
    };
    $('rSpeak').onclick = speak;
    $('rSettings').onclick = function () { DA.drawer.open(); };
    $('rSources').onclick = showSources;
    $('rMore').querySelectorAll('button').forEach(function (b) { b.addEventListener('click', function () { setTimeout(function () { $('rMore').open = false; }, 150); }); });
    document.addEventListener('click', function (e) { if ($('rMore').open && !$('rMore').contains(e.target)) $('rMore').open = false; });
    DA.eyePanel.bindSwitch($('rEyes'));
    $('rMode').onchange = function () { setMode(this.value); };
    if (DA.i18n.dir === 'ltr') { $('segPrev').textContent = '←'; $('segNext').textContent = '→'; }
    $('segPrev').onclick = function () { stepSeg(-1); };
    $('segNext').onclick = function () { stepSeg(1); };
    $('segPlay').onclick = toggleRsvp;
    $('segFirst').onclick = restart;
    $('segEvery').value = ctx.store.getPref('read.every', 'auto');
    $('segEvery').onchange = function () {
      ctx.store.setPref('read.every', this.value);
      if (rsvpTimer) { stopRsvp(); toggleRsvp(); }      // apply the new pace at once
    };

    // sources
    $('srcPasteGo').onclick = function () {
      var t = $('srcPasteText').value.trim();
      if (!t) { DA.ui.toast(T('הדביקו או כתבו טקסט')); return; }
      openDoc({ type: 'text', text: t, title: '' });
    };
    $('srcFileBtn').onclick = function () { $('srcFile').click(); };
    $('srcFile').onchange = function () { if (this.files[0]) loadFile(this.files[0]); this.value = ''; };
    $('srcPhotoBtn').onclick = function () { $('srcPhoto').click(); };
    $('srcPhoto').onchange = function () { if (this.files[0]) loadFile(this.files[0]); this.value = ''; };
    $('srcCamBtn').onclick = startCamera;
    $('srcGenBtn').onclick = generate;
    $('srcSample').onclick = function () {
      if (DA.i18n.content === 'en') {
        openDoc({ type: 'text', title: T('דוגמה'), text: DA.stimuli.SENTENCES.map(function (s) { return s.en + '.'; }).join(' ') + '\n\n' +
          'Math: $3 + 4 = 7$ and $\\frac{1}{2} + \\frac{1}{4} = \\frac{3}{4}$' });
        return;
      }
      openDoc({ type: 'text', title: T('דוגמה'), text: DA.stimuli.SENTENCES.map(function (s) { return s.he + '.'; }).join(' ') + '\n\n' +
        DA.stimuli.SENTENCES.slice(0, 5).map(function (s) { return s.en + '.'; }).join(' ') + T('\n\nחשבון: $3 + 4 = 7$ ו־$\\frac{1}{2} + \\frac{1}{4} = \\frac{3}{4}$') });
    };
    $('aiStop').onclick = function () { if (aiCtl) aiCtl.abort(); };
    // picture dictionary: double-click (or long-press) a word
    var pressT = null;
    $('readContent').addEventListener('dblclick', function (e) { var w = e.target.closest && e.target.closest('.w'); if (w) { e.preventDefault(); dictPop(w); } });
    $('readContent').addEventListener('pointerdown', function (e) {
      var w = e.target.closest && e.target.closest('.w');
      if (!w || e.pointerType === 'mouse') return;
      pressT = setTimeout(function () { dictPop(w); }, 600);
    });
    ['pointerup', 'pointercancel', 'pointermove'].forEach(function (ev) { $('readContent').addEventListener(ev, function () { clearTimeout(pressT); }); });
    document.addEventListener('pointerdown', function (e) { var d = $('dictPop'); if (d && !d.contains(e.target)) d.remove(); });
    // voice commands
    if (DA.voice.supported()) {
      $('rVoice').style.display = '';
      $('rVoice').onclick = function () {
        if (DA.voice.isOn()) { DA.voice.stop(); $('rVoice').classList.remove('listening'); return; }
        DA.voice.start(DA.i18n.content, voiceCommand, function (onNow, err) {
          $('rVoice').classList.toggle('listening', onNow);
          if (err) DA.ui.tell(T('אין גישה למיקרופון. צריך לאשר אותו בדפדפן.'));
          else if (onNow) DA.ui.toast(T('🎤 מקשיב: "גדול יותר", "קטן יותר", "תקריא", "עצור", "הבא", "הקודם", "צבעים", "סרגל"'));
        });
      };
    }
    // tap (or click) a word to hear just that word — handy for young readers
    $('readContent').addEventListener('click', function (e) {
      var w = e.target.closest && e.target.closest('.w');
      if (!w || !root.speechSynthesis || speechSynthesis.speaking) return;
      if (ctx.profile().settings.ruler !== 'off') return; // ruler taps move the ruler
      say(w.textContent, 'word');
      w.classList.add('speaking');
      setTimeout(function () { w.classList.remove('speaking'); }, 900);
    });
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
      if (ctx.current() !== 'read' || (e.target.matches && e.target.matches('input, textarea, select'))) return;
      if (e.key === 'ArrowDown') { lens.moveRuler(1); e.preventDefault(); }
      else if (e.key === 'ArrowUp') { lens.moveRuler(-1); e.preventDefault(); }
      else if (mode !== 'page' && e.key === 'ArrowLeft') stepSeg(DA.i18n.dir === 'rtl' ? 1 : -1);
      else if (mode !== 'page' && e.key === 'ArrowRight') stepSeg(DA.i18n.dir === 'rtl' ? -1 : 1);
      else if (e.key === ' ') { toggleRsvp(); e.preventDefault(); }
      else if (e.key === 'PageDown') { stepSeg(1); e.preventDefault(); }
      else if (e.key === 'PageUp') { stepSeg(-1); e.preventDefault(); }
      else if (e.key === 'Home') { restart(); e.preventDefault(); }
    });

    DA.ai.available().then(function (ok) { $('srcGenCard').classList.toggle('disabled', !ok); $('srcGenNote').style.display = ok ? 'none' : ''; });
    $('srcCamNote').style.display = (root.claude && root.claude.use) ? '' : 'none';
  }

  function enter() {
    var p = ctx.profile();
    if (!p) { ctx.go('home'); return; }
    refresh();
    var intent = ctx.store.getPref('read.intent', null);
    ctx.store.setPref('read.intent', null);
    $('readSources').classList.toggle('see', intent === 'see');
    if (intent === 'see') { showSources(); return; }
    if (!doc) {
      var last = ctx.store.getPref('lastDoc.' + p.id, null);
      if (last && last.type === 'text') openDoc(last, true); else showSources();
    }
  }
  function leave() { stopCamera(); stopRsvp(); if (root.speechSynthesis) speechSynthesis.cancel(); if (DA.voice.isOn()) { DA.voice.stop(); $('rVoice').classList.remove('listening'); } }

  function voiceCommand(cmd) {
    if (ctx.current() !== 'read') return;
    if (cmd === 'bigger') bump('fontSize', 1.15);
    else if (cmd === 'smaller') bump('fontSize', 1 / 1.15);
    else if (cmd === 'read') { if (!root.speechSynthesis || !speechSynthesis.speaking) speak(); }
    else if (cmd === 'stop') { if (root.speechSynthesis) speechSynthesis.cancel(); clearSpeaking(); stopRsvp(); }
    else if (cmd === 'next') { if (mode === 'page') $('readScroll').scrollBy({ top: $('readScroll').clientHeight * 0.8, behavior: 'smooth' }); else stepSeg(1); }
    else if (cmd === 'back') { if (mode === 'page') $('readScroll').scrollBy({ top: -$('readScroll').clientHeight * 0.8, behavior: 'smooth' }); else stepSeg(-1); }
    else if (cmd === 'colors') cycleTheme();
    else if (cmd === 'ruler') $('rRuler').click();
    else if (cmd === 'best') $('rStar').click();
  }

  /** Picture dictionary pop-up for a word: picture (if known), the word, and read it aloud. */
  function dictPop(w) {
    if (ctx.profile().settings.dictionary === false) return;
    var old = $('dictPop'); if (old) old.remove();
    var word = w.textContent.replace(/[.,!?;:"״()]/g, '');
    var emo = DA.readaids.lookup(word);
    var pop = document.createElement('div');
    pop.id = 'dictPop'; pop.className = 'dict-pop';
    pop.innerHTML = (emo ? '<div class="emo">' + emo + '</div>' : '') + '<div class="w" dir="auto">' + esc(word) + '</div>' +
      '<div class="row center"><button type="button" class="big" data-a="say">🔊</button><button type="button" data-a="ai" style="display:none">' + T('🪄 מה זה?') + '</button></div><p class="muted small" data-a="exp"></p>';
    document.body.appendChild(pop);
    var r = w.getBoundingClientRect();
    pop.style.top = Math.max(8, Math.min(innerHeight - pop.offsetHeight - 8, r.bottom + 8)) + 'px';
    pop.style.left = Math.max(8, Math.min(innerWidth - pop.offsetWidth - 8, r.left + r.width / 2 - pop.offsetWidth / 2)) + 'px';
    pop.querySelector('[data-a=say]').onclick = function () { say(word, 'word'); };
    DA.ai.available().then(function (ok) {
      var b = pop.querySelector('[data-a=ai]'); if (!ok || !b) return;
      b.style.display = '';
      b.onclick = function () {
        var exp = pop.querySelector('[data-a=exp]'); exp.textContent = T('⏳ חושב…');
        DA.ai.explainWord(word, docText() || '', ctx.profile().kind).then(function (r) { exp.textContent = r.text; }, function (e) { exp.textContent = DA.ai.errorText(e); });
      };
    });
  }

  function simplify() {
    var text = docText();
    if (!text) return;
    var kind = ctx.profile().kind;
    runAi(T('כותב גרסה פשוטה יותר…'), function (onText, signal) { return DA.ai.simplify(text, kind, onText, signal); }, null);
  }

  /** Re-apply the reader's settings (called after any settings change). */
  function refresh(previewSettings) {
    var p = ctx.profile();
    if (!p) return;
    var s = effective(previewSettings || p.settings);
    lens.apply(s, ctx.opsFor(s));
    if (doc && lastSyl !== !!s.syllables) { lastSyl = !!s.syllables; render(); }
    var hasCal = !!ctx.opsFor(s);
    $('rGlassesWrap').style.display = hasCal ? '' : 'none';
    $('rGlasses').value = s.warpStrength;
    $('rRuler').classList.toggle('on', s.ruler !== 'off');
    $('rSizeVal').textContent = s.fontSize;
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
  var lastDist = null, lastSyl = null;
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
      busy(T('קורא את קובץ ה־Word…'));
      f.arrayBuffer().then(function (buf) {
        return DA.loader.mammoth().then(function (m) { return m.extractRawText({ arrayBuffer: buf }); });
      }).then(function (r) { openDoc({ type: 'text', text: r.value, title: f.name }); })
        .catch(function (e) { DA.ui.tell(T('לא הצלחתי לקרוא את הקובץ: ') + e.message); showSources(); });
    } else {
      f.text().then(function (t) { openDoc({ type: 'text', text: t, title: f.name }); });
    }
  }

  function loadPdf(f) {
    busy(T('קורא את ה־PDF…'));
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
      .catch(function (e) { DA.ui.tell(T('לא הצלחתי לקרוא את ה־PDF: ') + (e && e.message)); showSources(); });
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
      doc = { type: 'camera', title: T('מצלמה') };
      showView();
      $('readContent').innerHTML = '<div class="cam-wrap"><video id="camVideo" autoplay playsinline muted></video></div>';
      $('camVideo').srcObject = s;
      $('readExtra').innerHTML = T('<button id="camFreeze" class="big">📸 להקפיא</button>');
      $('camFreeze').onclick = freezeFrame;
      setMode('page');
    }).catch(camFallback);
  }
  function camFallback() {
    DA.ui.tell(T('המצלמה החיה לא זמינה כאן (בתוך claude.ai היא חסומה). אפשר לצלם תמונה עם "📷 צילום" — היא תוצג עם כל התיקונים.'));
  }
  function freezeFrame() {
    var v = $('camVideo');
    if (!v) return;
    var c = document.createElement('canvas'); c.width = v.videoWidth; c.height = v.videoHeight;
    c.getContext('2d').drawImage(v, 0, 0);
    c.toBlob(function (b) { stopCamera(); openDoc({ type: 'image', url: URL.createObjectURL(b), blob: b, title: T('צילום') }); }, 'image/jpeg', 0.92);
  }
  function stopCamera() {
    if (stream) { stream.getTracks().forEach(function (t) { t.stop(); }); stream = null; }
  }

  // ---------------- AI text ----------------
  function generate() {
    DA.ai.available().then(function (ok) {
      if (!ok) { DA.ui.tell(T('כתיבת טקסטים חדשים זמינה בגרסה שב־claude.ai.')); return; }
      var s = ctx.profile().settings;
      $('genNikud').checked = !!s.nikud;
      $('genLang').value = DA.i18n.content;
      $('genLevel').value = ctx.profile().kind === 'adult' ? 'adult' : 'g2';
      var dlg = $('genDialog');
      dlg.returnValue = '';
      dlg.onclose = function () {
        if (dlg.returnValue !== 'ok') return;
        var o = { level: $('genLevel').value, kind: $('genKind').value, topic: $('genTopic').value.trim(), lang: $('genLang').value, length: $('genLength').value, nikud: $('genNikud').checked };
        runAi(T('כותב טקסט חדש…'), function (onText, signal) { return DA.ai.generate(o, onText, signal); }, o);
      };
      dlg.showModal();
    });
  }

  function photoToText() {
    if (!doc || !doc.blob) return;
    var blob = doc.blob;
    runAi(T('קורא את התמונה…'), function (onText, signal) { return DA.ai.photoToText(blob, onText, signal); }, { from: 'photo' });
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
    if (d.type === 'image') extra = T('<button id="toText" class="big">📝 להפוך לטקסט</button>');
    if (d.type === 'text' || d.type === 'pages') extra += '<button id="simplifyBtn" style="display:none">' + T('🪄 לפשט') + '</button>';
    if ((d.type === 'image' || d.type === 'pages') && ctx.profile().settings.deblur !== 'none') extra += '<label class="inline check"><input type="checkbox" id="sharpenToggle"' + (ctx.store.getPref('sharpenOff', false) ? '' : ' checked') + '> ' + T('✨ חידוד אישי') + '</label>';
    if (d.type === 'pages') extra = T('<label class="inline">תצוגה <select id="pagesAs"><option value="text">טקסט מסודר</option><option value="pages">עמודים כמו במקור</option></select></label>');
    $('readExtra').innerHTML = extra;
    if ($('toText')) DA.ai.canImages().then(function (ok) { $('toText').style.display = ok ? '' : 'none'; $('toText').onclick = photoToText; });
    if ($('pagesAs')) $('pagesAs').onchange = function () { render(); };
    if ($('simplifyBtn')) DA.ai.available().then(function (ok) { if (ok && $('simplifyBtn')) { $('simplifyBtn').style.display = ''; $('simplifyBtn').onclick = simplify; } });
    if ($('sharpenToggle')) $('sharpenToggle').onchange = function () { ctx.store.setPref('sharpenOff', !this.checked); render(); };
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
      personalSharpen(box);
      return;
    }
    if (doc.type === 'pages' && text == null) {
      box.innerHTML = '<div class="img-wrap">' + doc.pages.map(function (u) { return '<img class="lens-img page" alt="" src="' + u + '">'; }).join('') + '</div>';
      personalSharpen(box);
      return;
    }
    if (text == null) return;
    $('segNav').style.display = '';
    if (mode === 'page') {
      $('segCount').textContent = '';
      var w = wordsHtml(text);
      speechMap = w;
      box.innerHTML = (doc.title ? '<h2 class="read-title" dir="auto">' + esc(doc.title) + '</h2>' : '') + '<div class="read-text">' + w.html + '</div>';
      typesetMath(box);
    } else {
      segs = mode === 'sentence' ? sentences(text) : text.split(/\s+/).filter(Boolean);
      segIdx = Math.min(segIdx, Math.max(0, segs.length - 1));
      showSeg();
    }
  }

  /**
   * Personal sharpening of pictures, photos and PDF pages (method and blur shape chosen in the lab).
   * Runs on a copy of the picture (max ~1000 px for speed); the original stays available.
   */
  function personalSharpen(box) {
    var s = ctx.profile().settings;
    if (!s.deblur || s.deblur === 'none' || ctx.store.getPref('sharpenOff', false)) return;
    box.querySelectorAll('img.lens-img').forEach(function (img, n) {
      var go = function () {
        setTimeout(function () {
          try {
            var max = s.deblur === 'wiener' || s.deblur === 'rl' ? 900 : 1400;
            var k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
            var w = Math.round(img.naturalWidth * k), h = Math.round(img.naturalHeight * k);
            var c = document.createElement('canvas'); c.width = w; c.height = h;
            var g = c.getContext('2d'); g.drawImage(img, 0, 0, w, h);
            var out = DA.imageproc.processImageData(g.getImageData(0, 0, w, h), s.deblur, s.psf || { radius: 1.5 },
              { amount: s.deblurAmount, radius: s.deblurRadius, K: s.deblurK, iterations: s.deblurIter });
            g.putImageData(out, 0, 0);
            img.setAttribute('data-orig', img.src);
            img.onload = null;
            img.src = c.toDataURL('image/png');
          } catch (e) { console.warn('sharpen failed', e); }
        }, 30 + n * 20);
      };
      if (img.complete && img.naturalWidth) go(); else img.onload = go;
    });
  }

  function paragraphs(text) {
    return String(text).split(/\n\s*\n|\r\n\s*\r\n/).map(function (p) {
      return '<p dir="auto">' + esc(p.trim()).replace(/\n/g, '<br>') + '</p>';
    }).join('');
  }
  /**
   * Page text with every word in its own <span data-s="offset">, plus the exact string that is
   * read aloud, so speech "boundary" events (character offsets) can highlight the current word.
   * Paragraphs with math ($…$) are shown as-is (MathJax needs the raw text) and read without the math.
   */
  var speechMap = null;
  function wordsHtml(text) {
    var speech = '', html = '';
    String(text).split(/\n\s*\n|\r\n\s*\r\n/).forEach(function (p, pi) {
      p = p.trim();
      if (!p) return;
      if (pi && speech) speech += '\n\n';
      if (/\$/.test(p)) {
        html += '<p dir="auto">' + esc(p).replace(/\n/g, '<br>') + '</p>';
        speech += p.replace(/\$\$?[^$]*\$\$?/g, ' ');
        return;
      }
      var lines = p.split(/\n/).map(function (line) {
        return line.split(/\s+/).filter(Boolean).map(function (word) {
          if (speech && !/\s$/.test(speech)) speech += ' ';
          var start = speech.length;
          speech += word;
          return '<span class="w" data-s="' + start + '">' + wordInner(word) + '</span>';
        }).join(' ');
      });
      html += '<p dir="auto">' + lines.join('<br>') + '</p>';
    });
    return { html: html, text: speech };
  }

  /** A word's inner HTML: plain, or split into syllables in alternating colours. */
  function wordInner(word) {
    var p = ctx.profile();
    if (!p || !p.settings.syllables) return esc(word);
    var parts = DA.readaids.syllables(word);
    if (parts.length < 2) return esc(word);
    return parts.map(function (s, i) { return '<span class="' + (i % 2 ? 'syl-b' : 'syl-a') + '">' + esc(s) + '</span>'; }).join('');
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
  /** Next / previous: a sentence or word, or (whole-page mode) one screen of text. */
  function stepSeg(d) {
    if (mode === 'page') {
      var sc = $('readScroll');
      sc.scrollBy({ top: d * sc.clientHeight * 0.8, behavior: 'smooth' });
      return;
    }
    segIdx = Math.max(0, Math.min(segs.length - 1, segIdx + d));
    showSeg();
  }
  /** Back to the beginning. */
  function restart() {
    var playing = !!rsvpTimer;
    stopRsvp();
    if (mode === 'page') $('readScroll').scrollTo({ top: 0, behavior: 'smooth' });
    else { segIdx = 0; showSeg(); }
    if (playing) toggleRsvp();
  }
  /** Seconds to wait before the next step: the chosen pace, or by length ("auto"). */
  function stepDelay() {
    var every = ctx.store.getPref('read.every', 'auto'), rate = ctx.profile().settings.speechRate || 1;
    if (every !== 'auto') return +every * 1000;
    if (mode === 'word') return (380 + (segs[segIdx] || '').length * 45) / rate;
    if (mode === 'sentence') return (900 + (segs[segIdx] || '').length * 75) / rate;
    return 2500 / rate;                                   // page: one line every ~2.5 s
  }
  /** Automatic advance: next sentence / word, or in page mode scroll one line. */
  function toggleRsvp() {
    if (rsvpTimer) { stopRsvp(); return; }
    $('segPlay').textContent = '⏸';
    $('segPlay').classList.add('on');
    var tick = function () {
      if (mode === 'page') {
        var sc = $('readScroll'), s = ctx.profile().settings;
        if (sc.scrollTop + sc.clientHeight >= sc.scrollHeight - 2) { stopRsvp(); return; }
        sc.scrollBy({ top: s.fontSize * s.lineHeight, behavior: 'smooth' });
      } else {
        if (segIdx >= segs.length - 1) { stopRsvp(); return; }
        segIdx++; showSeg();
      }
      rsvpTimer = setTimeout(tick, stepDelay());
    };
    rsvpTimer = setTimeout(tick, stepDelay());
  }
  function stopRsvp() {
    clearTimeout(rsvpTimer); rsvpTimer = null;
    if ($('segPlay')) { $('segPlay').textContent = '▶'; $('segPlay').classList.remove('on'); }
  }

  // ---------------- read aloud ----------------
  function speak() {
    var synth = root.speechSynthesis;
    if (!synth) { DA.ui.toast(T('הקראה לא זמינה בדפדפן הזה')); return; }
    if (synth.speaking) { synth.cancel(); clearSpeaking(); return; }
    var pageMode = mode === 'page' && speechMap && $('readContent').querySelector('.w');
    var text = pageMode ? speechMap.text : mode === 'page' ? docText() : segs[segIdx];
    if (!text) return;
    say(text, pageMode ? 'page' : 'seg');
  }

  var fallbackTimer = null, gotBoundary = false;
  function clearSpeaking() {
    clearInterval(fallbackTimer); fallbackTimer = null;
    $('readContent').querySelectorAll('.speaking').forEach(function (e) { e.classList.remove('speaking'); });
    $('rSpeak').classList.remove('on');
  }
  function highlightAt(charIndex) {
    var spans = $('readContent').querySelectorAll('.w'), hit = null;
    for (var i = 0; i < spans.length; i++) { if (+spans[i].getAttribute('data-s') <= charIndex) hit = spans[i]; else break; }
    if (!hit || hit.classList.contains('speaking')) return;
    $('readContent').querySelectorAll('.w.speaking').forEach(function (e) { e.classList.remove('speaking'); });
    hit.classList.add('speaking');
    var r = hit.getBoundingClientRect(), v = $('readScroll').getBoundingClientRect();
    if (r.top < v.top + 20 || r.bottom > v.bottom - 20) hit.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }

  /** Speak text; kind 'page' highlights word by word, 'seg' highlights the shown segment, 'word' nothing. */
  function say(text, kind) {
    var synth = root.speechSynthesis;
    var s = ctx.profile().settings;
    var light = s.speechHighlight !== false;
    synth.cancel(); clearSpeaking();
    var u = new SpeechSynthesisUtterance(text.replace(/\$[^$]*\$/g, ' '));
    var he = /[֐-׿]/.test(text);
    u.lang = he ? 'he-IL' : 'en-US';
    var v = synth.getVoices().filter(function (x) { return x.lang && x.lang.toLowerCase().indexOf(he ? 'he' : 'en') === 0; })[0];
    if (v) u.voice = v;
    else if (he) DA.ui.toast(T('לא נמצא קול בעברית במכשיר הזה'));
    u.rate = s.speechRate;
    gotBoundary = false;
    if (kind !== 'word') $('rSpeak').classList.add('on');
    if (light && kind === 'page') {
      u.onboundary = function (e) { if (e.name === 'word' || e.name === undefined) { gotBoundary = true; highlightAt(e.charIndex); } };
      u.onstart = function () {
        // some voices never report word boundaries: estimate the pace instead
        setTimeout(function () {
          if (gotBoundary || !synth.speaking) return;
          var spans = $('readContent').querySelectorAll('.w'), i = 0;
          var perWord = 60000 / (150 * s.speechRate);
          fallbackTimer = setInterval(function () {
            if (i >= spans.length || !synth.speaking) { clearInterval(fallbackTimer); return; }
            highlightAt(+spans[i].getAttribute('data-s')); i++;
          }, perWord);
        }, 900);
      };
    }
    if (light && kind === 'seg') { var segEl = $('readContent').querySelector('.seg'); if (segEl) segEl.classList.add('speaking'); }
    u.onend = u.onerror = function () { clearSpeaking(); };
    synth.speak(u);
  }

  DA.screens.read = { init: init, enter: enter, leave: leave, refresh: refresh, openDoc: openDoc };
})(typeof window !== 'undefined' ? window : globalThis);
