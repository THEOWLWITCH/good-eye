/*
 * DA — Claude helpers (only in the published claude.ai version, via the `sample` capability):
 *  - generate reading texts by level, topic and language (optionally with nikud);
 *  - turn a photo or picture of a page into clean text (including math as LaTeX).
 * Each call uses the viewer's own Claude account and asks for consent the first time.
 */
(function (root) {
  'use strict';
  var DA = (root.DA = root.DA || {});
  var samplePromise = null;

  function get() {
    if (!samplePromise) {
      samplePromise = (root.claude && typeof root.claude.use === 'function')
        ? root.claude.use('sample').catch(function () { return null; }) : Promise.resolve(null);
    }
    return samplePromise;
  }

  function canImages() {
    return get().then(function (s) {
      if (!s || !s.limits) return false;
      return s.limits().then(function (l) { return !!(l && l.images); }, function () { return false; });
    });
  }

  var LEVELS = {
    g1: 'כיתה א׳ (קורא מתחיל: מילים קצרות ומוכרות, משפטים של 3–6 מילים)',
    g2: 'כיתה ב׳ (משפטים פשוטים וקצרים)',
    g3: 'כיתה ג׳', g4: 'כיתה ד׳', g5: 'כיתה ה׳', g6: 'כיתה ו׳',
    teen: 'חטיבת ביניים', adult: 'מבוגרים'
  };
  var LENGTHS = { short: '40–70 מילים', medium: '100–160 מילים', long: '220–320 מילים' };
  var KINDS = { story: 'סיפור קצר', facts: 'טקסט מידע מעניין', poem: 'שיר קצר וקליל', math: 'שאלות מילוליות בחשבון (3 שאלות, בלי פתרונות)', dialogue: 'שיחה בין שתי דמויות' };

  function generate(o, onText, signal) {
    return get().then(function (sample) {
      if (!sample) throw { code: 'unavailable' };
      var he = o.lang !== 'en';
      var prompt = [
        'Write a reading text for a reader with low vision who is practising reading.',
        'Language: ' + (he ? 'Hebrew' : 'English') + '.',
        'Reading level: ' + (LEVELS[o.level] || o.level) + '.',
        'Type: ' + (KINDS[o.kind] || o.kind) + '. Topic: ' + (o.topic || 'free choice, something cheerful for children') + '.',
        'Length: ' + (LENGTHS[o.length] || LENGTHS.short) + '.',
        he && o.nikud ? 'Write the Hebrew WITH full nikud (vowel points) on every word.' : '',
        'Use short paragraphs (2–4 sentences). Age-appropriate, warm and positive. No markdown symbols, no emojis.',
        o.kind === 'math' ? 'Write any numbers and expressions plainly; for anything beyond simple arithmetic use LaTeX between $ signs.' : '',
        'Reply with the title on the first line, then a blank line, then the text. Nothing else.'
      ].filter(Boolean).join('\n');
      return sample(prompt, { onText: onText, signal: signal, cache: false });
    });
  }

  function photoToText(blob, onText, signal) {
    return get().then(function (sample) {
      if (!sample) throw { code: 'unavailable' };
      var prompt = 'The image is a photo or scan of a page that a reader with low vision wants to read. ' +
        'Transcribe ALL readable text exactly, in its original language(s) (Hebrew, English or other), keeping the reading order and paragraphs. ' +
        'Keep Hebrew nikud if present. Write mathematical expressions as LaTeX between $ signs (or $$ for display formulas). ' +
        'For a picture, chart or drawing with no text, write one short line in square brackets describing it, in the page language. ' +
        'Reply with the transcription only, no introduction.';
      return sample(prompt, { images: [blob], onText: onText, signal: signal, modelTier: 'default' });
    });
  }

  function errorText(e) {
    var c = e && e.code;
    return ({
      unavailable: 'האפשרות הזו זמינה רק בגרסה שב־claude.ai.',
      not_granted: 'לא אושר שימוש ב־Claude בדף הזה.',
      rate_limited: 'יותר מדי בקשות כרגע. נסו שוב בעוד רגע.',
      session_expired: 'צריך להתחבר מחדש ל־claude.ai.',
      image_rejected: 'התמונה לא התקבלה. נסו תמונה אחרת או קטנה יותר.',
      images_unavailable: 'שליחת תמונות לא זמינה כאן.',
      refused: 'הבקשה לא אושרה. נסו נושא אחר.',
      cancelled: 'בוטל.'
    })[c] || 'משהו השתבש (' + (c || 'שגיאה') + '). אפשר לנסות שוב.';
  }

  DA.ai = { available: function () { return get().then(function (s) { return !!s; }); }, canImages: canImages, generate: generate, photoToText: photoToText, errorText: errorText, LEVELS: LEVELS, KINDS: KINDS };
})(typeof window !== 'undefined' ? window : globalThis);
