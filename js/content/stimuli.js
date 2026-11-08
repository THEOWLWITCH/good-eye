/*
 * DA — Stimulus library for the learning / verification game.
 * Categories (as requested): digit, silhouette, line drawing, colour drawing, letter, word, sentence,
 * in Hebrew and English. Every item has an answer that a child can pick from big buttons.
 */
(function (root) {
  'use strict';
  var DA = (root.DA = root.DA || {});

  var LINE_SVG = {
    house: '<path d="M12 50 L50 16 L88 50"/><path d="M24 44 V86 H76 V44"/><path d="M43 86 V64 H57 V86"/>',
    sun: '<circle cx="50" cy="50" r="17"/>' + [0, 45, 90, 135, 180, 225, 270, 315].map(function (a) {
      var r = a * Math.PI / 180;
      return '<path d="M' + (50 + 26 * Math.cos(r)).toFixed(1) + ' ' + (50 + 26 * Math.sin(r)).toFixed(1) +
        ' L' + (50 + 40 * Math.cos(r)).toFixed(1) + ' ' + (50 + 40 * Math.sin(r)).toFixed(1) + '"/>';
    }).join(''),
    fish: '<path d="M16 50 Q42 22 68 50 Q42 78 16 50 Z"/><path d="M68 50 L88 34 L88 66 Z"/><circle cx="30" cy="46" r="3"/>',
    tree: '<path d="M44 92 V62 M56 92 V62"/><circle cx="50" cy="38" r="25"/>',
    star: '<path d="M50 10 L61 38 L91 38 L67 56 L76 86 L50 68 L24 86 L33 56 L9 38 L39 38 Z"/>',
    heart: '<path d="M50 84 C12 60 10 26 32 22 C42 20 48 27 50 34 C52 27 58 20 68 22 C90 26 88 60 50 84 Z"/>',
    moon: '<path d="M60 12 A38 38 0 1 0 60 88 A30 30 0 1 1 60 12 Z"/>',
    flower: '<circle cx="50" cy="40" r="7"/>' + [0, 72, 144, 216, 288].map(function (a) {
      var r = (a - 90) * Math.PI / 180;
      return '<circle cx="' + (50 + 17 * Math.cos(r)).toFixed(1) + '" cy="' + (40 + 17 * Math.sin(r)).toFixed(1) + '" r="10"/>';
    }).join('') + '<path d="M50 58 V94"/>'
  };
  var LINE_ITEMS = [
    { id: 'house', emoji: '🏠', he: 'בית', en: 'house' }, { id: 'sun', emoji: '☀️', he: 'שמש', en: 'sun' },
    { id: 'fish', emoji: '🐟', he: 'דג', en: 'fish' }, { id: 'tree', emoji: '🌳', he: 'עץ', en: 'tree' },
    { id: 'star', emoji: '⭐', he: 'כוכב', en: 'star' }, { id: 'heart', emoji: '❤️', he: 'לב', en: 'heart' },
    { id: 'moon', emoji: '🌙', he: 'ירח', en: 'moon' }, { id: 'flower', emoji: '🌸', he: 'פרח', en: 'flower' }
  ];

  var ANIMALS = [
    { id: 'elephant', emoji: '🐘' }, { id: 'giraffe', emoji: '🦒' }, { id: 'rabbit', emoji: '🐇' },
    { id: 'turtle', emoji: '🐢' }, { id: 'butterfly', emoji: '🦋' }, { id: 'dog', emoji: '🐕' },
    { id: 'cat', emoji: '🐈' }, { id: 'rooster', emoji: '🐓' }, { id: 'horse', emoji: '🐎' }, { id: 'snail', emoji: '🐌' }
  ];
  var COLOR_ITEMS = [
    { id: 'apple', emoji: '🍎' }, { id: 'banana', emoji: '🍌' }, { id: 'grapes', emoji: '🍇' },
    { id: 'strawberry', emoji: '🍓' }, { id: 'car', emoji: '🚗' }, { id: 'ball', emoji: '⚽' },
    { id: 'balloon', emoji: '🎈' }, { id: 'carrot', emoji: '🥕' }, { id: 'bike', emoji: '🚲' }, { id: 'watermelon', emoji: '🍉' }
  ];

  var WORDS = [
    { he: 'כלב', en: 'dog', emoji: '🐕' }, { he: 'חתול', en: 'cat', emoji: '🐈' }, { he: 'בית', en: 'house', emoji: '🏠' },
    { he: 'שמש', en: 'sun', emoji: '☀️' }, { he: 'עץ', en: 'tree', emoji: '🌳' }, { he: 'דג', en: 'fish', emoji: '🐟' },
    { he: 'פרח', en: 'flower', emoji: '🌸' }, { he: 'ספר', en: 'book', emoji: '📖' }, { he: 'כדור', en: 'ball', emoji: '⚽' },
    { he: 'תפוח', en: 'apple', emoji: '🍎' }, { he: 'ירח', en: 'moon', emoji: '🌙' }, { he: 'מכונית', en: 'car', emoji: '🚗' },
    { he: 'ציפור', en: 'bird', emoji: '🐦' }, { he: 'עוגה', en: 'cake', emoji: '🎂' }, { he: 'מטריה', en: 'umbrella', emoji: '☂️' },
    { he: 'שעון', en: 'clock', emoji: '⏰' }
  ];

  var SENTENCES = [
    { he: 'החתול שותה חלב בבוקר', en: 'The cat drinks milk in the morning', emoji: '🐈' },
    { he: 'הילדה בונה ארמון בחול', en: 'The girl builds a castle in the sand', emoji: '🏰' },
    { he: 'אבא נוהג במכונית אדומה', en: 'Dad drives a red car', emoji: '🚗' },
    { he: 'הציפור שרה על העץ', en: 'The bird sings in the tree', emoji: '🐦' },
    { he: 'אכלנו עוגה ביום ההולדת', en: 'We ate cake on the birthday', emoji: '🎂' },
    { he: 'הדג שוחה במים הכחולים', en: 'The fish swims in the blue water', emoji: '🐟' },
    { he: 'יורד גשם ואני פותח מטריה', en: 'It is raining so I open an umbrella', emoji: '☂️' },
    { he: 'הירח מאיר בשמי הלילה', en: 'The moon shines in the night sky', emoji: '🌙' },
    { he: 'הכדור התגלגל אל השער', en: 'The ball rolled into the goal', emoji: '⚽' },
    { he: 'הפרח הצהוב צומח בגינה', en: 'The yellow flower grows in the garden', emoji: '🌻' }
  ];

  var HE_LETTERS = 'אבגדהוזחטיכלמנסעפצקרשת'.split('');
  // Visually confusable Hebrew letters — used as distractors to make the task diagnostic.
  var HE_CONFUSE = { 'ב': 'כפ', 'כ': 'בפ', 'ד': 'רך', 'ר': 'דך', 'ו': 'זןי', 'ז': 'וןנ', 'ה': 'חת', 'ח': 'הת', 'ת': 'החמ', 'ס': 'םט', 'ג': 'נצ', 'נ': 'גכ', 'מ': 'טס', 'ט': 'מס', 'ע': 'צש', 'צ': 'עג', 'י': 'ו', 'ש': 'ע' };
  var EN_LETTERS = 'CDHKNORSVZ'.split(''); // Sloan letters (standard on acuity charts)
  var EN_CONFUSE = { C: 'OD', O: 'CDQ', D: 'OCH', H: 'NK', N: 'HKZ', K: 'HNR', R: 'KN', S: 'ZC', Z: 'SN', V: 'NK' };
  var DIGITS = '23456789'.split('');
  var DIGIT_CONFUSE = { '3': '85', '8': '36', '5': '63', '6': '58', '9': '64', '4': '97', '2': '73', '7': '24' };

  var CATEGORIES = [
    { id: 'digit', label: 'ספרה', icon: '🔢' },
    { id: 'silhouette', label: 'צללית', icon: '👤' },
    { id: 'line', label: 'ציור קווים', icon: '✏️' },
    { id: 'color', label: 'ציור צבעוני', icon: '🎨' },
    { id: 'letter-he', label: 'אות בעברית', icon: 'א' },
    { id: 'letter-en', label: 'אות באנגלית', icon: 'A' },
    { id: 'word-he', label: 'מילה בעברית', icon: '📝' },
    { id: 'word-en', label: 'מילה באנגלית', icon: '🔤' },
    { id: 'sentence-he', label: 'משפט בעברית', icon: '📖' },
    { id: 'sentence-en', label: 'משפט באנגלית', icon: '📘' }
  ];

  function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
  function shuffle(a) { a = a.slice(); for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; } return a; }

  /** Choose 4 options: the target, confusable look-alikes first, then random others. */
  function options(target, pool, confuse) {
    var out = [target], extra = shuffle((confuse && confuse[target]) ? confuse[target].split('') : []);
    extra.forEach(function (c) { if (out.length < 3 && out.indexOf(c) < 0 && pool.indexOf(c) >= 0) out.push(c); });
    shuffle(pool).forEach(function (c) { if (out.length < 4 && out.indexOf(c) < 0) out.push(c); });
    return shuffle(out);
  }

  /**
   * Make one trial of a category. Returns:
   *  { category, key, html(sizePx) -> stimulus HTML, choices:[{key, html}], answer:key, dir, kind }
   * `kind` = 'glyph' (size refers to letter height) or 'picture' (size refers to picture box).
   */
  function make(category, avoidKey) {
    var t, tries = 0;
    do { t = make1(category); } while (t.answer === avoidKey && ++tries < 5);
    return t;
  }

  function make1(category) {
    var it, opts;
    switch (category) {
      case 'digit':
        it = pick(DIGITS); opts = options(it, DIGITS, DIGIT_CONFUSE);
        return glyph(category, it, opts, 'ltr');
      case 'letter-he':
        it = pick(HE_LETTERS); opts = options(it, HE_LETTERS, HE_CONFUSE);
        return glyph(category, it, opts, 'rtl');
      case 'letter-en':
        it = pick(EN_LETTERS); opts = options(it, EN_LETTERS, EN_CONFUSE);
        return glyph(category, it, opts, 'ltr');
      case 'silhouette':
        it = pick(ANIMALS);
        return picture(category, it.id, function (s) { return emojiHtml(it.emoji, s, 'sil'); },
          optionObjs(it, ANIMALS).map(function (o) { return { key: o.id, html: o.emoji }; }));
      case 'color':
        it = pick(COLOR_ITEMS);
        return picture(category, it.id, function (s) { return emojiHtml(it.emoji, s, ''); },
          optionObjs(it, COLOR_ITEMS).map(function (o) { return { key: o.id, html: o.emoji }; }));
      case 'line':
        it = pick(LINE_ITEMS);
        return picture(category, it.id, function (s) { return lineSvg(it.id, s); },
          optionObjs(it, LINE_ITEMS).map(function (o) { return { key: o.id, html: o.emoji }; }));
      case 'word-he': case 'word-en':
        var lang = category.slice(-2);
        it = pick(WORDS);
        return {
          category: category, kind: 'glyph', answer: it.emoji, dir: lang === 'he' ? 'rtl' : 'ltr',
          html: function (s) { return '<span class="stim-text" dir="' + (lang === 'he' ? 'rtl' : 'ltr') + '" style="font-size:' + s + 'px">' + it[lang] + '</span>'; },
          choices: optionObjs(it, WORDS, 'emoji').map(function (o) { return { key: o.emoji, html: o.emoji }; })
        };
      case 'sentence-he': case 'sentence-en':
        var lg = category.slice(-2);
        it = pick(SENTENCES);
        return {
          category: category, kind: 'glyph', answer: it.emoji, dir: lg === 'he' ? 'rtl' : 'ltr',
          html: function (s) { return '<span class="stim-text stim-sentence" dir="' + (lg === 'he' ? 'rtl' : 'ltr') + '" style="font-size:' + s + 'px">' + it[lg] + '</span>'; },
          choices: optionObjs(it, SENTENCES, 'emoji').map(function (o) { return { key: o.emoji, html: o.emoji }; })
        };
    }
    throw new Error('unknown category ' + category);
  }

  function glyph(category, it, opts, dir) {
    return {
      category: category, kind: 'glyph', answer: it, dir: dir,
      html: function (s) { return '<span class="stim-text" dir="' + dir + '" style="font-size:' + s + 'px">' + it + '</span>'; },
      choices: opts.map(function (o) { return { key: o, html: o }; })
    };
  }
  function picture(category, key, htmlFn, choices) {
    return { category: category, kind: 'picture', answer: key, html: htmlFn, choices: choices };
  }
  function optionObjs(it, pool, keyField) {
    keyField = keyField || 'id';
    var others = shuffle(pool.filter(function (o) { return o[keyField] !== it[keyField]; })).slice(0, 3);
    return shuffle([it].concat(others));
  }
  function emojiHtml(e, s, cls) {
    return '<span class="stim-emoji ' + cls + '" style="font-size:' + Math.round(s * 0.85) + 'px">' + e + '</span>';
  }
  function lineSvg(id, s) {
    return '<svg class="stim-svg" width="' + s + '" height="' + s + '" viewBox="0 0 100 100" fill="none" stroke="currentColor" ' +
      'stroke-width="6" stroke-linecap="round" stroke-linejoin="round">' + LINE_SVG[id] + '</svg>';
  }

  /** A short sample text for side-by-side preference comparisons. */
  function sampleText(lang) {
    var s = pick(SENTENCES);
    return lang === 'en' ? s.en : s.he;
  }

  DA.stimuli = { CATEGORIES: CATEGORIES, make: make, sampleText: sampleText, WORDS: WORDS, SENTENCES: SENTENCES, lineSvg: lineSvg };
})(typeof window !== 'undefined' ? window : globalThis);
