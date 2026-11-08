/*
 * עין טובה — Reading aids for understanding: syllables (approximate) and a small picture dictionary.
 * Syllables: pointed Hebrew (a new syllable starts at each letter that carries a vowel) and English
 * (vowel groups). Unpointed Hebrew is left as is. These are reading supports, not linguistics.
 */
(function (root) {
  'use strict';
  var DA = (root.DA = root.DA || {});
  var HEB_LETTER = /[א-ת]/;
  var MARK = /[֑-ׇ]/;
  var VOWEL = /[ֱ-ׇֻ]/;   // hataf vowels … qubuts, qamats qatan (not shva 05B0, not dagesh 05BC or shin/sin dots)

  function hebrewSyllables(word) {
    if (!/[ְ-ׇּ]/.test(word)) return [word];          // no nikud: leave as is
    var units = [], i = 0;
    while (i < word.length) {
      var u = word[i++];
      while (i < word.length && MARK.test(word[i])) u += word[i++];
      units.push(u);
    }
    var hasV = function (u) {
      if (VOWEL.test(u)) return true;
      if (u[0] === 'ו' && /ּ/.test(u) && !/[ְ-ֻ]/.test(u)) return true;   // shuruk
      if (u[0] === 'ו' && /ֹ/.test(u)) return true;                                  // holam male
      if (/ו[ֹּ]/.test(u.slice(1))) return true;                        // a vowel-carrying vav merged into this consonant
      return false;
    };
    // A vav that only carries a vowel (holam male / shuruk) belongs to the consonant before it: שָׁ|לוֹם, תַּ|פּוּחַ
    var own = function (u) { return VOWEL.test(u) && !(u[0] === 'ו' && (/ֹ/.test(u) || /ּ/.test(u)) && !/[ְ-ֻ]/.test(u)); };
    for (var j = units.length - 1; j > 0; j--) {
      var w = units[j], prev = units[j - 1];
      var mater = w[0] === 'ו' && (/ֹ/.test(w) || (/ּ/.test(w) && !/[ְ-ֻ]/.test(w))) && !/[ְ-ֻ]/.test(w.replace('ֹ', ''));
      if (mater && HEB_LETTER.test(prev[0]) && !own(prev)) { units[j - 1] = prev + w; units.splice(j, 1); }
    }
    // furtive patah under a final ח / ע / הּ is read before the consonant: no syllable of its own
    var last = units[units.length - 1];
    var furtive = units.length > 1 && /^[חעה]/.test(last) && /ַ/.test(last) && !/[ְ-ֶָ-ֻ]/.test(last);
    var out = [], cur = '', curV = false;
    units.forEach(function (u, idx) {
      var v = HEB_LETTER.test(u[0]) && hasV(u) && !(furtive && idx === units.length - 1);
      if (v && curV) { out.push(cur); cur = ''; curV = false; }
      cur += u; if (v) curV = true;
    });
    if (cur) out.push(cur);
    return out;
  }

  function englishSyllables(word) {
    var m = word.match(/[^aeiouy]*[aeiouy]+(?:[^aeiouy]*$|[^aeiouy](?=[^aeiouy]))?/gi);
    if (!m || m.join('') !== word) return [word];
    // keep ph / th / sh / ch / wh together: e|le|phant, not e|lep|hant
    for (var i = 0; i < m.length - 1; i++) {
      if (/[ptscw]$/i.test(m[i]) && /^h/i.test(m[i + 1]) && m[i].length > 1) { m[i + 1] = m[i].slice(-1) + m[i + 1]; m[i] = m[i].slice(0, -1); }
    }
    var n = m.length;
    // consonant + "le" at the end is a syllable of its own: ta|ble
    if (n > 1 && /^le$/i.test(m[n - 1]) && /[^aeiouy]$/i.test(m[n - 2])) { m[n - 1] = m[n - 2].slice(-1) + m[n - 1]; m[n - 2] = m[n - 2].slice(0, -1); }
    // silent final e: cake is one syllable
    else if (n > 1 && /^[^aeiouy]+e$/i.test(m[n - 1])) { m[n - 2] += m[n - 1]; m.pop(); }
    return m.filter(Boolean);
  }

  function syllables(word) {
    if (/[֐-׿]/.test(word)) return hebrewSyllables(word);
    if (/^[A-Za-z']+[.,!?;:]*$/.test(word)) {
      var core = word.replace(/[.,!?;:]+$/, ''), tail = word.slice(core.length);
      var s = englishSyllables(core);
      if (tail) s[s.length - 1] += tail;
      return s;
    }
    return [word];
  }

  // ---------- picture dictionary ----------
  var DICT = {
    'כלב': '🐕', 'חתול': '🐈', 'בית': '🏠', 'שמש': '☀️', 'עץ': '🌳', 'דג': '🐟', 'פרח': '🌸', 'ספר': '📖', 'כדור': '⚽', 'תפוח': '🍎',
    'ירח': '🌙', 'מכונית': '🚗', 'אוטו': '🚗', 'ציפור': '🐦', 'עוגה': '🎂', 'מטריה': '☂️', 'שעון': '⏰', 'ים': '🌊', 'חול': '🏖️', 'ארמון': '🏰',
    'גשם': '🌧️', 'שלג': '❄️', 'כוכב': '⭐', 'כוכבים': '✨', 'לב': '❤️', 'חלב': '🥛', 'לחם': '🍞', 'גבינה': '🧀', 'ביצה': '🥚', 'ביצים': '🥚',
    'בננה': '🍌', 'בננות': '🍌', 'ענבים': '🍇', 'תות': '🍓', 'אבטיח': '🍉', 'גזר': '🥕', 'אופניים': '🚲', 'אוטובוס': '🚌', 'רכבת': '🚆', 'מטוס': '✈️',
    'סוס': '🐎', 'פרה': '🐄', 'כבשה': '🐑', 'תרנגול': '🐓', 'ארנב': '🐇', 'צב': '🐢', 'פיל': '🐘', 'ג׳ירפה': '🦒', 'אריה': '🦁', 'קוף': '🐒',
    'קופים': '🐒', 'דב': '🐻', 'פרפר': '🦋', 'דבורה': '🐝', 'נמלה': '🐜', 'חלון': '🪟', 'דלת': '🚪', 'כיסא': '🪑', 'שולחן': '🍽️', 'מיטה': '🛏️',
    'כרית': '🛏️', 'בלון': '🎈', 'מתנה': '🎁', 'עפרון': '✏️', 'מחברת': '📓', 'תיק': '🎒', 'נעליים': '👟', 'מגפיים': '👢', 'כובע': '🧢', 'משקפיים': '👓',
    'עין': '👁️', 'יד': '✋', 'רגל': '🦶', 'אוזן': '👂', 'אף': '👃', 'פה': '👄', 'ילד': '🧒', 'ילדה': '👧', 'אמא': '👩', 'אבא': '👨',
    'סבתא': '👵', 'סבא': '👴', 'תינוק': '👶', 'מורה': '🧑‍🏫', 'רופא': '🧑‍⚕️', 'הר': '⛰️', 'הרים': '⛰️', 'נהר': '🏞️', 'מעיין': '💧', 'מים': '💧',
    'אש': '🔥', 'קשת': '🌈', 'ענן': '☁️', 'שמיים': '🌌', 'לילה': '🌙', 'בוקר': '🌅', 'גינה': '🌷', 'שוק': '🛒', 'גן': '🌳', 'דינוזאור': '🦖',
    'דינוזאורים': '🦖', 'כדורגל': '⚽', 'מוזיקה': '🎵', 'שיר': '🎶', 'טלפון': '📱', 'מחשב': '💻', 'עיפרון': '✏️', 'תה': '🍵', 'עוגייה': '🍪', 'עוגיות': '🍪',
    'dog': '🐕', 'cat': '🐈', 'house': '🏠', 'sun': '☀️', 'tree': '🌳', 'fish': '🐟', 'flower': '🌸', 'book': '📖', 'ball': '⚽', 'apple': '🍎',
    'moon': '🌙', 'car': '🚗', 'bird': '🐦', 'cake': '🎂', 'umbrella': '☂️', 'clock': '⏰', 'sea': '🌊', 'beach': '🏖️', 'sand': '🏖️', 'castle': '🏰',
    'rain': '🌧️', 'snow': '❄️', 'star': '⭐', 'stars': '✨', 'heart': '❤️', 'milk': '🥛', 'bread': '🍞', 'cheese': '🧀', 'egg': '🥚', 'banana': '🍌',
    'grapes': '🍇', 'strawberry': '🍓', 'carrot': '🥕', 'bike': '🚲', 'bicycle': '🚲', 'bus': '🚌', 'train': '🚆', 'plane': '✈️', 'horse': '🐎', 'cow': '🐄',
    'sheep': '🐑', 'rabbit': '🐇', 'turtle': '🐢', 'elephant': '🐘', 'giraffe': '🦒', 'lion': '🦁', 'monkey': '🐒', 'bear': '🐻', 'butterfly': '🦋', 'bee': '🐝',
    'window': '🪟', 'door': '🚪', 'chair': '🪑', 'bed': '🛏️', 'pillow': '🛏️', 'balloon': '🎈', 'gift': '🎁', 'pencil': '✏️', 'bag': '🎒', 'shoes': '👟',
    'boots': '👢', 'hat': '🧢', 'glasses': '👓', 'eye': '👁️', 'hand': '✋', 'boy': '🧒', 'girl': '👧', 'mom': '👩', 'dad': '👨', 'baby': '👶',
    'teacher': '🧑‍🏫', 'doctor': '🧑‍⚕️', 'mountain': '⛰️', 'river': '🏞️', 'water': '💧', 'fire': '🔥', 'rainbow': '🌈', 'cloud': '☁️', 'sky': '🌌', 'night': '🌙',
    'garden': '🌷', 'park': '🌳', 'zoo': '🦁', 'dinosaur': '🦖', 'dinosaurs': '🦖', 'football': '⚽', 'music': '🎵', 'phone': '📱', 'computer': '💻', 'tea': '🍵',
    'cookie': '🍪', 'cookies': '🍪', 'kite': '🪁', 'nest': '🪺', 'puddles': '💦', 'spring': '💧', 'fire': '🔥'
  };

  function normalize(word) {
    return String(word).replace(/[֑-ׇ]/g, '').replace(/[^א-תA-Za-z׳']/g, '').toLowerCase();
  }
  /** Look a word up, trying common Hebrew prefixes (ה ו ב ל מ ש כ) and plural endings. */
  function lookup(word) {
    var w = normalize(word);
    if (!w) return null;
    if (DICT[w]) return DICT[w];
    var tries = [w];
    if (/[א-ת]/.test(w)) {
      for (var k = 0; k < 2 && tries[tries.length - 1].length > 2; k++) {
        var t = tries[tries.length - 1];
        if ('הובלמשכ'.indexOf(t[0]) >= 0) tries.push(t.slice(1));
      }
      tries.slice().forEach(function (t) { if (/(ים|ות)$/.test(t)) tries.push(t.slice(0, -2)); });
    } else {
      if (/s$/.test(w)) tries.push(w.slice(0, -1));
    }
    for (var i = 0; i < tries.length; i++) if (DICT[tries[i]]) return DICT[tries[i]];
    return null;
  }

  DA.readaids = { syllables: syllables, hebrewSyllables: hebrewSyllables, englishSyllables: englishSyllables, lookup: lookup, normalize: normalize };
})(typeof window !== 'undefined' ? window : globalThis);
