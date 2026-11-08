/*
 * עין טובה — Matched sentences for the reading-speed test (MNREAD-style).
 * Each sentence is simple, everyday language for children from about grade 2, with a similar
 * length (≈52–66 characters with spaces) so reading speed can be compared between print sizes.
 * Speed is computed per character and per word, so small length differences do not matter.
 * There is no validated Hebrew MNREAD — this is a practical, matched pool, not a clinical chart.
 */
(function (root) {
  'use strict';
  var DA = (root.DA = root.DA || {});

  var HE = [
    'הילד שלי אוהב לשחק בכדור בגינה הגדולה ליד הבית שלנו בכל ערב',
    'אמא קנתה לנו תפוחים אדומים ובננות צהובות בשוק של יום שישי',
    'החתול הקטן ישן על הכרית הרכה מתחת לחלון בחדר של אחותי',
    'בבוקר אנחנו אוכלים לחם עם גבינה ושותים כוס חלב חם ומתוק',
    'המורה סיפרה לנו סיפור מצחיק על דב שלמד לרכוב על אופניים',
    'בחופש הגדול נסענו לים ובנינו ארמון גבוה מחול רטוב וצדפים',
    'סבתא אפתה עוגת שוקולד גדולה ואנחנו אכלנו אותה עד הפירור האחרון',
    'הכלב של השכנים נובח חזק כשמישהו עובר ליד השער הירוק שלהם',
    'בערב הסתכלנו בשמיים וראינו ירח מלא והרבה כוכבים קטנים ובהירים',
    'אבא תיקן את האופניים שלי והם נוסעים עכשיו מהר יותר מבעבר',
    'בגן החיות ראינו פיל ענק שותה מים ושני קופים קופצים על עץ',
    'הציפור בנתה קן קטן על העץ שליד החלון ושמה בו שלוש ביצים',
    'כשיורד גשם אני לובש מגפיים וקופץ בשלוליות עם החברים שלי',
    'בשבת נסענו לטיול בהרים ושתינו מים קרים ממעיין צלול ושקט',
    'אחי הקטן צייר בית עם גג אדום ושמש צהובה מעל עץ ירוק וגבוה',
    'הדג הכתום שוחה באקווריום בסלון ואני מאכיל אותו בכל בוקר',
    'ביום ההולדת קיבלתי ספר חדש עם תמונות של דינוזאורים ענקיים',
    'בחורף אנחנו יושבים ליד התנור ושותים תה חם עם עוגיות שקדים'
  ];
  var EN = [
    'My little brother likes to play with his red ball in the park',
    'We went to the beach and built a tall castle out of wet sand',
    'The cat is sleeping on the soft pillow next to the big window',
    'In the morning we eat bread and cheese and drink warm milk',
    'Our teacher told us a funny story about a bear on a bicycle',
    'Grandma baked a chocolate cake and we ate every single piece',
    'The dog next door barks loudly when someone walks past the gate',
    'At night we looked at the sky and saw the moon and many stars',
    'Dad fixed my bike and now it goes much faster than it did before',
    'At the zoo we saw a big elephant drink water from a small pond',
    'A little bird built a nest in the tree outside my bedroom',
    'When it rains I put on my boots and jump in all the puddles',
    'On the weekend we went hiking and drank cold water from a spring',
    'My sister drew a house with a red roof and a bright yellow sun',
    'The orange fish swims in the tank and I feed it every morning',
    'For my birthday I got a new book with pictures of dinosaurs',
    'In winter we sit by the fire and drink hot tea with cookies',
    'The children ran across the field to catch the flying kite'
  ];

  function words(s) { return s.trim().split(/\s+/).length; }

  /** A shuffled list of sentences in a language, avoiding ones in `used`. */
  function pool(lang, used) {
    var list = (lang === 'en' ? EN : HE).filter(function (s) { return !used || used.indexOf(s) < 0; });
    for (var i = list.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = list[i]; list[i] = list[j]; list[j] = t; }
    return list;
  }

  DA.sentences = { HE: HE, EN: EN, pool: pool, words: words };
})(typeof window !== 'undefined' ? window : globalThis);
