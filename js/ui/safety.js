/*
 * עין טובה — one consistent safety message.
 * The app does not check eye health. When a user reports lines that look bent or missing, a missing
 * area, or a calibration that changed, we say the same thing everywhere, with a clear time frame,
 * without diagnosing anything. (Expert review 2026-11: retina, neuro-ophthalmology, pediatrics, safety.)
 */
(function (root) {
  'use strict';
  var DA = root.DA;

  /** The general message (lines / distortion / missing part). */
  function text() {
    return T('עין טובה לא בודקת את בריאות העין. אם קווים נראים עקומים, גליים או חסרים, או שחלק מהמראה חסר, וזה חדש או השתנה – כדאי להתייעץ עם רופא/ת עיניים בימים הקרובים, ולא לחכות לבדיקה השגרתית. אם זה קרה פתאום – כדאי לפנות באותו יום. מי שכבר מטופל/ת במרפאת עיניים – כדאי לעדכן את המרפאה.');
  }
  /** The message after the comfort map found areas seen less. */
  function fieldText() {
    return T('עין טובה לא בודקת את בריאות העין. אם זה חדש, לא ידעת על זה או שזה השתנה – כדאי להתייעץ עם רופא/ת עיניים בימים הקרובים. אם זה קרה פתאום – כדאי לפנות לטיפול דחוף באותו יום.');
  }
  function html(kind) {
    return '<div class="referral-note" role="note"><span class="ref-icon">' + DA.icons.svg('info') + '</span><p>' +
      DA.ui.esc(kind === 'field' ? fieldText() : text()) + '</p></div>';
  }

  /**
   * Before calibrating: is the distortion new or changed? Calibrating a NEW distortion could hide a
   * symptom that needs a doctor, so we say so first, and then let the user continue.
   */
  var askedThisVisit = {};
  function askNew(profileId) {
    if (askedThisVisit[profileId]) return Promise.resolve();
    askedThisVisit[profileId] = true;
    return DA.ui.ask(T('לפני שמתחילים: האם העיוות חדש, או שהשתנה בשבועות האחרונים?'), T('כן, זה חדש או השתנה'), T('לא, זה ותיק ויציב'))
      .then(function (isNew) { if (isNew) return DA.ui.tell(text()); });
  }

  DA.safety = { text: text, fieldText: fieldText, html: html, askNew: askNew };
})(typeof window !== 'undefined' ? window : globalThis);
