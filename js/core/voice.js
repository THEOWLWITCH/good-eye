/*
 * עין טובה — Voice commands for the reader (where the browser supports speech recognition, e.g.
 * Chrome / Edge / Android; not inside claude.ai, which blocks the microphone).
 * Say: "גדול יותר", "קטן יותר", "תקריא", "עצור", "הבא", "הקודם", "צבעים", "סרגל", "המצב שלי"
 *  or: "bigger", "smaller", "read", "stop", "next", "back", "colors", "ruler", "my mode".
 * Audio is handled by the browser's own speech service; the app only receives the words.
 */
(function (root) {
  'use strict';
  var DA = (root.DA = root.DA || {});
  var Rec = root.SpeechRecognition || root.webkitSpeechRecognition;
  var rec = null, on = false, handler = null;

  var COMMANDS = [
    ['bigger', /(גדול|הגדל|תגדיל|bigger|larger|zoom in)/i],
    ['smaller', /(קטן|הקטן|תקטין|smaller|zoom out)/i],
    ['read', /(תקריא|הקרא|קרא|read|speak)/i],
    ['stop', /(עצור|די|תפסיק|שקט|stop|quiet)/i],
    ['next', /(הבא|הלאה|קדימה|next|forward)/i],
    ['back', /(הקודם|אחורה|חזור|back|previous)/i],
    ['colors', /(צבע|צבעים|colou?rs?)/i],
    ['ruler', /(סרגל|ruler)/i],
    ['best', /(המצב שלי|my mode|best)/i]
  ];

  function supported() { return !!Rec && !(root.claude && root.claude.use); }

  function start(lang, onCommand, onState) {
    if (!supported()) return false;
    handler = onCommand;
    rec = new Rec();
    rec.lang = lang === 'en' ? 'en-US' : 'he-IL';
    rec.continuous = true;
    rec.interimResults = false;
    rec.onresult = function (e) {
      var said = e.results[e.results.length - 1][0].transcript.trim();
      for (var i = 0; i < COMMANDS.length; i++) if (COMMANDS[i][1].test(said)) { handler(COMMANDS[i][0], said); return; }
      handler(null, said);
    };
    rec.onend = function () { if (on) { try { rec.start(); } catch (e) { /* restarting */ } } else if (onState) onState(false); };
    rec.onerror = function (e) { if (e.error === 'not-allowed' || e.error === 'service-not-allowed') { on = false; if (onState) onState(false, e.error); } };
    on = true;
    try { rec.start(); } catch (e) { on = false; return false; }
    if (onState) onState(true);
    return true;
  }
  function stop() { on = false; if (rec) try { rec.stop(); } catch (e) { /* ignore */ } }

  DA.voice = { supported: supported, start: start, stop: stop, isOn: function () { return on; } };
})(typeof window !== 'undefined' ? window : globalThis);
