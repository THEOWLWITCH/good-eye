/*
 * DA — Lazy loading of optional libraries (only when a reader actually needs them).
 * Hosts are ones the claude.ai page policy allows (cdnjs, jsdelivr).
 */
(function (root) {
  'use strict';
  var DA = (root.DA = root.DA || {});
  var cache = {};

  function script(src) {
    if (cache[src]) return cache[src];
    cache[src] = new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = src; s.async = true;
      s.onload = function () { resolve(); };
      s.onerror = function () { delete cache[src]; reject(new Error(T('טעינה נכשלה: ') + src)); };
      document.head.appendChild(s);
    });
    return cache[src];
  }

  var CDN = 'https://cdnjs.cloudflare.com/ajax/libs/';

  function mammoth() {
    return script(CDN + 'mammoth/1.6.0/mammoth.browser.min.js').then(function () { return root.mammoth; });
  }

  function pdfjs() {
    // Load the worker as a plain script first: pdf.js then runs it on the main thread
    // (a cross-origin Worker is not allowed inside claude.ai).
    return script(CDN + 'pdf.js/2.16.105/pdf.worker.min.js')
      .then(function () { return script(CDN + 'pdf.js/2.16.105/pdf.min.js'); })
      .then(function () { return root.pdfjsLib; });
  }

  function mathjax() {
    if (root.MathJax && root.MathJax.typesetPromise) return Promise.resolve(root.MathJax);
    root.MathJax = root.MathJax || {
      tex: { inlineMath: [['$', '$'], ['\\(', '\\)']], displayMath: [['$$', '$$'], ['\\[', '\\]']] },
      svg: { fontCache: 'local' },
      startup: { typeset: false }
    };
    return script('https://cdn.jsdelivr.net/npm/mathjax@3.2.2/es5/tex-svg.js').then(function () {
      return root.MathJax.startup.promise.then(function () { return root.MathJax; });
    });
  }

  DA.loader = { script: script, mammoth: mammoth, pdfjs: pdfjs, mathjax: mathjax };
})(typeof window !== 'undefined' ? window : globalThis);
