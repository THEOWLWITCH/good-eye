/*
 * Good Eye / עין טובה — interface language (Hebrew or English).
 * Hebrew is the source text; T('hebrew') returns the English version when the UI is in English.
 * Static page text is translated once at start (apply). Switching language reloads the page.
 */
(function (root) {
  'use strict';
  var DA = (root.DA = root.DA || {});
  var KEY = 'da.v1.lang';
  var HEB = /[֐-׿]/;
  var lang = 'he';
  try {
    var saved = root.localStorage && root.localStorage.getItem(KEY);
    if (saved === 'he' || saved === 'en') lang = saved;
    else if (root.navigator && !/^he|^iw/i.test(root.navigator.language || 'he')) lang = 'en';
  } catch (e) { /* storage blocked: keep default */ }

  function dict() { return DA.i18nEN || {}; }

  function t(s) {
    if (lang === 'he' || s == null) return s;
    var v = dict()[s];
    return v ? v : s;
  }

  /** Translate static text nodes and placeholder/title attributes under an element. */
  function apply(el) {
    if (lang === 'he' || !el) return;
    var D = dict();
    var walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, {
      acceptNode: function (n) {
        if (!HEB.test(n.nodeValue)) return NodeFilter.FILTER_REJECT;
        for (var p = n.parentElement; p; p = p.parentElement) {
          if (p.hasAttribute && p.hasAttribute('data-noi18n')) return NodeFilter.FILTER_REJECT;
          if (p.tagName === 'SCRIPT' || p.tagName === 'STYLE') return NodeFilter.FILTER_REJECT;
        }
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    var nodes = [], n;
    while ((n = walker.nextNode())) nodes.push(n);
    nodes.forEach(function (node) {
      var raw = node.nodeValue, key = raw.split(/\s+/).join(' ').trim();
      if (D[key]) {
        var lead = /^\s/.test(raw) ? ' ' : '', trail = /\s$/.test(raw) ? ' ' : '';
        node.nodeValue = lead + D[key] + trail;
      }
    });
    el.querySelectorAll('[placeholder],[title],[aria-label]').forEach(function (e) {
      if (e.closest('[data-noi18n]')) return;
      ['placeholder', 'title', 'aria-label'].forEach(function (a) {
        var v = e.getAttribute(a);
        if (v && HEB.test(v) && D[v.trim()]) e.setAttribute(a, D[v.trim()]);
      });
    });
  }

  function setLang(l) {
    try { root.localStorage.setItem(KEY, l); } catch (e) { /* ignore */ }
    root.location.reload();
  }

  if (root.document) {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === 'he' ? 'rtl' : 'ltr';
  }

  root.T = t;
  DA.i18n = {
    lang: lang,
    t: t,
    apply: apply,
    setLang: setLang,
    dir: lang === 'he' ? 'rtl' : 'ltr',
    locale: lang === 'he' ? 'he-IL' : 'en-GB',
    /** Language for content (texts, stimuli) that follows the UI language. */
    content: lang === 'he' ? 'he' : 'en'
  };
})(typeof window !== 'undefined' ? window : globalThis);
