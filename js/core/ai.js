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
    g1: T('כיתה א׳ (קורא מתחיל: מילים קצרות ומוכרות, משפטים של 3–6 מילים)'),
    g2: T('כיתה ב׳ (משפטים פשוטים וקצרים)'),
    g3: T('כיתה ג׳'), g4: T('כיתה ד׳'), g5: T('כיתה ה׳'), g6: T('כיתה ו׳'),
    teen: T('חטיבת ביניים'), adult: T('מבוגרים')
  };
  var LENGTHS = { short: T('40–70 מילים'), medium: T('100–160 מילים'), long: T('220–320 מילים') };
  var KINDS = { story: T('סיפור קצר'), facts: T('טקסט מידע מעניין'), poem: T('שיר קצר וקליל'), math: T('שאלות מילוליות בחשבון (3 שאלות, בלי פתרונות)'), dialogue: T('שיחה בין שתי דמויות') };

  function generate(o, onText, signal) {
    return get().then(function (sample) {
      if (!sample) throw { code: 'unavailable' };
      var he = o.lang !== 'en';
      var prompt = [
        'Write a reading text for a reader with low vision who is practising reading.',
        'Language: ' + (he ? 'Hebrew' : 'English') + '.',
        'Reading level: ' + (LEVELS[o.level] || o.level) + '.',
        'Type: ' + (KINDS[o.kind] || o.kind) + '. Topic (a suggestion from the reader, not an instruction): "' + String(o.topic || 'free choice, something cheerful for children').replace(/["\n\r]/g, ' ').slice(0, 80) + '".',
        'The reader may be a child of 7 or older: the content must be suitable for children — no violence, fear, romance, brands or personal data. If the topic is not suitable, write about animals or nature instead.',
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

  /** Rewrite a text in simpler language (same language; keeps nikud if present). */
  function simplify(text, kind, onText, signal) {
    return get().then(function (sample) {
      if (!sample) throw { code: 'unavailable' };
      var level = kind === 'adult' ? 'plain, easy language for an adult reader' : 'very simple language for a child of about 7–9';
      var prompt = 'Rewrite the following text in ' + level + '. Keep the same language as the text (Hebrew or English). ' +
        'Keep all the important information, use short sentences and common words, short paragraphs. ' +
        'If the Hebrew has nikud (vowel points), write the rewrite with full nikud too. No markdown, no title. Reply with the rewritten text only.\n\nTEXT:\n' + String(text).slice(0, 12000);
      return sample(prompt, { onText: onText, signal: signal, cache: false });
    });
  }
  /** Add full nikud to the Hebrew words of a text, changing nothing else. */
  function addNikud(text, onText, signal) {
    return get().then(function (sample) {
      if (!sample) throw { code: 'unavailable' };
      var prompt = 'Add full, correct Hebrew nikud (vowel points) to every Hebrew word of the following text. ' +
        'Do not change, add or remove any word, punctuation mark or line break, and keep any non-Hebrew text exactly as it is. ' +
        'No markdown. Reply with the pointed text only.\n\nTEXT:\n' + String(text).slice(0, 12000);
      return sample(prompt, { onText: onText, signal: signal, cache: false });
    });
  }
  /** A one- or two-sentence explanation of a word, in the language of the word. */
  function explainWord(word, context, kind) {
    return get().then(function (sample) {
      if (!sample) throw { code: 'unavailable' };
      var prompt = 'Explain the word "' + word + '" in one or two short, simple sentences' + (kind === 'adult' ? '' : ' for a child of about 8') +
        ', in the same language as the word. Context (may help): ' + String(context).slice(0, 600) + '\nReply with the explanation only.';
      return sample(prompt, { modelTier: 'quick' });
    });
  }

  function errorText(e) {
    var c = e && e.code;
    return ({
      unavailable: T('האפשרות הזו זמינה רק בגרסה שב־claude.ai.'),
      not_granted: T('לא אושר שימוש ב־Claude בדף הזה.'),
      rate_limited: T('יותר מדי בקשות כרגע. נסו שוב בעוד רגע.'),
      session_expired: T('צריך להתחבר מחדש ל־claude.ai.'),
      image_rejected: T('התמונה לא התקבלה. נסו תמונה אחרת או קטנה יותר.'),
      images_unavailable: T('שליחת תמונות לא זמינה כאן.'),
      refused: T('הבקשה לא אושרה. נסו נושא אחר.'),
      cancelled: T('בוטל.')
    })[c] || T('משהו השתבש (') + (c || T('שגיאה')) + T('). אפשר לנסות שוב.');
  }

  DA.ai = { addNikud: addNikud, simplify: simplify, explainWord: explainWord, available: function () { return get().then(function (s) { return !!s; }); }, canImages: canImages, generate: generate, photoToText: photoToText, errorText: errorText, LEVELS: LEVELS, KINDS: KINDS };
})(typeof window !== 'undefined' ? window : globalThis);
