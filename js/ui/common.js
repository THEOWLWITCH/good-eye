/*
 * DA — Shared UI helpers: in-page dialogs (alert/confirm are blocked inside claude.ai), toasts,
 * downloads (claude.ai `downloads` capability, or a plain link locally), escaping.
 */
(function (root) {
  'use strict';
  var DA = (root.DA = root.DA || {});
  var $ = function (id) { return document.getElementById(id); };
  var downloads = null;

  function ask(text, okLabel, cancelLabel) {
    return new Promise(function (resolve) {
      var dlg = $('askDialog');
      $('askText').textContent = text;
      $('askOk').textContent = okLabel || T('אישור');
      $('askCancel').textContent = cancelLabel || T('ביטול');
      $('askCancel').style.display = cancelLabel === null ? 'none' : '';
      dlg.returnValue = '';
      dlg.onclose = function () { resolve(dlg.returnValue === 'ok'); };
      dlg.showModal();
    });
  }
  function tell(text) { return ask(text, T('הבנתי'), null); }

  /** Ask for a line of text in an in-page dialog. Resolves null on cancel. */
  function prompt(text, value) {
    return new Promise(function (resolve) {
      var dlg = $('promptDialog');
      $('promptText').textContent = text;
      $('promptInput').value = value || '';
      dlg.returnValue = '';
      dlg.onclose = function () { resolve(dlg.returnValue === 'ok' ? $('promptInput').value.trim() : null); };
      dlg.showModal();
      setTimeout(function () { $('promptInput').focus(); $('promptInput').select(); }, 30);
    });
  }

  var toastTimer;
  function toast(text) {
    var el = $('toast');
    el.textContent = text;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove('show'); }, 2600);
  }

  function download(name, text, type) {
    if (downloads) {
      downloads.save({ filename: name, data: text }).then(function () { toast(T('הקובץ נשמר: ') + name); }, function (err) {
        if (err && err.code !== 'declined') tell(T('לא ניתן להוריד את הקובץ כאן (') + err.code + ').');
      });
      return;
    }
    var blob = new Blob([text], { type: type });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function stamp() { return new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-'); }

  if (root.claude && typeof root.claude.use === 'function') {
    root.claude.use('downloads').then(function (d) { downloads = d; }).catch(function () {});
  }

  /** A grown-up avatar: the name's initial on a personal gradient, with the chosen symbol as a small badge. */
  var AV = [['#5ad8ff', '#4be3a4'], ['#c9b8ff', '#ff7ab6'], ['#ffd45a', '#ff9f43'], ['#4be3a4', '#2fb7ff'], ['#ff7ab6', '#ffb36b'], ['#8fa8ff', '#5ad8ff'], ['#ff8f70', '#ffd45a'], ['#7ef0c6', '#c9b8ff']];
  function avatar(p, cls) {
    if (!p) return '';
    var key = String(p.id || p.name || ''), h = 0;
    for (var i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
    var c = AV[h % AV.length], name = String(p.name || '').trim();
    var init = name ? Array.from(name)[0].toUpperCase() : '?';
    return '<span class="mono-av ' + (cls || '') + '" style="--a:' + c[0] + ';--b:' + c[1] + '"><span class="mono-init">' + esc(init) + '</span>' +
      (p.emoji ? '<span class="mono-badge" aria-hidden="true">' + esc(p.emoji) + '</span>' : '') + '</span>';
  }

  DA.ui = { avatar: avatar, ask: ask, tell: tell, prompt: prompt, toast: toast, download: download, esc: esc, stamp: stamp, $: $ };
})(typeof window !== 'undefined' ? window : globalThis);
