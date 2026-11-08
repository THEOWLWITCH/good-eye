/*
 * עין טובה — Every instruction can be heard.
 *  - A small 🔊 button is added next to each instruction text (help lines, game prompts, notes,
 *    dialog questions). Tapping it reads the text aloud.
 *  - Setting "read all instructions aloud" (copilotVoice): new instructions are read automatically
 *    throughout the app — the navigator, game and test prompts, and dialog questions.
 */
(function (root) {
  'use strict';
  var DA = root.DA;
  var ctx;
  var STATIC = '.lead, .lab-help, .glasses-note, .device-note, .device-tip, #hubTip, #tlHelp, .learn-setup > p.muted:not(.no-say), .scope-card, .next-card, .disclaimer, #ftSetup > p.muted, #rtSetup > p.muted';
  var LIVE = ['learnPrompt', 'rtPrompt', 'askText', 'promptText', 'status'];

  function clean(t) {
    return String(t || '').replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu, '').replace(/\s+/g, ' ').trim();
  }

  function say(text, opts) {
    var synth = root.speechSynthesis;
    text = clean(text);
    if (!synth || !text) return;
    opts = opts || {};
    if (opts.polite && synth.speaking) return;
    synth.cancel();
    var u = new SpeechSynthesisUtterance(text);
    var he = /[֐-׿]/.test(text) || DA.i18n.content !== 'en';
    u.lang = he ? 'he-IL' : 'en-US';
    var v = synth.getVoices().filter(function (x) { return x.lang && x.lang.toLowerCase().indexOf(he ? 'he' : 'en') === 0; })[0];
    if (v) u.voice = v;
    var p = ctx && ctx.profile();
    u.rate = (p && p.settings.speechRate) || 0.9;
    synth.speak(u);
  }

  function auto() { var p = ctx && ctx.profile(); return !!(p && p.settings.copilotVoice); }

  function button(getText) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'say-btn';
    b.title = T('להקריא');
    b.setAttribute('aria-label', T('להקריא'));
    b.innerHTML = DA.icons ? DA.icons.svg('sound') : '🔊';
    b.onclick = function (e) { e.preventDefault(); e.stopPropagation(); say(getText()); };
    return b;
  }

  /** Add a 🔊 button to every instruction text that does not have one yet. */
  function attach(scope) {
    (scope || document).querySelectorAll(STATIC).forEach(function (el) {
      if (el.getAttribute('data-say') || !el.textContent.trim()) return;
      el.setAttribute('data-say', '1');
      el.appendChild(button(function () { return el.textContent; }));
    });
    LIVE.forEach(function (id) {
      var el = document.getElementById(id);
      if (!el || el.getAttribute('data-say')) return;
      el.setAttribute('data-say', '1');
      var b = button(function () { return el.textContent; });
      b.classList.add('live');
      el.parentNode.insertBefore(b, el.nextSibling);
    });
  }

  /** Read new instructions aloud automatically when the setting is on. */
  function watch() {
    LIVE.forEach(function (id) {
      var el = document.getElementById(id);
      if (!el) return;
      var last = '';
      new MutationObserver(function () {
        var t = el.textContent.trim();
        var p = ctx && ctx.profile();
        var on = auto() || (id === 'learnPrompt' && p && p.settings.gameVoice !== false);
        if (!on || !t || t === last) return;
        last = t;
        if (id === 'askText' || id === 'promptText') { if (el.closest('dialog') && el.closest('dialog').open) say(t); }
        else if (el.offsetParent !== null) say(t, { polite: id === 'status' });
      }).observe(el, { childList: true, characterData: true, subtree: true });
    });
  }

  function init(c) {
    ctx = c;
    attach();
    watch();
  }

  DA.speech = { init: init, say: say, attach: attach, auto: auto };
})(typeof window !== 'undefined' ? window : globalThis);
