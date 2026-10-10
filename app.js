"use strict";

var START = "2026-10-05";
var EXAM = "2026-12-06";
/* Practical-practice days. A new unit is not scheduled on these dates.
   None are marked, so units run on consecutive days after 5 October. */
var PRACTICAL_PRACTICE = [];

function bucharestParts(d) {
  var parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Bucharest",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(d || new Date());
  var g = {};
  parts.forEach(function (p) { g[p.type] = p.value; });
  return g;
}

function todayISO(d) {
  var g = bucharestParts(d);
  return g.year + "-" + g.month + "-" + g.day;
}

function addDays(iso, n) {
  var p = iso.split("-").map(Number);
  var dt = new Date(Date.UTC(p[0], p[1] - 1, p[2]));
  dt.setUTCDate(dt.getUTCDate() + n);
  var m = String(dt.getUTCMonth() + 1).padStart(2, "0");
  var day = String(dt.getUTCDate()).padStart(2, "0");
  return dt.getUTCFullYear() + "-" + m + "-" + day;
}

function daysBetween(a, b) {
  var pa = a.split("-").map(Number);
  var pb = b.split("-").map(Number);
  var ua = Date.UTC(pa[0], pa[1] - 1, pa[2]);
  var ub = Date.UTC(pb[0], pb[1] - 1, pb[2]);
  return Math.round((ub - ua) / 86400000);
}

function isPractical(iso) {
  return PRACTICAL_PRACTICE.indexOf(iso) !== -1;
}

/* Walk the calendar from 5 October. Day 1 is the page review.
   Then Unit 1–45, skipping practical-practice days.
   Then three mock-test days. After that, "Mocks done". */
function planFor(today) {
  if (today < START) {
    return { kind: "before", label: "No unit today" };
  }
  var unit = 0;
  var mocks = 0;
  var phase = "review";
  var d = START;
  var result = { kind: "review", label: "Review drills for pages 10-14" };
  while (d <= today) {
    if (d === START) {
      result = { kind: "review", label: "Review drills for pages 10-14" };
      phase = "units";
    } else if (phase === "units" && isPractical(d)) {
      result = { kind: "practice", label: "Practical practice" };
    } else if (phase === "units" && unit < 45) {
      unit += 1;
      result = { kind: "unit", label: "Unit " + unit, unit: unit };
      if (unit === 45) phase = "mocks";
    } else if (phase === "mocks" && mocks < 3) {
      mocks += 1;
      result = { kind: "mock", label: "Mock test " + mocks, mock: mocks };
      if (mocks === 3) phase = "done";
    } else if (phase === "units") {
      result = { kind: "unit", label: "Unit " + unit, unit: unit };
    } else {
      result = { kind: "done", label: "Mocks done" };
    }
    if (d === today) break;
    d = addDays(d, 1);
  }
  return result;
}

function blankProgress() {
  return { version: 2, words: [], mistakes: [], doneDays: {}, chapters: [], grammarChapters: [], drillLog: [], completions: [], stats: { days: {} } };
}

function newId(prefix) {
  return (prefix || "id") + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function splitPasteLine(line) {
  var s = String(line || "").trim();
  if (!s) return null;
  var parts;
  if (s.indexOf("\t") !== -1) parts = s.split("\t");
  else if (s.indexOf("|") !== -1) parts = s.split("|");
  else if (s.indexOf(",") !== -1) parts = s.split(",");
  else return null;
  parts = parts.map(function (p) { return p.trim(); }).filter(function (p, i, arr) {
    return p || i < 3;
  });
  while (parts.length && parts[parts.length - 1] === "") parts.pop();
  if (parts.length < 3) return null;
  return {
    kanji: parts[0],
    reading: parts[1],
    english: parts[2],
    example: parts.slice(3).join(" ").trim()
  };
}

function parsePaste(text) {
  var rows = [];
  var skipped = 0;
  String(text || "").split(/\r?\n/).forEach(function (line) {
    var t = line.trim();
    if (!t) return;
    var row = splitPasteLine(t);
    if (!row || !row.kanji || !row.reading || !row.english) {
      skipped += 1;
      return;
    }
    rows.push(row);
  });
  return { rows: rows, skipped: skipped };
}

/* Add-word bulk paste. Blocks separated by blank lines, 3-4 lines each:
   word / reading / meaning / optional example. A single line "word | reading | meaning | example"
   (or tab-separated) also works. Commas are NOT separators here, so "plain, sober" stays one meaning. */
function parseBulkWords(text) {
  var rows = [];
  var bad = [];
  String(text || "").replace(/\r\n?/g, "\n").split(/\n[ \t\u3000]*\n/).forEach(function (block) {
    var lines = block.split("\n").map(function (l) { return l.replace(/^[\s\u3000]+|[\s\u3000]+$/g, ""); }).filter(Boolean);
    var loose = [];
    function flush() {
      if (!loose.length) return;
      if (loose.length >= 3 && loose.length <= 4) {
        rows.push({ kanji: loose[0], reading: loose[1], english: loose[2], example: loose[3] || "" });
      } else bad.push(loose[0]);
      loose = [];
    }
    lines.forEach(function (line) {
      var hasTab = line.indexOf("\t") !== -1;
      if (hasTab || /[|\uFF5C]/.test(line)) {
        flush();
        var parts = line.split(hasTab ? "\t" : /[|\uFF5C]/).map(function (x) { return x.trim(); });
        while (parts.length && parts[parts.length - 1] === "") parts.pop();
        if (parts.length >= 3 && parts[0] && parts[1] && parts[2]) {
          rows.push({ kanji: parts[0], reading: parts[1], english: parts[2], example: parts.slice(3).join(" ").trim() });
        } else bad.push(line);
      } else loose.push(line);
    });
    flush();
  });
  return { rows: rows, bad: bad };
}

function wordKey(kanji, reading) {
  return String(kanji || "").trim() + "\u0000" + String(reading || "").trim();
}

/* Grammar paste.
   New:  pattern | reading | meaning | usage | example   (reading, usage, example optional)
   Old:  pattern | meaning | usage | example              (still works)
   Field 2 counts as a reading when it is kana only (hiragana/katakana/〜/～/punctuation) and the
   pattern has kanji, or when there are 5+ fields. Also accepts blocks: one field per line, blank line between points. */
var KANA_ONLY_RE = /^[\u3040-\u309F\u30A0-\u30FF\u301C\uFF5E~ー・、。，．,.\s\u3000（）()\/／…「」『』]+$/;
var HAS_KANA_RE = /[\u3040-\u309F\u30A0-\u30FF]/;
var HAS_KANJI_RE = /[\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF々]/;
function isKanaOnly(s) { s = String(s || ""); return KANA_ONLY_RE.test(s) && HAS_KANA_RE.test(s); }
function grammarFromFields(f) {
  f = (f || []).map(function (x) { return String(x == null ? "" : x).trim(); });
  while (f.length && f[f.length - 1] === "") f.pop();
  if (f.length < 3 || !f[0]) return null;
  var withReading = (isKanaOnly(f[1]) && (HAS_KANJI_RE.test(f[0]) || f.length >= 5)) || (f[1] === "" && f.length >= 4);
  if (withReading) {
    if (!f[2]) return null;
    return { pattern: f[0], reading: f[1], meaning: f[2], usage: f[3] || "", example: f.slice(4).join(" ").trim() };
  }
  if (!f[1] || !f[2]) return null;
  return { pattern: f[0], reading: "", meaning: f[1], usage: f[2], example: f.slice(3).join(" ").trim() };
}
function splitGrammarPasteLine(line) {
  var s = String(line || "").trim();
  if (!s) return null;
  var parts;
  if (s.indexOf("\t") !== -1) parts = s.split("\t");
  else if (/[|\uFF5C]/.test(s)) parts = s.split(/[|\uFF5C]/);
  else if (s.indexOf(",") !== -1) parts = s.split(",");
  else return null;
  return grammarFromFields(parts);
}
function parseGrammarPaste(text) {
  var rows = [];
  var skipped = 0;
  String(text || "").replace(/\r\n?/g, "\n").split(/\n[ \t\u3000]*\n/).forEach(function (block) {
    var lines = block.split("\n").map(function (l) { return l.replace(/^[\s\u3000]+|[\s\u3000]+$/g, ""); }).filter(Boolean);
    if (!lines.length) return;
    var hard = function (l) { return l.indexOf("\t") !== -1 || /[|\uFF5C]/.test(l); };
    /* A comma can be a field separator (old one-line format) or just part of a meaning inside a block.
       Try both readings of the block and keep the one that finds more points. */
    function readBlock(commaIsSep) {
      var out = [], skip = 0, loose = [];
      function flush() {
        if (!loose.length) return;
        var row = loose.length >= 3 && loose.length <= 5 ? grammarFromFields(loose) : null;
        if (row) out.push(row);
        else skip += loose.length >= 3 ? 1 : loose.length;
        loose = [];
      }
      lines.forEach(function (l) {
        if (hard(l) || (commaIsSep && l.indexOf(",") !== -1)) {
          flush();
          var row = splitGrammarPasteLine(l);
          if (row) out.push(row); else skip += 1;
        } else loose.push(l);
      });
      flush();
      return { rows: out, skipped: skip };
    }
    var asSep = readBlock(true);
    var asText = readBlock(false);
    var pick = asText.rows.length > asSep.rows.length || (asText.rows.length === asSep.rows.length && asText.skipped < asSep.skipped) ? asText : asSep;
    pick.rows.forEach(function (r) { rows.push(r); });
    skipped += pick.skipped;
  });
  return { rows: rows, skipped: skipped };
}

function shuffleIds(ids) {
  var a = ids.slice();
  for (var i = a.length - 1; i > 0; i--) {
    var j = Math.floor(Math.random() * (i + 1));
    var tmp = a[i];
    a[i] = a[j];
    a[j] = tmp;
  }
  return a;
}

/* If she missed more than 5 words yesterday, only the first 5 lead the next day. */
function yesterdayMissIds(progress, today) {
  var y = addDays(today, -1);
  var seen = [];
  (progress.mistakes || []).forEach(function (m) {
    if (!m || m.day !== y || !m.wordId) return;
    if (seen.indexOf(m.wordId) === -1) seen.push(m.wordId);
  });
  return seen;
}

function leadMissIds(progress, today) {
  return yesterdayMissIds(progress, today).slice(0, 5);
}

function openUnresolvedWordIds(progress) {
  var ids = [];
  var seen = {};
  (progress.mistakes || []).forEach(function (m) {
    if (!m || m.resolved || !m.wordId) return;
    if (seen[m.wordId]) return;
    seen[m.wordId] = true;
    ids.push(m.wordId);
  });
  return ids;
}

function buildQueue(progress, today) {
  var words = progress.words || [];
  var byId = {};
  words.forEach(function (w) { byId[w.id] = w; });
  var ids = [];
  function push(id) {
    if (!id || !byId[id] || ids.indexOf(id) !== -1) return;
    ids.push(id);
  }
  leadMissIds(progress, today).forEach(push);
  /* Open Wrong words (need 3 correct reviews after a miss) reappear in sessions. */
  openUnresolvedWordIds(progress).forEach(push);
  words.filter(function (w) {
    return w.lastResult === "ok" && w.due && w.due <= today;
  }).sort(function (a, b) {
    return a.due < b.due ? -1 : a.due > b.due ? 1 : String(a.addedAt).localeCompare(String(b.addedAt));
  }).forEach(function (w) { push(w.id); });
  /* New words wait in line (20 a day) until first studied, so a big paste is never stranded. */
  words.filter(function (w) { return !w.lastDay && (w.addedDay || "") <= today; })
    .sort(function (a, b) { return String(a.addedAt).localeCompare(String(b.addedAt)); })
    .slice(0, 20)
    .forEach(function (w) { push(w.id); });
  return ids;
}

function newItemCount(progress, today) {
  var n = (progress.words || []).filter(function (w) {
    return !w.lastDay && (w.addedDay || "") <= today;
  }).length;
  return Math.min(20, n);
}

function gradeWord(word, ok, today) {
  var yesterday = addDays(today, -1);
  if (ok) {
    if (word.lastResult === "ok" && word.lastDay === yesterday) {
      word.streak = 2;
      word.interval = word.interval && word.interval > 1 ? Math.min(60, word.interval * 2) : 3;
      word.due = addDays(today, word.interval);
    } else if ((word.streak || 0) >= 2 && word.lastResult === "ok") {
      word.streak += 1;
      word.interval = Math.min(60, (word.interval || 3) * 2);
      word.due = addDays(today, word.interval);
    } else {
      word.streak = 1;
      word.interval = 1;
      word.due = addDays(today, 1);
    }
    word.lastResult = "ok";
    word.lastDay = today;
  } else {
    word.streak = 0;
    word.interval = 1;
    word.due = addDays(today, 1);
    word.lastResult = "miss";
    word.lastDay = today;
  }
  return word;
}

if (typeof document !== "undefined") {
(function () {
  var KEY = "jlpt-n2-words-v1";
  var LEGACY_KEYS = ["jlpt-n2-progress-v1", "jlpt-n2-words"];
  var FURI_KEY = "jlpt-n2-furigana";
  var SESS_KEY = "jlpt-n2-session-v2";
  var IDB_NAME = "jlpt-n2";
  var IDB_STORE = "kv";
  var IDB_PROGRESS_KEY = "jlpt-n2-words-v1";
  var main = document.getElementById("app");
  var nav = document.getElementById("nav");
  var furiBtn = document.getElementById("furi");
  var furigana = localStorage.getItem(FURI_KEY) === "1";
  var session = loadSession();
  var ui = { readingId: null, scripts: {}, mock: null, mockPaper: "short", chapterId: null, pasteMsg: null, chFlash: null, chQuiz: null, editMsg: null, comboLevel: null, comboChunk: null, gChapterId: null, gPasteMsg: null, gEditMsg: null, gFlash: null, gQuiz: null, gEditPointId: null, bulkDraft: "", bulkMsg: null, syncMsg: null };

  function normalizeProgress(data) {
    if (!data || !Array.isArray(data.words)) return blankProgress();
    if (!Array.isArray(data.mistakes)) data.mistakes = [];
    if (!data.doneDays || typeof data.doneDays !== "object") data.doneDays = {};
    if (!Array.isArray(data.chapters)) data.chapters = [];
    data.chapters.forEach(function (ch) {
      if (!ch.words) ch.words = [];
    });
    if (!Array.isArray(data.grammarChapters)) data.grammarChapters = [];
    data.grammarChapters.forEach(function (ch) {
      if (!ch.points) ch.points = [];
    });
    if (!Array.isArray(data.drillLog)) data.drillLog = [];
    if (!Array.isArray(data.completions)) data.completions = [];
    if (!data.stats || typeof data.stats !== "object") data.stats = { days: {} };
    if (!data.stats.days || typeof data.stats.days !== "object") data.stats.days = {};
    if (!data.deleted || typeof data.deleted !== "object") data.deleted = {};
    data.version = data.version || 2;
    return data;
  }
  function progressIsEmpty(p) {
    if (!p) return true;
    var hasWords = p.words && p.words.length;
    var hasCh = p.chapters && p.chapters.length;
    var hasGram = p.grammarChapters && p.grammarChapters.length;
    var hasMiss = (p.mistakes && p.mistakes.length) || (p.drillLog && p.drillLog.length);
    var hasDays = p.doneDays && Object.keys(p.doneDays).length;
    var hasStats = p.stats && p.stats.days && Object.keys(p.stats.days).length;
    return !(hasWords || hasCh || hasGram || hasMiss || hasDays || hasStats);
  }
  function readLocalRaw() {
    try {
      var raw = localStorage.getItem(KEY);
      if (raw) return raw;
      var i;
      for (i = 0; i < LEGACY_KEYS.length; i++) {
        raw = localStorage.getItem(LEGACY_KEYS[i]);
        if (raw) return raw;
      }
    } catch (e) {}
    return null;
  }
  function loadProgress() {
    try {
      var raw = readLocalRaw();
      if (!raw) return blankProgress();
      return normalizeProgress(JSON.parse(raw));
    } catch (e) {
      return blankProgress();
    }
  }
  function writeLocal(data) {
    try {
      localStorage.setItem(KEY, JSON.stringify(data));
      return true;
    } catch (e) {
      return false;
    }
  }
  function openIdb() {
    return new Promise(function (resolve, reject) {
      if (!window.indexedDB) {
        reject(new Error("no idb"));
        return;
      }
      var req = indexedDB.open(IDB_NAME, 1);
      req.onupgradeneeded = function () {
        var db = req.result;
        if (!db.objectStoreNames.contains(IDB_STORE)) db.createObjectStore(IDB_STORE);
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error || new Error("idb open failed")); };
    });
  }
  function idbGetProgress() {
    return openIdb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(IDB_STORE, "readonly");
        var store = tx.objectStore(IDB_STORE);
        var req = store.get(IDB_PROGRESS_KEY);
        req.onsuccess = function () {
          db.close();
          resolve(req.result || null);
        };
        req.onerror = function () {
          db.close();
          reject(req.error);
        };
      });
    });
  }
  function idbSetProgress(data) {
    return openIdb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(IDB_STORE, "readwrite");
        var store = tx.objectStore(IDB_STORE);
        store.put(data, IDB_PROGRESS_KEY);
        tx.oncomplete = function () { db.close(); resolve(true); };
        tx.onerror = function () { db.close(); reject(tx.error); };
      });
    }).catch(function () { return false; });
  }
  var progress = loadProgress();
  try {
    if (localStorage.getItem(KEY) == null && !progressIsEmpty(progress)) writeLocal(progress);
  } catch (e) {}
  /* Merge two progress copies: union by id, never drop data unless tombstoned. "a" wins on scalar fields. */
  function byIdMerge(a, b, tomb, inner) {
    var out = [], seen = {};
    (a || []).forEach(function (x) { if (x && x.id && !tomb[x.id]) { seen[x.id] = out.length; out.push(x); } else if (x && !x.id) out.push(x); });
    (b || []).forEach(function (y) {
      if (!y || !y.id || tomb[y.id]) return;
      if (seen[y.id] == null) { seen[y.id] = out.length; out.push(y); }
      else if (inner) inner(out[seen[y.id]], y);
    });
    return out;
  }
  function mergeProgress(a, b) {
    if (!b || progressIsEmpty(b) && !(b.deleted && Object.keys(b.deleted).length)) return a;
    if (!a || progressIsEmpty(a) && !(a.deleted && Object.keys(a.deleted).length)) return normalizeProgress(b);
    var tomb = {};
    [a.deleted, b.deleted].forEach(function (d) { if (d) Object.keys(d).forEach(function (k) { tomb[k] = d[k]; }); });
    a.deleted = tomb;
    /* Edited items carry updatedAt; the newer edit wins per id. */
    var newerName = function (x, y) { if ((y.updatedAt || "") > (x.updatedAt || "")) { x.name = y.name; x.updatedAt = y.updatedAt; } };
    var newerPoint = function (x, y) { if ((y.updatedAt || "") > (x.updatedAt || "")) Object.keys(y).forEach(function (k) { x[k] = y[k]; }); };
    a.chapters = byIdMerge(a.chapters, b.chapters, tomb, function (x, y) { newerName(x, y); x.words = byIdMerge(x.words, y.words, tomb); });
    a.grammarChapters = byIdMerge(a.grammarChapters, b.grammarChapters, tomb, function (x, y) { newerName(x, y); x.points = byIdMerge(x.points, y.points, tomb, newerPoint); });
    a.words = byIdMerge(a.words, b.words, tomb, function (x, y) {
      if (JSON.stringify(y).length > JSON.stringify(x).length && (y.lastDay || "") >= (x.lastDay || "")) Object.keys(y).forEach(function (k) { x[k] = y[k]; });
    });
    a.drillLog = byIdMerge(a.drillLog, b.drillLog, tomb);
    a.completions = byIdMerge(a.completions || [], b.completions || [], tomb);
    var mk = {};
    (a.mistakes || []).forEach(function (m) { if (m) mk[m.at + "|" + m.wordId] = 1; });
    (b.mistakes || []).forEach(function (m) { if (m && !mk[m.at + "|" + m.wordId]) a.mistakes.push(m); });
    Object.keys(b.doneDays || {}).forEach(function (k) { if (!a.doneDays[k]) a.doneDays[k] = b.doneDays[k]; });
    var bd = (b.stats && b.stats.days) || {};
    Object.keys(bd).forEach(function (k) {
      var x = a.stats.days[k], y = bd[k];
      if (!x) { a.stats.days[k] = y; return; }
      ["activeMs", "sessions", "quizzes", "levels", "wordsGraded", "drills", "drillQs", "drillMs"].forEach(function (f) { if ((y[f] || 0) > (x[f] || 0)) x[f] = y[f]; });
      (y.levelKeys || []).forEach(function (lk) { if (!x.levelKeys) x.levelKeys = []; if (x.levelKeys.indexOf(lk) === -1) x.levelKeys.push(lk); });
    });
    return a;
  }
  function tombstone(id) {
    if (!id) return;
    if (!progress.deleted || typeof progress.deleted !== "object") progress.deleted = {};
    progress.deleted[id] = Date.now();
  }
  function readLocalParsed() {
    try { var r = readLocalRaw(); return r ? normalizeProgress(JSON.parse(r)) : null; } catch (e) { return null; }
  }
  function saveProgress(quiet) {
    /* Another tab/app instance may have written since we loaded: fold its data in, never clobber it. */
    progress = mergeProgress(progress, readLocalParsed());
    writeLocal(progress);
    idbSetProgress(progress);
    if (!quiet) scheduleSync();
  }
  window.addEventListener("storage", function (e) {
    if (e.key !== KEY || !e.newValue) return;
    try { progress = mergeProgress(progress, normalizeProgress(JSON.parse(e.newValue))); render(); } catch (err) {}
  });
  try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(function () {}); } catch (e) {}
  function restoreFromMirrors() {
    return idbGetProgress().then(function (idbRaw) {
      var idbData = null;
      try {
        if (idbRaw && typeof idbRaw === "object") idbData = normalizeProgress(idbRaw);
      } catch (e) { idbData = null; }
      if (!idbData) {
        if (!progressIsEmpty(progress)) return idbSetProgress(progress).then(function () { return "ls-to-idb"; });
        return "empty";
      }
      progress = mergeProgress(progress, idbData);
      writeLocal(progress);
      return idbSetProgress(progress).then(function () { return "merged"; });
    }).then(function (r) { return r; }, function () {
      if (!progressIsEmpty(progress)) writeLocal(progress);
      return "idb-unavailable";
    });
  }

  /* ---- Cloud sync: one secret GitHub Gist owned by the user. The token never leaves this device
     except to talk to api.github.com. Every sync = pull, merge (union by id, tombstones, max stats), push if needed. ---- */
  var SYNC_TOKEN_KEY = "jlpt-n2-sync-token";
  var SYNC_META_KEY = "jlpt-n2-sync-meta";
  var SYNC_FILE = "jlpt-n2-study-data.json";
  var GH_API = "https://api.github.com";
  var syncState = { running: false, again: false, timer: null, promise: null };
  function syncToken() { try { return localStorage.getItem(SYNC_TOKEN_KEY) || ""; } catch (e) { return ""; } }
  function syncMeta() { try { return JSON.parse(localStorage.getItem(SYNC_META_KEY) || "{}") || {}; } catch (e) { return {}; } }
  function setSyncMeta(patch) {
    var m = syncMeta();
    Object.keys(patch).forEach(function (k) { m[k] = patch[k]; });
    try { localStorage.setItem(SYNC_META_KEY, JSON.stringify(m)); } catch (e) {}
    updateSyncStatus();
    return m;
  }
  function canonJSON(v) {
    if (Array.isArray(v)) return "[" + v.map(canonJSON).sort().join(",") + "]";
    if (v && typeof v === "object") {
      return "{" + Object.keys(v).sort().filter(function (k) { return v[k] !== undefined; }).map(function (k) {
        return JSON.stringify(k) + ":" + canonJSON(v[k]);
      }).join(",") + "}";
    }
    return JSON.stringify(v === undefined ? null : v);
  }
  function syncErr(msg, extra) {
    var e = new Error(msg);
    e.userMsg = msg;
    if (extra) Object.keys(extra).forEach(function (k) { e[k] = extra[k]; });
    return e;
  }
  function ghFetch(path, opts) {
    opts = opts || {};
    var headers = { "Accept": "application/vnd.github+json", "Authorization": "Bearer " + syncToken() };
    if (opts.body) headers["Content-Type"] = "application/json";
    return fetch(GH_API + path, { method: opts.method || "GET", headers: headers, body: opts.body, cache: "no-store", keepalive: !!opts.keepalive }).then(function (res) {
      if (res.status === 401) throw syncErr("GitHub did not accept the token. Make a new one (gist box ticked) and paste it again.", { auth: true });
      if (res.status === 403 || res.status === 429) throw syncErr("GitHub refused (" + res.status + "): the token may be missing gist access, or too many requests. Try again in a few minutes.", { auth: res.status === 403 });
      if (res.status === 404) throw syncErr("Not found on GitHub.", { notFound: true });
      if (!res.ok) throw syncErr("GitHub error " + res.status + ". Will try again.");
      return res.json();
    });
  }
  function gistPayload() {
    var files = {};
    files[SYNC_FILE] = { content: JSON.stringify(progress) };
    return files;
  }
  function findGist() {
    var meta = syncMeta();
    if (meta.gistId) {
      return ghFetch("/gists/" + encodeURIComponent(meta.gistId)).then(function (g) {
        if (g && g.files && g.files[SYNC_FILE]) return g;
        setSyncMeta({ gistId: null });
        return findGist();
      }, function (e) {
        if (e.notFound) { setSyncMeta({ gistId: null }); return findGist(); }
        throw e;
      });
    }
    function page(n) {
      return ghFetch("/gists?per_page=100&page=" + n).then(function (list) {
        list = Array.isArray(list) ? list : [];
        var hits = list.filter(function (g) { return g && g.files && g.files[SYNC_FILE]; });
        if (hits.length) {
          hits.sort(function (a, b) { return String(a.created_at).localeCompare(String(b.created_at)); });
          return ghFetch("/gists/" + encodeURIComponent(hits[0].id));
        }
        if (list.length === 100 && n < 10) return page(n + 1);
        return ghFetch("/gists", { method: "POST", body: JSON.stringify({
          description: "N2 study app data (words, chapters, grammar, stats). Secret gist; keep it.",
          public: false,
          files: gistPayload()
        }) });
      });
    }
    return page(1).then(function (g) {
      setSyncMeta({ gistId: g.id, gistUrl: g.html_url || null });
      return g;
    });
  }
  function readRemote(g) {
    var f = g && g.files && g.files[SYNC_FILE];
    if (!f) return Promise.resolve(null);
    var text = f.truncated && f.raw_url
      ? fetch(f.raw_url, { cache: "no-store" }).then(function (r) { if (!r.ok) throw syncErr("Could not download the synced data (" + r.status + ")."); return r.text(); })
      : Promise.resolve(f.content || "");
    return text.then(function (t) {
      if (!String(t).trim()) return null;
      var data;
      try { data = JSON.parse(t); } catch (e) { throw syncErr("The data on GitHub could not be read, so nothing was overwritten. Ask for help before syncing again."); }
      if (!data || typeof data !== "object" || !Array.isArray(data.words)) throw syncErr("The gist does not look like N2 study data, so nothing was overwritten.");
      return normalizeProgress(data);
    });
  }
  function hasTombs(p) { return !!(p && p.deleted && Object.keys(p.deleted).length); }
  function softRender() {
    var a = document.activeElement;
    if (a && main.contains(a) && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)) return;
    if (ui.gEditPointId) return;
    render();
  }
  function syncNow(reason) {
    if (!syncToken()) return Promise.resolve("off");
    if (syncState.running) { syncState.again = true; return syncState.promise; }
    if (syncState.timer) { clearTimeout(syncState.timer); syncState.timer = null; }
    if (navigator.onLine === false) {
      setSyncMeta({ status: "offline", pending: true });
      return Promise.resolve("offline");
    }
    syncState.running = true;
    setSyncMeta({ status: "syncing" });
    var p = findGist().then(function (g) {
      return readRemote(g).then(function (remote) {
        progress = mergeProgress(progress, readLocalParsed());
        var localBefore = canonJSON(progress);
        var remoteCanon = remote ? canonJSON(remote) : null;
        if (remote) progress = normalizeProgress(mergeProgress(progress, remote));
        var after = canonJSON(progress);
        if (after !== localBefore) { writeLocal(progress); idbSetProgress(progress); }
        var needPush = remoteCanon !== after;
        if (needPush && progressIsEmpty(progress) && remote && !progressIsEmpty(remote) && !hasTombs(progress)) {
          throw syncErr("Refused to replace the synced data with an empty copy.");
        }
        var body = needPush ? JSON.stringify({ files: gistPayload() }) : null;
        var push = needPush
          ? ghFetch("/gists/" + encodeURIComponent(g.id), { method: "PATCH", body: body, keepalive: reason === "hidden" && body.length < 60000 })
          : Promise.resolve(null);
        return push.then(function () {
          setSyncMeta({ status: "ok", error: null, pending: false, lastSync: new Date().toISOString(), lastAction: needPush ? "sent" : "checked" });
          if (after !== localBefore) softRender();
          return needPush ? "pushed" : "pulled";
        });
      });
    }).catch(function (e) {
      var msg = e && e.userMsg ? e.userMsg : (navigator.onLine === false ? "Offline. Will sync when you are back online." : "Could not reach GitHub. Will try again.");
      setSyncMeta({ status: "error", error: msg, authError: !!(e && e.auth), pending: true });
      return "error";
    }).then(function (r) {
      syncState.running = false;
      if (syncState.again) { syncState.again = false; return syncNow("again"); }
      return r;
    });
    syncState.promise = p;
    return p;
  }
  function scheduleSync() {
    if (!syncToken()) return;
    setSyncMeta({ pending: true });
    if (syncState.timer) clearTimeout(syncState.timer);
    syncState.timer = setTimeout(function () { syncState.timer = null; syncNow("change"); }, 5000);
  }
  function fmtSyncTime(iso) {
    try {
      return new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Bucharest", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
    } catch (e) { return iso; }
  }
  function syncStatusText() {
    var m = syncMeta();
    if (!syncToken()) return "Sync is off on this device. Words are saved only here.";
    if (m.status === "syncing") return "Syncing…";
    if (m.status === "offline") return "Offline. Changes are saved here and will sync when you are back online." + (m.lastSync ? " Last synced " + fmtSyncTime(m.lastSync) + "." : "");
    if (m.status === "error") return "Sync problem: " + (m.error || "unknown") + (m.lastSync ? " Last good sync " + fmtSyncTime(m.lastSync) + "." : "");
    if (m.lastSync) return "Synced " + fmtSyncTime(m.lastSync) + (m.pending ? " · changes waiting to send" : " · up to date") + ".";
    return "Sync is on. Waiting for the first sync…";
  }
  function updateSyncStatus() {
    var el = document.getElementById("sync-status");
    if (!el) return;
    var m = syncMeta();
    el.textContent = syncStatusText();
    var on = !!syncToken();
    el.className = "sync-status" + (on && m.status === "error" ? " is-error" : on && m.status === "offline" ? " is-offline" : "");
  }
  function syncCardHtml() {
    var html = '<section class="sync-card" id="sync-card"><h2>Sync across devices</h2>';
    if (!syncToken()) {
      html += '<p class="muted">One copy of your words, chapters, grammar and stats on your phone, laptop and any browser. Paste a GitHub token once on each device. It stays on that device.</p>';
      html += '<p><a href="https://github.com/settings/tokens/new?scopes=gist&amp;description=JLPT%20N2%20sync" target="_blank" rel="noopener">Make a token on GitHub</a> (tick only “gist”).</p>';
      html += '<label for="sync-token">GitHub token</label>';
      html += '<input id="sync-token" type="password" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="ghp_… or github_pat_…">';
      html += '<div class="paste-actions"><button type="button" class="primary" data-act="sync-connect">Turn on sync</button></div>';
    } else {
      html += '<div class="paste-actions"><button type="button" class="primary" data-act="sync-now">Sync now</button></div>';
    }
    html += '<p id="sync-status" class="sync-status" role="status" aria-live="polite"></p>';
    if (ui.syncMsg) html += '<p class="muted">' + esc(ui.syncMsg) + "</p>";
    if (syncToken()) {
      var gu = syncMeta().gistUrl;
      html += '<p class="muted small">Stored in a secret gist on your GitHub' + (gu && /^https:\/\/gist\.github\.com\//.test(gu) ? ' (<a href="' + esc(gu) + '" target="_blank" rel="noopener">open</a>)' : "") + '.</p>';
      html += '<button type="button" class="secondary" data-act="sync-off">Turn off sync on this device</button>';
    }
    html += "</section>";
    return html;
  }

  var activeSince = null;
  var activePage = null;
  function blankDayStats(date) {
    return { date: date, activeMs: 0, sessions: 0, quizzes: 0, levels: 0, wordsGraded: 0, drills: 0, drillQs: 0, drillMs: 0, levelKeys: [] };
  }
  function ensureDayStats(date) {
    if (!progress.stats || typeof progress.stats !== "object") progress.stats = { days: {} };
    if (!progress.stats.days || typeof progress.stats.days !== "object") progress.stats.days = {};
    if (!progress.stats.days[date]) progress.stats.days[date] = blankDayStats(date);
    var d = progress.stats.days[date];
    if (!Array.isArray(d.levelKeys)) d.levelKeys = [];
    ["activeMs", "sessions", "quizzes", "levels", "wordsGraded", "drills", "drillQs", "drillMs"].forEach(function (k) {
      if (d[k] == null) d[k] = 0;
    });
    return d;
  }
  function flushActiveTime() {
    if (activeSince == null) return;
    var now = Date.now();
    var elapsed = now - activeSince;
    if (elapsed > 0) {
      var dayRow = ensureDayStats(todayISO());
      dayRow.activeMs += elapsed;
      if (activePage === "drill") dayRow.drillMs = (dayRow.drillMs || 0) + elapsed;
      saveProgress(true);
    }
    activeSince = document.visibilityState === "visible" ? now : null;
  }
  function startActiveClock() {
    if (document.visibilityState === "visible" && activeSince == null) activeSince = Date.now();
  }
  function stopActiveClock() {
    flushActiveTime();
    activeSince = null;
  }
  function bumpStat(field, n) {
    var day = ensureDayStats(todayISO());
    day[field] = (day[field] || 0) + (n == null ? 1 : n);
    saveProgress();
  }
  function markLevelPracticed(bandId, chunkIndex) {
    var day = ensureDayStats(todayISO());
    var key = String(bandId) + ":" + String(chunkIndex);
    if (day.levelKeys.indexOf(key) !== -1) return;
    day.levelKeys.push(key);
    day.levels = day.levelKeys.length;
    saveProgress();
  }
  function formatMinutes(ms) {
    var mins = Math.floor((ms || 0) / 60000);
    var secs = Math.floor(((ms || 0) % 60000) / 1000);
    if (mins <= 0) return secs + "s";
    if (secs === 0) return mins + " min";
    return mins + " min " + secs + "s";
  }
  function todayStudySummary() {
    flushActiveTime();
    return ensureDayStats(todayISO());
  }
  function studyStreak() {
    flushActiveTime();
    var days = progress.stats && progress.stats.days ? progress.stats.days : {};
    var streak = 0;
    var d = todayISO();
    for (var i = 0; i < 400; i++) {
      var active = dayHasStudy(days[d]);
      if (!active) {
        if (i === 0) { d = addDays(d, -1); continue; }
        break;
      }
      streak += 1;
      d = addDays(d, -1);
    }
    return streak;
  }
  /* Stats chart window: plan start (or earlier first logged day) through 31 Dec 2026
     (exam 6 Dec + buffer), extended to "today" if later. Newest first. */
  var STATS_END = "2026-12-31";
  function dayHasStudy(row) {
    return !!(row && ((row.activeMs || 0) > 0 || (row.wordsGraded || 0) > 0 || (row.sessions || 0) > 0 || (row.quizzes || 0) > 0 || (row.levels || 0) > 0 || (row.drillQs || 0) > 0));
  }
  function statsWindowDays() {
    flushActiveTime();
    var days = progress.stats && progress.stats.days ? progress.stats.days : {};
    var start = START;
    Object.keys(days).forEach(function (k) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(k)) return;
      if (dayHasStudy(days[k]) && k < start) start = k;
    });
    var end = STATS_END;
    var today = todayISO();
    if (today > end) end = today;
    if (start > end) start = end;
    var out = [];
    var d = end;
    var guard = 0;
    while (d >= start && guard < 500) {
      out.push(days[d] ? ensureDayStats(d) : blankDayStats(d));
      d = addDays(d, -1);
      guard += 1;
    }
    return out;
  }
  function studyBoxHtml(day) {
    var html = '<div class="stat-box">';
    html += '<p class="mode-label">Today in the app</p>';
    html += '<p class="stat-line"><strong>' + esc(formatMinutes(day.activeMs)) + "</strong> active (screen visible)</p>";
    html += '<p class="stat-line">Daily sessions finished: ' + (day.sessions || 0) + "</p>";
    html += '<p class="stat-line">Quizzes finished: ' + (day.quizzes || 0) + "</p>";
    html += '<p class="stat-line">Combination levels practiced: ' + (day.levels || 0) + "</p>";
    html += '<p class="stat-line">Words graded: ' + (day.wordsGraded || 0) + "</p>";
    html += '<p class="stat-line">Drill: ' + (day.drillQs || 0) + " questions, " + (day.drills || 0) + " rounds finished, " + esc(formatMinutes(day.drillMs || 0)) + "</p>";
    html += '<p class="muted"><a href="#stats">Open Stats</a></p>';
    html += "</div>";
    return html;
  }
  function loadSession() {
    try {
      var raw = sessionStorage.getItem(SESS_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }
  function saveSession() {
    if (!session) sessionStorage.removeItem(SESS_KEY);
    else sessionStorage.setItem(SESS_KEY, JSON.stringify(session));
  }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function wordBy(id) {
    var i;
    for (i = 0; i < progress.words.length; i++) {
      if (progress.words[i].id === id) return progress.words[i];
    }
    var chapters = progress.chapters || [];
    for (i = 0; i < chapters.length; i++) {
      var words = chapters[i].words || [];
      for (var j = 0; j < words.length; j++) {
        if (words[j].id === id) return words[j];
      }
    }
    return null;
  }
  function chapterBy(id) {
    if (id === "wrong-virt" && ui._wrongPool) {
      return { id: "wrong-virt", name: "Wrong words", words: ui._wrongPool };
    }
    if (id === "combo-virt" && ui._comboPool) {
      return { id: "combo-virt", name: ui._comboLabel || "Combinations", words: ui._comboPool };
    }
    var chapters = progress.chapters || [];
    for (var i = 0; i < chapters.length; i++) {
      if (chapters[i].id === id) return chapters[i];
    }
    return null;
  }
  function chapterWordBy(chapterId, wordId) {
    var ch = chapterBy(chapterId);
    if (!ch) return null;
    for (var i = 0; i < (ch.words || []).length; i++) {
      if (ch.words[i].id === wordId) return ch.words[i];
    }
    return wordBy(wordId);
  }
  /* Quiz misses feed the next-day lead. Copy into daily words if needed. */
  function ensureDailyFromChapterWord(cw) {
    var i;
    for (i = 0; i < progress.words.length; i++) {
      var w = progress.words[i];
      if (w.kanji === cw.kanji && w.reading === cw.reading) return w;
    }
    var today = todayISO();
    var copy = {
      id: newId("w"),
      kanji: cw.kanji,
      reading: cw.reading,
      english: cw.english,
      example: cw.example || "",
      addedDay: today,
      addedAt: new Date().toISOString(),
      lastResult: null,
      lastDay: null,
      due: null,
      streak: 0,
      interval: 0,
      fromChapter: true
    };
    progress.words.push(copy);
    return copy;
  }
  function logCouldNotRead(word, today) {
    (progress.mistakes || []).forEach(function (m) {
      if (m && m.wordId === word.id && !m.resolved) m.correctSince = 0;
    });
    progress.mistakes.push({
      at: new Date().toISOString(),
      day: today,
      wordId: word.id,
      kanji: word.kanji,
      reading: word.reading,
      english: word.english || "",
      resolved: false,
      correctSince: 0
    });
  }
  function resolveMistake(wordId) {
    if (!wordId || !Array.isArray(progress.mistakes)) return;
    var now = new Date().toISOString();
    var changed = false;
    progress.mistakes.forEach(function (m) {
      if (m && m.wordId === wordId && !m.resolved) {
        m.resolved = true;
        m.resolvedAt = now;
        changed = true;
      }
    });
    if (changed) saveProgress();
  }
  /* After a miss, need 3 correct encounters before it leaves the open Wrong set. */
  function recordCorrectReview(wordId) {
    if (!wordId || !Array.isArray(progress.mistakes)) return;
    var open = progress.mistakes.filter(function (m) {
      return m && m.wordId === wordId && !m.resolved;
    });
    if (!open.length) return;
    var maxC = 0;
    open.forEach(function (m) {
      m.correctSince = (m.correctSince || 0) + 1;
      if (m.correctSince > maxC) maxC = m.correctSince;
    });
    if (maxC >= 3) resolveMistake(wordId);
    else saveProgress();
  }
  function correctSinceForWord(wordId) {
    var maxC = 0;
    (progress.mistakes || []).forEach(function (m) {
      if (!m || m.wordId !== wordId || m.resolved) return;
      if ((m.correctSince || 0) > maxC) maxC = m.correctSince || 0;
    });
    return maxC;
  }
  function fmtWhen(iso) {
    try {
      return new Intl.DateTimeFormat("en-GB", {
        timeZone: "Europe/Bucharest",
        day: "numeric", month: "short", year: "numeric",
        hour: "2-digit", minute: "2-digit"
      }).format(new Date(iso)) + " Bucharest";
    } catch (e) {
      return String(iso || "");
    }
  }
  function wrongWordSummaries() {
    var map = {};
    (progress.mistakes || []).forEach(function (m) {
      if (!m) return;
      var key = m.wordId || (m.kanji + "|" + m.reading);
      if (!map[key]) {
        map[key] = {
          key: key,
          wordId: m.wordId,
          kanji: m.kanji || "",
          reading: m.reading || "",
          english: m.english || "",
          missCount: 0,
          lastAt: null,
          open: false,
          correctSince: 0
        };
      }
      var row = map[key];
      row.missCount += 1;
      if (!m.resolved) {
        row.open = true;
        if ((m.correctSince || 0) > row.correctSince) row.correctSince = m.correctSince || 0;
      }
      if (!row.lastAt || String(m.at) > String(row.lastAt)) row.lastAt = m.at;
      if (m.english) row.english = m.english;
      if (m.kanji) row.kanji = m.kanji;
      if (m.reading) row.reading = m.reading;
      if (m.wordId) row.wordId = m.wordId;
    });
    Object.keys(map).forEach(function (key) {
      var row = map[key];
      var w = row.wordId ? wordBy(row.wordId) : null;
      if (w) {
        row.kanji = w.kanji || row.kanji;
        row.reading = w.reading || row.reading;
        row.english = w.english || row.english;
        row.example = w.example || "";
      }
    });
    return Object.keys(map).map(function (k) { return map[k]; }).sort(function (a, b) {
      if (!!a.open !== !!b.open) return a.open ? -1 : 1;
      return String(b.lastAt || "").localeCompare(String(a.lastAt || ""));
    });
  }
  function ensureWordFromSummary(row) {
    if (row.wordId) {
      var existing = wordBy(row.wordId);
      if (existing) return existing;
    }
    var i;
    for (i = 0; i < progress.words.length; i++) {
      var w = progress.words[i];
      if (w.kanji === row.kanji && w.reading === row.reading) return w;
    }
    var today = todayISO();
    var copy = {
      id: newId("w"),
      kanji: row.kanji,
      reading: row.reading,
      english: row.english || "",
      example: row.example || "",
      addedDay: today,
      addedAt: new Date().toISOString(),
      lastResult: "miss",
      lastDay: today,
      due: addDays(today, 1),
      streak: 0,
      interval: 1,
      fromWrong: true
    };
    progress.words.push(copy);
    return copy;
  }
  function finishQuizItem(ok, chapterWord) {
    var today = todayISO();
    bumpStat("wordsGraded", 1);
    if (ok) {
      ui.chQuiz.correct += 1;
      if (ui.chQuiz.fromWrong || ui.chQuiz.fromCombo) {
        var dailyOk = ensureDailyFromChapterWord(chapterWord);
        if (ui.chQuiz.fromWrong) {
          recordCorrectReview(dailyOk.id);
          gradeWord(dailyOk, true, today);
        }
        saveProgress();
      }
    } else {
      var daily = ensureDailyFromChapterWord(chapterWord);
      gradeWord(daily, false, today);
      logCouldNotRead(daily, today);
      saveProgress();
    }
    ui.chQuiz.feedback = { ok: ok };
    render();
    autoSpeak(speechReadingOfWord(chapterWord));
  }



  /* ===================== Completions: finished runs per chapter / grammar chapter / Combos level =====================
     One event per run that reached the end (any mode). Events have ids, so sync is a plain union. */
  var COMPLETION_MODES = { flash: "Flashcards", choice: "Quiz · choose", type: "Quiz · type", dark: "Darker day" };
  function recordCompletion(kind, ref, name, mode, score, total) {
    if (!kind || !ref) return;
    if (!Array.isArray(progress.completions)) progress.completions = [];
    progress.completions.push({ id: newId("cp"), kind: kind, ref: String(ref), name: String(name || ""), mode: mode, score: score == null ? null : score, total: total, at: new Date().toISOString(), day: todayISO() });
    saveProgress();
  }
  function completionsFor(kind, refOrPrefix, prefix) {
    return (progress.completions || []).filter(function (e) {
      if (!e || e.kind !== kind) return false;
      return prefix ? String(e.ref).indexOf(refOrPrefix) === 0 : e.ref === refOrPrefix;
    });
  }
  function completionBreakdown(list) {
    var by = {};
    list.forEach(function (e) { by[e.mode] = (by[e.mode] || 0) + 1; });
    return Object.keys(COMPLETION_MODES).filter(function (m) { return by[m]; }).map(function (m) { return COMPLETION_MODES[m] + " " + by[m]; }).join(" · ");
  }
  function completionBadge(list) {
    if (!list.length) return "";
    return ' <span class="cp-badge" title="' + esc("Completed " + list.length + "×: " + completionBreakdown(list)) + '">×' + list.length + "</span>";
  }
  function completionLine(list) {
    if (!list.length) return '<p class="muted cp-line">Not completed yet.</p>';
    return '<p class="muted cp-line">Completed ' + list.length + "× · " + esc(completionBreakdown(list)) + "</p>";
  }
  function completionName(e) {
    if (e.kind === "ch") { var c = chapterBy(e.ref); if (c && c.id === e.ref) return c.name; }
    if (e.kind === "g") { var g = gChapterBy(e.ref); if (g) return g.name; }
    return e.name || e.ref;
  }
  function completionHistoryHtml(kind) {
    var list = (progress.completions || []).filter(function (e) { return e && e.kind === kind; })
      .sort(function (a, b) { return String(b.at).localeCompare(String(a.at)); });
    var h = '<section class="cp-history"><h2>History</h2>';
    if (!list.length) return h + '<p class="muted">Finished runs (to the last card or question) show up here.</p></section>';
    h += '<p class="muted">' + list.length + " finished run" + (list.length === 1 ? "" : "s") + " · " + esc(completionBreakdown(list)) + "</p><ul class=\"cp-list\">";
    list.slice(0, 200).forEach(function (e) {
      h += "<li><span class=\"cp-when\">" + esc(fmtWhen(e.at).replace(" Bucharest", "")) + "</span> · <b>" + esc(completionName(e)) + "</b> · " + esc(COMPLETION_MODES[e.mode] || e.mode) +
        (e.score != null ? " · " + e.score + "/" + e.total : " · " + e.total + (e.total === 1 ? " card" : " cards")) + "</li>";
    });
    if (list.length > 200) h += "<li class=\"muted\">… " + (list.length - 200) + " older</li>";
    return h + "</ul><p class=\"muted\">Times are Bucharest time.</p></section>";
  }

  /* ===================== Typed answers: the reading in kana =====================
     Her phone keyboard turns a reading into kanji, so typed quizzes ask for the reading.
     Accepted: hiragana, katakana (folded to hiragana), romaji (converted), spaces / 〜 / trailing
     punctuation ignored, ー compared as the vowel it lengthens (けーたい = けいたい), and the exact
     written form (in case the IME converted it). */
  var TYPE_IN_ATTRS = ' type="text" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" lang="ja" inputmode="text"';
  var ROMA = { a: "あ", i: "い", u: "う", e: "え", o: "お", ka: "か", ki: "き", ku: "く", ke: "け", ko: "こ", sa: "さ", si: "し", shi: "し", su: "す", se: "せ", so: "そ",
    ta: "た", ti: "ち", chi: "ち", tu: "つ", tsu: "つ", te: "て", to: "と", na: "な", ni: "に", nu: "ぬ", ne: "ね", no: "の", ha: "は", hi: "ひ", hu: "ふ", fu: "ふ", he: "へ", ho: "ほ",
    ma: "ま", mi: "み", mu: "む", me: "め", mo: "も", ya: "や", yu: "ゆ", yo: "よ", ra: "ら", ri: "り", ru: "る", re: "れ", ro: "ろ", wa: "わ", wo: "を", nn: "ん", "n'": "ん",
    ga: "が", gi: "ぎ", gu: "ぐ", ge: "げ", go: "ご", za: "ざ", zi: "じ", ji: "じ", zu: "ず", ze: "ぜ", zo: "ぞ", da: "だ", di: "ぢ", du: "づ", de: "で", do: "ど",
    ba: "ば", bi: "び", bu: "ぶ", be: "べ", bo: "ぼ", pa: "ぱ", pi: "ぴ", pu: "ぷ", pe: "ぺ", po: "ぽ",
    kya: "きゃ", kyu: "きゅ", kyo: "きょ", sha: "しゃ", shu: "しゅ", sho: "しょ", sya: "しゃ", syu: "しゅ", syo: "しょ", cha: "ちゃ", chu: "ちゅ", cho: "ちょ", tya: "ちゃ", tyu: "ちゅ", tyo: "ちょ",
    nya: "にゃ", nyu: "にゅ", nyo: "にょ", hya: "ひゃ", hyu: "ひゅ", hyo: "ひょ", mya: "みゃ", myu: "みゅ", myo: "みょ", rya: "りゃ", ryu: "りゅ", ryo: "りょ",
    gya: "ぎゃ", gyu: "ぎゅ", gyo: "ぎょ", ja: "じゃ", ju: "じゅ", jo: "じょ", jya: "じゃ", jyu: "じゅ", jyo: "じょ", zya: "じゃ", zyu: "じゅ", zyo: "じょ",
    bya: "びゃ", byu: "びゅ", byo: "びょ", pya: "ぴゃ", pyu: "ぴゅ", pyo: "ぴょ", "-": "ー" };
  function romajiToKana(s) {
    var out = "", i = 0;
    while (i < s.length) {
      var c = s.charAt(i), nx = s.charAt(i + 1);
      if (/[a-z]/.test(c) && c === nx && c !== "n" && "aiueo".indexOf(c) === -1) { out += "っ"; i += 1; continue; }
      if (c === "n" && nx && "aiueoyn'".indexOf(nx) === -1) { out += "ん"; i += 1; continue; }
      if (c === "n" && !nx) { out += "ん"; i += 1; continue; }
      var hit = false;
      for (var L = 3; L >= 1; L--) {
        var k = s.substr(i, L);
        if (ROMA[k]) { out += ROMA[k]; i += L; hit = true; break; }
      }
      if (!hit) { out += c; i += 1; }
    }
    return out;
  }
  var VOWEL_OF = {};
  [["あかさたなはまやらわがざだばぱぁゃ", "あ"], ["いきしちにひみりぎじぢびぴぃ", "い"], ["うくすつぬふむゆるぐずづぶぷぅゅ", "う"], ["えけせてねへめれげぜでべぺぇ", "え"], ["おこそとのほもよろをごぞどぼぽぉょ", "お"]].forEach(function (g) {
    g[0].split("").forEach(function (ch) { VOWEL_OF[ch] = g[1]; });
  });
  /* Base form: NFKC, no spaces/〜/punctuation, katakana → hiragana, romaji → kana. */
  function kanaBase(s) {
    s = String(s == null ? "" : s);
    if (s.normalize) s = s.normalize("NFKC");
    s = s.toLowerCase().replace(/[\s\u3000〜～~・･]+/g, "").replace(/[。．.、,，!！?？…」』）)]+$/g, "").replace(/^[「『（(]+/, "");
    s = s.replace(/[\u30A1-\u30F6]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) - 0x60); });
    if (/[a-z]/.test(s)) s = romajiToKana(s);
    return s;
  }
  /* All spellings of a kana string with each ー replaced by its vowel (e-row also い, o-row also う). */
  function longVowelForms(s) {
    var forms = [""];
    for (var i = 0; i < s.length; i++) {
      var c = s.charAt(i);
      if (c === "ー" && i > 0) {
        var v = VOWEL_OF[s.charAt(i - 1)];
        var opts = v ? [v] : ["ー"];
        if (v === "え") opts.push("い");
        if (v === "お") opts.push("う");
        var next = [];
        forms.forEach(function (f) { opts.forEach(function (o) { next.push(f + o); }); });
        forms = next.slice(0, 32);
      } else forms = forms.map(function (f) { return f + c; });
    }
    return forms;
  }
  function answerAlternatives(s) {
    return String(s || "").split(/[\/／;；,，、]|\s+or\s+/).map(function (x) { return x.trim(); }).filter(Boolean);
  }
  /* True when `typed` is the reading (any accepted spelling) or exactly one of the written forms. */
  function readingAnswerOk(typed, readings, writtenForms) {
    var t = kanaBase(typed);
    if (!t) return false;
    var tf = longVowelForms(t);
    var ok = false;
    (readings || []).forEach(function (r) {
      answerAlternatives(r).concat([r]).forEach(function (alt) {
        var base = kanaBase(alt);
        if (!base) return;
        var rf = longVowelForms(base);
        if (tf.some(function (x) { return rf.indexOf(x) !== -1; })) ok = true;
      });
    });
    if (ok) return true;
    (writtenForms || []).forEach(function (wf) {
      answerAlternatives(wf).concat([wf]).forEach(function (alt) { if (alt && kanaBase(alt) === t) ok = true; });
    });
    return ok;
  }
  function wordTypedOk(typed, w) {
    var reading = w.reading && String(w.reading).trim() ? w.reading : w.kanji;
    return readingAnswerOk(typed, [reading], [w.kanji]);
  }
  function grammarTypedOk(typed, p) {
    return readingAnswerOk(typed, p.reading ? [p.reading] : [p.pattern], [p.pattern]);
  }

  /* ===================== Audio (Web Speech API, ja-JP) =====================
     Per-device settings in localStorage: auto-play on/off (default on), speed normal/slow.
     Words are spoken from their READING so the voice cannot misread the kanji. */
  var AUDIO_KEY = "jlpt-n2-audio";
  var AUDIO_NOTE_KEY = "jlpt-n2-audio-note-seen";
  var audioState = { voice: null, voicesKnown: false, noteNow: false };
  function audioPrefs() {
    var o = {};
    try { o = JSON.parse(localStorage.getItem(AUDIO_KEY) || "{}") || {}; } catch (e) { o = {}; }
    return { auto: o.auto !== false, rate: o.rate === "slow" ? "slow" : "normal" };
  }
  function setAudioPrefs(patch) {
    var o = audioPrefs();
    Object.keys(patch).forEach(function (k) { o[k] = patch[k]; });
    try { localStorage.setItem(AUDIO_KEY, JSON.stringify(o)); } catch (e) { /* private mode */ }
  }
  function pickJaVoice() {
    var ss = window.speechSynthesis;
    if (!ss || !ss.getVoices) return null;
    var vs = ss.getVoices() || [];
    if (vs.length) audioState.voicesKnown = true;
    var ja = vs.filter(function (v) { return /^ja([-_]|$)/i.test(String(v.lang || "")); });
    ja.sort(function (a, b) { return (b.localService ? 1 : 0) - (a.localService ? 1 : 0); });
    audioState.voice = ja[0] || null;
    return audioState.voice;
  }
  if (window.speechSynthesis) {
    pickJaVoice();
    var onVoices = function () { audioState.voicesKnown = true; pickJaVoice(); };
    if (window.speechSynthesis.addEventListener) window.speechSynthesis.addEventListener("voiceschanged", onVoices);
    else window.speechSynthesis.onvoiceschanged = onVoices;
  }
  function speechReadingOfWord(w) {
    if (!w) return "";
    var r = String(w.reading || "").trim();
    return r || String(w.kanji || "").trim();
  }
  function speechReadingOfPattern(p) {
    if (!p) return "";
    return String(p.reading || p.pattern || "").replace(/[〜～~]/g, "").split(/[\/／]/)[0].trim();
  }
  function speakJa(text) {
    var ss = window.speechSynthesis;
    text = String(text || "").trim();
    if (!text) return false;
    if (!ss || typeof window.SpeechSynthesisUtterance !== "function") { noteNoVoice(); return false; }
    try {
      ss.cancel();
      if (ss.paused && ss.resume) ss.resume();
      var u = new window.SpeechSynthesisUtterance(text);
      u.lang = "ja-JP";
      var v = audioState.voice || pickJaVoice();
      if (v) u.voice = v;
      u.rate = audioPrefs().rate === "slow" ? 0.7 : 1;
      ss.speak(u);
    } catch (e) { return false; }
    if (!audioState.voice) {
      if (audioState.voicesKnown) noteNoVoice();
      else setTimeout(function () { pickJaVoice(); if (audioState.voicesKnown && !audioState.voice) noteNoVoice(); }, 1500);
    }
    return true;
  }
  function autoSpeak(text) {
    if (audioPrefs().auto) speakJa(text);
  }
  function noteNoVoice() {
    var seen = false;
    try { seen = localStorage.getItem(AUDIO_NOTE_KEY) === "1"; } catch (e) { seen = false; }
    if (seen || audioState.noteNow) return;
    audioState.noteNow = true;
    var box = document.getElementById("audio-note");
    if (!box) {
      box = document.createElement("div");
      box.id = "audio-note";
      box.className = "audio-note";
      document.body.appendChild(box);
    }
    box.innerHTML = "<p><b>No Japanese voice on this device.</b> Audio needs one installed. Android: Settings → Speech / Text-to-speech → Google Speech Services → install Japanese voice data. iPhone/iPad: Settings → Accessibility → Spoken Content → Voices → Japanese, download a voice. Then reopen the app.</p>" +
      '<button type="button" class="secondary" data-audio-note="ok">OK</button>';
    box.querySelector("[data-audio-note]").addEventListener("click", function () {
      try { localStorage.setItem(AUDIO_NOTE_KEY, "1"); } catch (e) { /* ignore */ }
      box.parentNode && box.parentNode.removeChild(box);
      audioState.noteNow = false;
    });
  }
  /* Replay row for feedback cards: the word/pattern, plus the example sentence when there is one. */
  function sayButtonsHtml(text, sentence) {
    var h = '<div class="say-row">';
    if (text) h += '<button type="button" class="say" data-act="say" data-text="' + esc(text) + '" aria-label="Play ' + esc(text) + '">🔊 Play</button>';
    if (sentence) h += '<button type="button" class="say" data-act="say" data-text="' + esc(sentence) + '" aria-label="Play the example sentence">▶ Example</button>';
    return h + "</div>";
  }
  function audioSettingsHtml() {
    var a = audioPrefs();
    var h = '<section class="card audio-card"><h2>Audio</h2>';
    h += '<p class="muted">Plays the reading after you answer or flip a card (Japanese voice of this device).</p>';
    h += '<div class="row">';
    h += '<button type="button" data-act="audio-auto" aria-pressed="' + (a.auto ? "true" : "false") + '">Auto-play audio: ' + (a.auto ? "on" : "off") + "</button>";
    h += '<button type="button" data-act="audio-rate" aria-pressed="' + (a.rate === "slow" ? "true" : "false") + '">Speed: ' + (a.rate === "slow" ? "slow" : "normal") + "</button>";
    h += '<button type="button" data-act="say" data-text="にほんごのべんきょう">Test</button>';
    h += "</div></section>";
    return h;
  }

  /* ===================== Drill: JLPT N2 language-knowledge sections =====================
     Questions are built only from her own words/chapters/grammar; the open Combos list is used
     for distractors and prefix/suffix statistics. Results are an append-only log (progress.drillLog,
     one entry per answer, merged by id), and each item's redo state is derived from its history. */
  var DRILL_SECTIONS = [
    { id: "read", n: 1, jp: "漢字読み", name: "Kanji reading", desc: "Pick the reading of the underlined word.", need: "Add words written with kanji (Add or Chapters)." },
    { id: "ortho", n: 2, jp: "表記", name: "Orthography", desc: "Pick the kanji for the underlined kana.", need: "Add words written with kanji." },
    { id: "form", n: 3, jp: "語形成", name: "Word formation", desc: "Pick the prefix or suffix that completes the word. Built-in items are checked against JMdict; for items made from your own words the wrong options are only checked against your words and Combos.", need: "For your own items: unlocks when at least 4 of your words are a prefix + another word you have (大掃除 counts once 掃除 is also in your words), or 4 are a word + suffix (研究者 with 研究)." },
    { id: "ctx", n: 4, jp: "文脈規定", name: "Context", desc: "Pick the word that fills the blank.", need: "Add example sentences that contain the word exactly as written (給料 → 給料をもらう。). Needs 4+ such words." },
    { id: "para", n: 5, jp: "言い換え類義", name: "Paraphrase", desc: "Pick the closest meaning of the underlined word.", need: "Add words with English meanings." },
    { id: "gram", n: 6, jp: "文法形式の判断", name: "Grammar form", desc: "Pick the grammar pattern that fills the blank.", need: "Paste at least 4 grammar points, with examples that contain the pattern (〜に際して → 卒業に際して…)." },
    { id: "comp", n: 7, jp: "文の組み立て", name: "Sentence composition ★", desc: "Tap the 4 parts in the right order.", need: "Add longer example sentences (about 10+ characters with particles like は・が・を・に) to words or grammar points." }
  ];
  var DRILL_SIZE = 10;
  var drillCache = { sig: null, data: null };
  function drillSection(id) {
    for (var i = 0; i < DRILL_SECTIONS.length; i++) if (DRILL_SECTIONS[i].id === id) return DRILL_SECTIONS[i];
    return null;
  }
  function dPick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
  function dHasKanji(s) { return HAS_KANJI_RE.test(String(s || "")); }
  var D_STOP = { to: 1, the: 1, a: 1, an: 1, of: 1, be: 1, "for": 1, and: 1, or: 1, in: 1, on: 1, at: 1, with: 1, something: 1, someone: 1, one: 1, "one's": 1, get: 1, become: 1, make: 1, very: 1, from: 1, is: 1, as: 1, by: 1, up: 1 };
  function dWords(en) {
    return String(en || "").toLowerCase().replace(/\([^)]*\)/g, " ").split(/[^a-z']+/).filter(function (w) { return w.length >= 3 && !D_STOP[w]; });
  }
  function dOverlap(a, b) {
    var wa = dWords(a), wb = dWords(b);
    for (var i = 0; i < wa.length; i++) {
      for (var j = 0; j < wb.length; j++) {
        if (wa[i] === wb[j]) return true;
        if (wa[i].length >= 5 && wb[j].length >= 5 && wa[i].slice(0, 5) === wb[j].slice(0, 5)) return true;
      }
    }
    return false;
  }
  function dIsVerbish(en) { return /^to\s/i.test(String(en || "").trim()); }
  /* Word "shape": verbs/adjectives end in kana (okurigana), nouns end in kanji. */
  function dShape(k) {
    k = String(k || "");
    var last = k.charAt(k.length - 1);
    if (dHasKanji(last)) return "noun";
    if (last === "い" && dHasKanji(k.charAt(k.length - 2))) return "adj-i:" + k.length;
    return "kana:" + last;
  }

  /* ---------- pools ---------- */
  function drillWordPool() {
    var out = [], seen = {};
    function add(w, src, chapterId) {
      if (!w || !w.id || !w.kanji) return;
      var kanji = String(w.kanji).trim(), reading = String(w.reading || "").trim();
      var k = kanji + "\u0000" + reading;
      if (seen[k]) return;
      seen[k] = 1;
      out.push({ id: w.id, src: src, chapterId: chapterId || null, kanji: kanji, reading: reading, english: String(w.english || "").trim(), example: String(w.example || "").trim() });
    }
    (progress.words || []).forEach(function (w) { add(w, "w"); });
    (progress.chapters || []).forEach(function (ch) { (ch.words || []).forEach(function (w) { add(w, "cw", ch.id); }); });
    return out;
  }
  function drillGrammarPool() {
    var out = [];
    (progress.grammarChapters || []).forEach(function (ch) {
      (ch.points || []).forEach(function (p) {
        if (!p || !p.id || !p.pattern) return;
        out.push({ id: p.id, chapterId: ch.id, pattern: p.pattern, reading: p.reading || "", meaning: p.meaning || "", usage: p.usage || "", example: String(p.example || "").trim(), core: gCore(p.pattern) });
      });
    });
    return out;
  }
  function gCore(pattern) { return String(pattern || "").replace(/[\s\u3000〜～~…・]+/g, "").split(/[\/／]/)[0]; }
  var comboIdx = null;
  function comboIndex() {
    if (comboIdx) return comboIdx;
    var list = [];
    var levels = (window.COMBOS && window.COMBOS.levels) || {};
    Object.keys(levels).forEach(function (k) { (levels[k].words || []).forEach(function (w) { if (w && w.kanji) list.push(w); }); });
    comboIdx = { list: list };
    return comboIdx;
  }
  /* Everything we know: her words first, then Combos. */
  function knownWords(pool) {
    var all = pool.map(function (w) { return { kanji: w.kanji, reading: w.reading, english: w.english, mine: true }; });
    comboIndex().list.forEach(function (w) { all.push({ kanji: w.kanji, reading: w.reading, english: w.english, mine: false }); });
    return all;
  }
  function drillData() {
    var pool = drillWordPool();
    var gpool = drillGrammarPool();
    var sig = pool.map(function (w) { return w.id + w.kanji + w.reading + w.english.length + w.example.length; }).join("|") + "#" +
      gpool.map(function (p) { return p.id + p.pattern + p.example.length; }).join("|") + "#" + comboIndex().list.length;
    if (drillCache.sig === sig) return assembleDrillItems(drillCache.data);
    var known = knownWords(pool);
    var byReading = {}, byChar = {}, kanjiSet = {};
    known.forEach(function (w) {
      (byReading[w.reading] = byReading[w.reading] || []).push(w);
      kanjiSet[w.kanji] = 1;
      String(w.kanji).split("").forEach(function (c) { if (dHasKanji(c)) (byChar[c] = byChar[c] || []).push(w); });
    });
    /* Prefix/suffix inventory from HER words only: X+word or word+X where "word" is itself a known word
       (hers or Combos). Combos alone is too noisy for affixes, so it only confirms the stem. */
    var pre = {}, suf = {};
    pool.map(function (w) { return w.kanji; }).forEach(function (k) {
      if (k.length < 3) return;
      var head = k.charAt(0), restP = k.slice(1), tail = k.charAt(k.length - 1), restS = k.slice(0, -1);
      if (dHasKanji(head) && dHasKanji(restP.charAt(0)) && kanjiSet[restP]) (pre[head] = pre[head] || []).push(k);
      if (dHasKanji(tail) && dHasKanji(restS.charAt(restS.length - 1)) && kanjiSet[restS]) (suf[tail] = suf[tail] || []).push(k);
    });
    var data = { pool: pool, gpool: gpool, known: known, byReading: byReading, byChar: byChar, kanjiSet: kanjiSet, pre: pre, suf: suf, mine: {}, items: {}, bi: {} };
    /* Which items can make a question in each section (built once per data change). */
    DRILL_SECTIONS.forEach(function (s) {
      var ok = [];
      var src = s.id === "gram" ? gpool : s.id === "comp" ? pool.concat(gpool) : pool;
      src.forEach(function (it) { if (buildDrillQuestion(s.id, it, data)) ok.push(it); });
      data.mine[s.id] = ok;
    });
    drillCache = { sig: sig, data: data };
    return assembleDrillItems(data);
  }

  /* ---------- built-in N2 set (data/drills.js, loaded only when Drill opens) ----------
     Kept apart from her own items: own keys look like "read:w123", built-in keys like "read:b:v:警備".
     Per-section source (My items / Built-in / Both) and "★ Important only" are device settings. */
  var DRILL_SRC_KEY = "jlpt-n2-drill-src";
  var DRILL_IMP_KEY = "jlpt-n2-drill-imp";
  function drillSrcPrefs() {
    try { var o = JSON.parse(localStorage.getItem(DRILL_SRC_KEY) || "{}"); return o && typeof o === "object" ? o : {}; } catch (e) { return {}; }
  }
  function drillSrcFor(sid) {
    var v = drillSrcPrefs()[sid];
    return v === "mine" || v === "builtin" ? v : "both";
  }
  function setDrillSrc(sid, v) {
    var o = drillSrcPrefs();
    if (v === "both") delete o[sid]; else o[sid] = v;
    try { localStorage.setItem(DRILL_SRC_KEY, JSON.stringify(o)); } catch (e) { /* private mode */ }
  }
  function drillImpOnly() {
    try { return localStorage.getItem(DRILL_IMP_KEY) === "1"; } catch (e) { return false; }
  }
  function setDrillImpOnly(on) {
    try { if (on) localStorage.setItem(DRILL_IMP_KEY, "1"); else localStorage.removeItem(DRILL_IMP_KEY); } catch (e) { /* private mode */ }
  }
  var builtinLoad = { loading: false, failed: false };
  var builtinIdx = null;
  function ensureBuiltin() {
    if (window.DRILLS || builtinLoad.loading) return;
    builtinLoad.loading = true;
    builtinLoad.failed = false;
    var sc = document.createElement("script");
    sc.src = "data/drills.js";
    sc.async = true;
    sc.onload = function () {
      builtinLoad.loading = false;
      builtinIdx = null;
      if (pageName() === "drill" && !ui.drill) render();
    };
    sc.onerror = function () {
      builtinLoad.loading = false;
      builtinLoad.failed = true;
      sc.parentNode && sc.parentNode.removeChild(sc);
      if (pageName() === "drill" && !ui.drill) render();
    };
    document.head.appendChild(sc);
  }
  function builtinItems() {
    if (builtinIdx) return builtinIdx;
    var D = window.DRILLS;
    if (!D) return null;
    var out = { read: [], ortho: [], form: [], ctx: [], para: [], gram: [], comp: [], points: {}, star: [], credits: D.credits || "" };
    (D.gram || []).forEach(function (g) {
      var pt = { pid: g[0], pattern: g[1], reading: g[2], meaning: g[3], note: g[4], star: !!g[5], n: (g[6] || []).length };
      out.points[pt.pid] = pt;
      if (pt.star) out.star.push(pt);
      (g[6] || []).forEach(function (q, i) {
        out.gram.push({ id: "b:g:" + pt.pid + ":" + (i + 1), bi: "gram", point: pt, star: pt.star, sentence: q[0], answer: q[1], wrong: q.slice(2, 5) });
      });
    });
    (D.comp || []).forEach(function (c) {
      var pt = out.points[c[0]] || null;
      out.comp.push({ id: "b:c:" + c[0], bi: "comp", point: pt, star: !!(pt && pt.star), pre: c[1], parts: c[2], post: c[3] });
    });
    (D.vocab || []).forEach(function (v) {
      out.read.push({ id: "b:v:" + v[0], bi: "read", kanji: v[0], reading: v[1], english: v[2], sentence: v[3], wrong: v[4] });
      out.ortho.push({ id: "b:v:" + v[0], bi: "ortho", kanji: v[0], reading: v[1], english: v[2], sentence: v[3], wrong: v[5] });
    });
    (D.ctx || []).forEach(function (x) {
      out.ctx.push({ id: "b:x:" + x[1], bi: "ctx", sentence: x[0], kanji: x[1], reading: x[2], english: x[3], wrong: x[4] });
    });
    (D.para || []).forEach(function (x) {
      out.para.push({ id: "b:p:" + x[1], bi: "para", sentence: x[0], kanji: x[1], reading: x[2], english: x[3], answer: x[4], wrong: x[5] });
    });
    (D.form || []).forEach(function (x) {
      out.form.push({ id: "b:f:" + x[3], bi: "form", sentence: x[0], answer: x[1], wrong: x[2], kanji: x[3], reading: x[4], english: x[5], mode: x[6] });
    });
    builtinIdx = out;
    return out;
  }
  /* Built-in items for a section after the ★ filter (grammar + composition only). */
  function builtinFor(sid) {
    var B = builtinItems();
    if (!B) return [];
    var list = B[sid] || [];
    if ((sid === "gram" || sid === "comp") && drillImpOnly()) list = list.filter(function (it) { return it.star; });
    return list;
  }
  function assembleDrillItems(data) {
    data.items = {};
    data.bi = {};
    DRILL_SECTIONS.forEach(function (s) {
      var mine = data.mine[s.id] || [], bi = builtinFor(s.id), src = drillSrcFor(s.id);
      data.bi[s.id] = bi;
      data.items[s.id] = src === "mine" ? mine : src === "builtin" ? bi : mine.concat(bi);
    });
    return data;
  }
  function biBlank(sentence, label) {
    var i = sentence.indexOf("＿＿");
    return esc(sentence.slice(0, i)) + '<span class="dr-blank">' + esc(label || "（　　）") + "</span>" + esc(sentence.slice(i + 2));
  }
  function biUnderline(sentence) {
    var a = sentence.indexOf("{"), b = sentence.indexOf("}");
    return esc(sentence.slice(0, a)) + '<u class="dr-u">' + esc(sentence.slice(a + 1, b)) + "</u>" + esc(sentence.slice(b + 1));
  }
  function buildBuiltinQuestion(section, it) {
    var key = section + ":" + it.id, q = null;
    if (section === "read") q = mcq(section, key, "bword", it, underlineIn(it.sentence, it.kanji), "How is the underlined word read?", it.reading, it.wrong);
    else if (section === "ortho") q = mcq(section, key, "bword", it, underlineIn(it.sentence, it.kanji, it.reading), "Which is the right way to write the underlined word?", it.kanji, it.wrong);
    else if (section === "ctx") q = mcq(section, key, "bword", it, biBlank(it.sentence), "Which word fits the blank?", it.kanji, it.wrong);
    else if (section === "para") q = mcq(section, key, "bword", it, biUnderline(it.sentence), "Which is closest in meaning to the underlined part?", it.answer, it.wrong);
    else if (section === "form") {
      q = mcq(section, key, "bword", it, biBlank(it.sentence, "（　）"), it.mode === "pre" ? "Which prefix completes the word?" : "Which suffix completes the word?", it.answer, it.wrong);
      q.formMode = it.mode;
    } else if (section === "gram") q = mcq(section, key, "bgram", it, biBlank(it.sentence), "Which grammar fits the blank?", it.answer, it.wrong);
    else if (section === "comp") {
      var order = [0, 1, 2, 3];
      for (var g = 0; g < 10 && order.join() === "0,1,2,3"; g++) order = shuffleIds([0, 1, 2, 3]);
      if (order.join() === "0,1,2,3") order = [2, 0, 3, 1];
      q = { section: section, key: key, srcType: "bgram", item: it, kind: "comp", chunks: it.parts.slice(), order: order, pre: it.pre, end: it.post,
        ask: "Put the 4 parts in order. Which part goes in ★?" };
    }
    if (q) q.bi = true;
    return q;
  }
  /* Her own word with the same spelling+reading as a built-in item (built-in mistakes only feed Wrong words then). */
  function myWordFor(kanji, reading) {
    var pool = drillWordPool();
    for (var i = 0; i < pool.length; i++) if (pool[i].kanji === kanji && pool[i].reading === reading) return wordBy(pool[i].id);
    return null;
  }

  /* ---------- distractor helpers ---------- */
  var D_DAKU = { "か": "が", "き": "ぎ", "く": "ぐ", "け": "げ", "こ": "ご", "さ": "ざ", "し": "じ", "す": "ず", "せ": "ぜ", "そ": "ぞ", "た": "だ", "て": "で", "と": "ど", "は": "ば", "ひ": "び", "ふ": "ぶ", "へ": "べ", "ほ": "ぼ" };
  var D_UNDAKU = {};
  Object.keys(D_DAKU).forEach(function (k) { D_UNDAKU[D_DAKU[k]] = k; });
  var D_HANDAKU = { "は": "ぱ", "ひ": "ぴ", "ふ": "ぷ", "へ": "ぺ", "ほ": "ぽ", "ば": "ぱ", "び": "ぴ", "ぶ": "ぷ", "べ": "ぺ", "ぼ": "ぽ" };
  function readingVariants(r) {
    var out = {}, i, c;
    function put(s) {
      if (!s || s === r || s.length < 2 || !isKanaOnly(s)) return;
      if (/[ぢづ]/.test(s) && !/[ぢづ]/.test(r)) return;
      out[s] = 1;
    }
    for (i = 0; i < r.length; i++) {
      c = r.charAt(i);
      if (D_DAKU[c]) put(r.slice(0, i) + D_DAKU[c] + r.slice(i + 1));
      if (D_UNDAKU[c]) put(r.slice(0, i) + D_UNDAKU[c] + r.slice(i + 1));
      if (D_HANDAKU[c] && i > 0) put(r.slice(0, i) + D_HANDAKU[c] + r.slice(i + 1));
      if (c === "っ") put(r.slice(0, i) + r.slice(i + 1));
      if ("ゃゅょ".indexOf(c) !== -1) put(r.slice(0, i) + { "ゃ": "や", "ゅ": "ゆ", "ょ": "よ" }[c] + r.slice(i + 1));
      if ("ゃゅょ".indexOf(c) !== -1 && r.charAt(i + 1) === "う") put(r.slice(0, i + 1) + r.slice(i + 2));
      if ("ゅょ".indexOf(c) !== -1 && r.charAt(i + 1) !== "う") put(r.slice(0, i + 1) + "う" + r.slice(i + 1));
      if (c === "う" && i > 0 && "おこそとのほもよろごぞどぼぽ".indexOf(r.charAt(i - 1)) !== -1) put(r.slice(0, i) + r.slice(i + 1));
      if (i > 0 && i < r.length - 1 && "かきくけこさしすせそたちつてとぱぴぷぺぽ".indexOf(c) !== -1 && "っん".indexOf(r.charAt(i - 1)) === -1 && "きちくつ".indexOf(r.charAt(i - 1)) !== -1) put(r.slice(0, i - 1) + "っ" + r.slice(i));
    }
    return Object.keys(out);
  }
  function takeDistinct(target, tiers, n, bad) {
    var got = [], seen = {};
    seen[target] = 1;
    (bad || []).forEach(function (b) { seen[b] = 1; });
    tiers.forEach(function (tier) {
      shuffleIds(tier.list).forEach(function (x) {
        if (got.length >= n || tier.taken >= (tier.max == null ? 99 : tier.max)) return;
        if (!x || seen[x]) return;
        seen[x] = 1;
        got.push(x);
        tier.taken = (tier.taken || 0) + 1;
      });
    });
    return got.length >= n ? got : null;
  }
  function mcq(section, key, srcType, item, promptHtml, ask, correct, distractors, labelLang) {
    var opts = shuffleIds([correct].concat(distractors));
    return { section: section, key: key, srcType: srcType, item: item, prompt: promptHtml, ask: ask, kind: "mcq", lang: labelLang || "ja",
      options: opts, answer: opts.indexOf(correct) };
  }
  function underlineIn(sentence, word, replacement) {
    var i = sentence.indexOf(word);
    if (i === -1) return null;
    return esc(sentence.slice(0, i)) + '<u class="dr-u">' + esc(replacement == null ? word : replacement) + "</u>" + esc(sentence.slice(i + word.length));
  }
  function blankIn(sentence, word) {
    var i = sentence.indexOf(word);
    if (i === -1) return null;
    return { html: esc(sentence.slice(0, i)) + '<span class="dr-blank">（　　）</span>' + esc(sentence.slice(i + word.length)), frame: sentence.slice(0, i) + "\u0000" + sentence.slice(i + word.length) };
  }
  function wordPrompt(it, shown) {
    var html = it.example ? underlineIn(it.example, it.kanji, shown) : null;
    return html || '<u class="dr-u">' + esc(shown == null ? it.kanji : shown) + "</u>";
  }

  /* ---------- question builders (return null when the item cannot make a fair question) ---------- */
  function buildDrillQuestion(section, it, data) {
    if (it && it.bi) return buildBuiltinQuestion(section, it);
    data = data || drillData();
    var key = section + ":" + it.id;
    if (section === "read") {
      if (!dHasKanji(it.kanji) || !it.reading || !isKanaOnly(it.reading) || it.reading === it.kanji) return null;
      var sameKanjiReadings = (data.known.filter(function (w) { return w.kanji === it.kanji; })).map(function (w) { return w.reading; });
      var shared = {};
      it.kanji.split("").forEach(function (c) {
        (data.byChar[c] || []).forEach(function (w) { if (w.kanji !== it.kanji && Math.abs(w.reading.length - it.reading.length) <= 1 && isKanaOnly(w.reading)) shared[w.reading] = 1; });
      });
      var sameLen = data.known.filter(function (w) { return w.kanji !== it.kanji && w.reading.length === it.reading.length && isKanaOnly(w.reading); }).map(function (w) { return w.reading; });
      var d = takeDistinct(it.reading, [
        { list: Object.keys(shared), max: 1 },
        { list: readingVariants(it.reading), max: 2 },
        { list: Object.keys(shared) },
        { list: sameLen }
      ], 3, sameKanjiReadings);
      if (!d) return null;
      return mcq(section, key, "word", it, wordPrompt(it), "How is the underlined word read?", it.reading, d);
    }
    if (section === "ortho") {
      if (!dHasKanji(it.kanji) || !it.reading || !isKanaOnly(it.reading) || it.reading === it.kanji) return null;
      var hasCtx = !!(it.example && it.example.indexOf(it.kanji) !== -1);
      var shape = dShape(it.kanji);
      var homo = (data.byReading[it.reading] || []).filter(function (w) { return w.kanji !== it.kanji && dHasKanji(w.kanji) && !dOverlap(w.english, it.english); }).map(function (w) { return w.kanji; });
      var share = {};
      it.kanji.split("").forEach(function (c) {
        (data.byChar[c] || []).forEach(function (w) { if (w.kanji !== it.kanji && w.kanji.length === it.kanji.length && dShape(w.kanji) === shape && w.reading !== it.reading) share[w.kanji] = 1; });
      });
      var sameShape = data.known.filter(function (w) { return w.kanji !== it.kanji && dHasKanji(w.kanji) && w.kanji.length === it.kanji.length && dShape(w.kanji) === shape && w.reading !== it.reading; }).map(function (w) { return w.kanji; });
      var od = takeDistinct(it.kanji, [
        { list: hasCtx ? homo : [], max: 1 },
        { list: Object.keys(share), max: 2 },
        { list: sameShape }
      ], 3);
      if (!od) return null;
      return mcq(section, key, "word", it, wordPrompt(it, it.reading), "Which is the right way to write the underlined word?", it.kanji, od);
    }
    if (section === "form") {
      var k = it.kanji;
      if (k.length < 3) return null;
      var tries = [];
      if (dHasKanji(k.charAt(0)) && data.kanjiSet[k.slice(1)] && dHasKanji(k.charAt(1)) && data.pre[k.charAt(0)]) tries.push("pre");
      if (dHasKanji(k.charAt(k.length - 1)) && data.kanjiSet[k.slice(0, -1)] && dHasKanji(k.charAt(k.length - 2)) && data.suf[k.charAt(k.length - 1)]) tries.push("suf");
      if (!tries.length) return null;
      var mode = null, affix = null, rest = null, fd = null;
      shuffleIds(tries).some(function (m) {
        var af = m === "pre" ? k.charAt(0) : k.charAt(k.length - 1);
        var rs = m === "pre" ? k.slice(1) : k.slice(0, -1);
        var stats = m === "pre" ? data.pre : data.suf;
        var others = Object.keys(stats).filter(function (a) {
          return a !== af && !data.kanjiSet[m === "pre" ? a + rs : rs + a];
        });
        var got = takeDistinct(af, [{ list: others }], 3);
        if (!got) return false;
        mode = m; affix = af; rest = rs; fd = got;
        return true;
      });
      if (!fd) return null;
      var shownWord = mode === "pre" ? "（　）" + rest : rest + "（　）";
      var fp = it.example && it.example.indexOf(k) !== -1
        ? esc(it.example.slice(0, it.example.indexOf(k))) + '<span class="dr-blank">' + esc(shownWord) + "</span>" + esc(it.example.slice(it.example.indexOf(k) + k.length))
        : '<span class="dr-blank">' + esc(shownWord) + "</span>";
      var q = mcq(section, key, "word", it, fp, mode === "pre" ? "Which prefix completes the word?" : "Which suffix completes the word?", affix, fd);
      q.formMode = mode;
      return q;
    }
    if (section === "ctx") {
      if (!it.example || !it.english) return null;
      var bl = blankIn(it.example, it.kanji);
      if (!bl) return null;
      var cshape = dShape(it.kanji);
      function fitsFrame(w) {
        var b2 = w.example ? blankIn(w.example, w.kanji) : null;
        return b2 && b2.frame === bl.frame;
      }
      var mine = data.pool.filter(function (w) {
        return w.id !== it.id && w.kanji !== it.kanji && w.reading !== it.reading && dShape(w.kanji) === cshape && !dOverlap(w.english, it.english) && !fitsFrame(w);
      }).map(function (w) { return w.kanji; });
      var more = data.known.filter(function (w) {
        return !w.mine && w.kanji !== it.kanji && w.reading !== it.reading && dHasKanji(w.kanji) === dHasKanji(it.kanji) && dShape(w.kanji) === cshape && Math.abs(w.kanji.length - it.kanji.length) <= 1 && !dOverlap(w.english, it.english);
      }).map(function (w) { return w.kanji; });
      var cd = takeDistinct(it.kanji, [{ list: mine }, { list: more }], 3);
      if (!cd) return null;
      if (data.pool.filter(function (w) { return w.example && w.example.indexOf(w.kanji) !== -1; }).length < 4) return null;
      return mcq(section, key, "word", it, bl.html, "Which word fits the blank?", it.kanji, cd);
    }
    if (section === "para") {
      if (!it.english) return null;
      var verb = dIsVerbish(it.english);
      var mineE = data.pool.filter(function (w) { return w.id !== it.id && w.english && dIsVerbish(w.english) === verb && !dOverlap(w.english, it.english) && w.english.toLowerCase() !== it.english.toLowerCase(); }).map(function (w) { return w.english; });
      var moreE = data.known.filter(function (w) { return !w.mine && w.english && w.kanji !== it.kanji && dIsVerbish(w.english) === verb && !dOverlap(w.english, it.english); }).map(function (w) { return w.english; });
      var pd = takeDistinct(it.english, [{ list: mineE, max: 2 }, { list: moreE }, { list: mineE }], 3);
      if (!pd) return null;
      return mcq(section, key, "word", it, wordPrompt(it), "Which meaning is closest to the underlined word?", it.english, pd, "en");
    }
    if (section === "gram") {
      if (!it.core || !it.example) return null;
      var gb = blankIn(it.example, it.core);
      if (!gb) return null;
      var cores = {};
      data.gpool.forEach(function (p) {
        if (!p.core || p.id === it.id) return;
        if (p.core === it.core || p.core.indexOf(it.core) !== -1 || it.core.indexOf(p.core) !== -1) return;
        cores[p.core] = 1;
      });
      var gd = takeDistinct(it.core, [{ list: Object.keys(cores) }], 3);
      if (!gd) return null;
      return mcq(section, key, "gram", it, gb.html, "Which grammar fits the blank?", it.core, gd);
    }
    if (section === "comp") {
      if (!it.example) return null;
      var protect = it.core || it.kanji || "";
      var chunks = sentenceChunks(it.example, protect);
      if (!chunks) return null;
      var order = [0, 1, 2, 3];
      for (var g = 0; g < 10 && order.join() === "0,1,2,3"; g++) order = shuffleIds([0, 1, 2, 3]);
      if (order.join() === "0,1,2,3") order = [2, 0, 3, 1];
      var end = (it.example.match(/[。．！？!?]+$/) || [""])[0];
      return { section: section, key: key, srcType: it.core != null ? "gram" : "word", item: it, kind: "comp", chunks: chunks, order: order, end: end,
        ask: "Put the 4 parts in order. Which part goes in ★?" };
    }
    return null;
  }
  /* Split a sentence into exactly 4 parts at particles/commas; never split inside the protected word/pattern. */
  function sentenceChunks(sentence, protect) {
    var body = String(sentence || "").replace(/[。．！？!?]+$/, "");
    if (body.length < 10) return null;
    var pStart = protect ? body.indexOf(protect) : -1;
    var pEnd = pStart === -1 ? -1 : pStart + protect.length - 1;
    var P = "はがをにでへともの";
    var segs = [], cur = "";
    for (var i = 0; i < body.length; i++) {
      var ch = body.charAt(i), next = body.charAt(i + 1), prev = body.charAt(i - 1), prev2 = body.charAt(i - 2);
      cur += ch;
      if (!next) break;
      if (pStart !== -1 && i >= pStart && i < pEnd) continue;
      if (ch === "、" || ch === "，") { segs.push(cur); cur = ""; continue; }
      if (P.indexOf(ch) !== -1 && next !== "、" && P.indexOf(next) === -1) {
        var prevOk = dHasKanji(prev) || /[\u30A0-\u30FF）」]/.test(prev) || (P.indexOf(prev) !== -1 && dHasKanji(prev2));
        if (prevOk) { segs.push(cur); cur = ""; }
      }
    }
    if (cur) segs.push(cur);
    segs = segs.filter(Boolean);
    if (segs.length < 4) return null;
    while (segs.length > 4) {
      var best = 0, bestLen = 1e9;
      for (var j = 0; j < segs.length - 1; j++) {
        var L = segs[j].length + segs[j + 1].length;
        if (L < bestLen) { bestLen = L; best = j; }
      }
      segs.splice(best, 2, segs[best] + segs[best + 1]);
    }
    var seen = {};
    for (var m = 0; m < 4; m++) {
      if (segs[m].length < 2 || seen[segs[m]]) return null;
      seen[segs[m]] = 1;
    }
    return segs;
  }

  /* ---------- results log + derived redo state ---------- */
  function drillStatusMap() {
    var by = {};
    (progress.drillLog || []).forEach(function (e) { if (e && e.key) (by[e.key] = by[e.key] || []).push(e); });
    var today = todayISO();
    var out = {};
    Object.keys(by).forEach(function (k) {
      var list = by[k].slice().sort(function (a, b) { return String(a.at).localeCompare(String(b.at)); });
      var st = { key: k, section: list[0].section, state: "new", prio: 0, badDay: null, lastAt: null, lastDay: null, n: list.length, waiting: false };
      list.forEach(function (e) {
        st.lastAt = e.at;
        st.lastDay = e.day;
        if (!e.ok || e.mark === "wrong") { st.state = "redo"; st.prio = 3; st.badDay = e.day; st.waiting = false; }
        else if (e.mark === "lucky") { st.state = "redo"; st.prio = 2; st.badDay = e.day; st.waiting = false; }
        else if (e.mark === "elim") { st.state = "redo"; st.prio = 1; st.badDay = e.day; st.waiting = false; }
        else if (st.state === "redo" && st.badDay && String(e.day) <= String(st.badDay)) { st.prio = 0.5; st.waiting = true; }
        else { st.state = "done"; st.prio = 0; st.waiting = false; }
      });
      st.due = st.state === "redo" && !(st.waiting && st.lastDay === today);
      out[k] = st;
    });
    return out;
  }
  function drillSummary(data) {
    var status = drillStatusMap();
    var res = { total: { redo: 0, waiting: 0 }, sections: {} };
    DRILL_SECTIONS.forEach(function (s) {
      var row = { available: data.items[s.id].length, redo: 0, waiting: 0, knew: 0, elim: 0, lucky: 0, wrong: 0, keys: {} };
      data.items[s.id].forEach(function (it) {
        var key = s.id + ":" + it.id;
        row.keys[key] = 1;
        var st = status[key];
        if (st && st.state === "redo") { if (st.due) row.redo += 1; else row.waiting += 1; }
      });
      res.sections[s.id] = row;
      res.total.redo += row.redo;
      res.total.waiting += row.waiting;
    });
    (progress.drillLog || []).forEach(function (e) {
      var row = e && res.sections[e.section];
      if (!row) return;
      var m = !e.ok ? "wrong" : e.mark;
      if (row[m] != null) row[m] += 1;
    });
    res.status = status;
    return res;
  }
  function drillRecord(q, ok, mark) {
    if (!Array.isArray(progress.drillLog)) progress.drillLog = [];
    progress.drillLog.push({ id: newId("dr"), key: q.key, section: q.section, src: q.item.id, at: new Date().toISOString(), day: todayISO(), ok: !!ok, mark: mark });
    bumpStat("drillQs", 1);
    var w = null;
    if (q.srcType === "word" && q.section !== "comp") w = wordBy(q.item.id);
    else if (q.srcType === "bword" && q.item.reading) w = myWordFor(q.item.kanji, q.item.reading);
    if (w) {
      if (w && !ok) {
        var daily = progress.words.indexOf(w) !== -1 ? w : ensureDailyFromChapterWord(w);
        var today = todayISO();
        var dupe = (progress.mistakes || []).some(function (m) { return m && m.wordId === daily.id && !m.resolved && m.day === today; });
        if (!dupe) logCouldNotRead(daily, today);
      } else if (w && ok && mark === "knew") {
        var own = null;
        for (var i = 0; i < progress.words.length; i++) if (progress.words[i].kanji === w.kanji && progress.words[i].reading === w.reading) own = progress.words[i];
        if (own) recordCorrectReview(own.id);
      }
    }
    saveProgress();
  }

  /* ---------- sessions ---------- */
  function startDrill(scope) {
    var data = drillData();
    var sum = drillSummary(data);
    var secs = scope === "mixed" || scope === "redo" || scope === "builtin" ? DRILL_SECTIONS.map(function (s) { return s.id; }) : [scope];
    var cands = [];
    secs.forEach(function (sid) {
      var list = scope === "builtin" ? data.bi[sid] : data.items[sid];
      list.forEach(function (it) { cands.push({ sid: sid, it: it, key: sid + ":" + it.id, st: sum.status[sid + ":" + it.id] }); });
    });
    var redo = cands.filter(function (c) { return c.st && c.st.state === "redo" && c.st.due; })
      .sort(function (a, b) { return (b.st.prio - a.st.prio) || String(a.st.lastAt).localeCompare(String(b.st.lastAt)); });
    var picked = redo.slice(0, DRILL_SIZE);
    if (scope !== "redo") {
      var freshAll = cands.filter(function (c) { return !c.st; });
      /* With "Both", alternate her items and built-in ones so her own words are not drowned out. */
      var freshMine = shuffleIds(freshAll.filter(function (c) { return !c.it.bi; })), freshBi = shuffleIds(freshAll.filter(function (c) { return c.it.bi; }));
      var fresh = [];
      while (freshMine.length || freshBi.length) {
        if (freshMine.length) fresh.push(freshMine.shift());
        if (freshBi.length) fresh.push(freshBi.shift());
      }
      var done = shuffleIds(cands.filter(function (c) { return c.st && c.st.state !== "redo"; })).sort(function (a, b) { return String(a.st.lastAt).localeCompare(String(b.st.lastAt)); });
      var waiting = cands.filter(function (c) { return c.st && c.st.state === "redo" && !c.st.due; });
      if (scope === "mixed" || scope === "builtin") {
        /* spread across sections */
        var bySec = {};
        fresh.concat(done).forEach(function (c) { (bySec[c.sid] = bySec[c.sid] || []).push(c); });
        var keysS = shuffleIds(Object.keys(bySec)), progressMade = true;
        while (picked.length < DRILL_SIZE && progressMade) {
          progressMade = false;
          keysS.forEach(function (sid) { if (picked.length < DRILL_SIZE && bySec[sid].length) { picked.push(bySec[sid].shift()); progressMade = true; } });
        }
      } else {
        fresh.concat(done).forEach(function (c) { if (picked.length < DRILL_SIZE) picked.push(c); });
      }
      waiting.forEach(function (c) { if (picked.length < DRILL_SIZE) picked.push(c); });
    }
    var seenSrc = {};
    var qs = [];
    picked.forEach(function (c) {
      if (seenSrc[c.key]) return;
      seenSrc[c.key] = 1;
      var q = buildDrillQuestion(c.sid, c.it, data);
      if (q) { q.wasRedo = !!(c.st && c.st.state === "redo"); qs.push(q); }
    });
    if (!qs.length) return false;
    ui.drill = { scope: scope, qs: qs, index: 0, answered: null, results: [], placed: [null, null, null, null], counted: false };
    return true;
  }
  function drillCardHtml(q) {
    var it = q.item, html = '<div class="card dr-card">';
    if (it.bi) return builtinCardHtml(q);
    if (q.srcType === "gram") {
      html += '<div class="jp" lang="ja">' + gPatternHtml(it) + "</div>";
      html += gReadingLine(it);
      html += '<p class="meaning">' + esc(it.meaning) + "</p>";
      if (it.usage) html += '<p class="muted">' + esc(it.usage) + "</p>";
    } else {
      html += '<div class="jp" lang="ja">' + (furigana && it.reading && it.reading !== it.kanji ? "<ruby>" + esc(it.kanji) + "<rt>" + esc(it.reading) + "</rt></ruby>" : esc(it.kanji)) + "</div>";
      html += '<p class="meaning" lang="ja">' + esc(it.reading) + "</p>";
      html += '<p class="meaning">' + esc(it.english) + "</p>";
    }
    if (it.example) html += '<p lang="ja">' + esc(it.example) + "</p>";
    html += sayButtonsHtml(drillSpeechText(q), drillSentenceText(q));
    html += "</div>";
    return html;
  }
  /* What Drill feedback says: the word's reading or the grammar pattern's reading. */
  function drillSpeechText(q) {
    var it = q.item || {};
    if (it.bi === "gram" || it.bi === "comp") return speechReadingOfPattern(it.point);
    if (q.srcType === "gram") return speechReadingOfPattern(it);
    return speechReadingOfWord(it);
  }
  /* The whole example sentence (blank filled in) for the Example button. */
  function drillSentenceText(q) {
    var it = q.item || {};
    if (it.bi === "comp") return (it.pre || "") + (it.parts || []).join("") + (it.post || "");
    if (it.bi === "gram") return String(it.sentence).replace("＿＿", it.answer);
    if (it.bi === "form") return String(it.sentence).replace("＿＿", it.answer);
    if (it.bi === "ctx") return String(it.sentence).replace("＿＿", it.kanji);
    if (it.bi === "para") return String(it.sentence).replace(/[{}]/g, "");
    if (it.bi) return it.sentence || "";
    return it.example || "";
  }
  function builtinCardHtml(q) {
    var it = q.item, html = '<div class="card dr-card">';
    html += '<p class="dr-bi-tag">Built-in N2 set' + (it.star ? " · ★ important" : "") + "</p>";
    if (it.bi === "gram" || it.bi === "comp") {
      var pt = it.point || {};
      html += '<div class="jp" lang="ja">' + gPatternHtml(pt) + (pt.star ? ' <span class="dr-star" title="important">★</span>' : "") + "</div>";
      html += gReadingLine(pt);
      html += '<p class="meaning">' + esc(pt.meaning || "") + "</p>";
      if (pt.note) html += '<p class="dr-note" lang="ja">' + esc(pt.note) + "</p>";
      if (it.bi === "gram") html += '<p lang="ja">' + biBlank(it.sentence, it.answer).replace('class="dr-blank"', 'class="dr-fill"') + "</p>";
    } else {
      html += '<div class="jp" lang="ja">' + (furigana && it.reading && it.reading !== it.kanji ? "<ruby>" + esc(it.kanji) + "<rt>" + esc(it.reading) + "</rt></ruby>" : esc(it.kanji)) + "</div>";
      if (it.reading && it.reading !== it.kanji) html += '<p class="meaning" lang="ja">' + esc(it.reading) + "</p>";
      html += '<p class="meaning">' + esc(it.english) + "</p>";
      if (it.bi === "para") html += '<p lang="ja">≈ ' + esc(it.answer) + "</p>" + '<p lang="ja">' + biUnderline(it.sentence) + "</p>";
      else if (it.bi === "ctx") html += '<p lang="ja">' + biBlank(it.sentence, it.kanji).replace('class="dr-blank"', 'class="dr-fill"') + "</p>";
      else if (it.bi === "form") html += '<p lang="ja">' + biBlank(it.sentence, it.answer).replace('class="dr-blank"', 'class="dr-fill"') + "</p>";
      else html += '<p lang="ja">' + esc(it.sentence) + "</p>";
    }
    html += sayButtonsHtml(drillSpeechText(q), drillSentenceText(q));
    html += "</div>";
    return html;
  }
  function renderDrillSession() {
    var st = ui.drill;
    var label = st.scope === "redo" ? "Redo" : st.scope === "mixed" ? "Mixed" : st.scope === "builtin" ? "Built-in N2 set" : (drillSection(st.scope) || {}).name;
    if (st.index >= st.qs.length) {
      if (!st.counted) { st.counted = true; bumpStat("drills", 1); saveProgress(); }
      var c = { knew: 0, elim: 0, lucky: 0, wrong: 0 };
      st.results.forEach(function (r) { c[r] = (c[r] || 0) + 1; });
      var right = st.results.length - c.wrong;
      var html = "<h1>Drill done</h1><p class=\"mode-label\">" + esc(label) + "</p>";
      html += '<p class="score">' + right + " / " + st.results.length + " right</p>";
      html += '<p class="dr-break">Knew it ' + c.knew + " · Elimination " + c.elim + " · Lucky guess " + c.lucky + " · Wrong " + c.wrong + "</p>";
      if (c.wrong + c.elim + c.lucky) html += "<p>Wrong answers, eliminations and lucky guesses went to Redo. Clear them with “Knew it”, best on another day.</p>";
      html += '<button type="button" class="primary" data-act="dr-home">Back to Drill</button>';
      main.innerHTML = html;
      return;
    }
    var q = st.qs[st.index];
    var sec = drillSection(q.section);
    var html2 = '<p class="muted">' + esc(label) + " · " + (st.index + 1) + " of " + st.qs.length + (q.wasRedo ? ' · <span class="badge">redo</span>' : "") + "</p>";
    html2 += '<p class="mode-label">' + sec.n + ". " + esc(sec.name) + ' <span lang="ja">' + esc(sec.jp) + "</span></p>";
    html2 += '<p class="dr-ask">' + esc(q.ask) + "</p>";
    var a = st.answered;
    if (q.kind === "comp") {
      if (q.pre) html2 += '<p class="dr-pre" lang="ja">' + esc(q.pre) + "</p>";
      html2 += '<div class="dr-slots" lang="ja">';
      for (var s = 0; s < 4; s++) {
        var idx = a ? (a.ok ? s : st.placed[s]) : st.placed[s];
        var txt = idx == null ? "" : q.chunks[idx];
        html2 += '<button type="button" class="dr-slot' + (s === 2 ? " star" : "") + (txt ? " filled" : "") + '" data-act="dr-unslot" data-slot="' + s + '"' + (a ? " disabled" : "") + '><span class="dr-num">' + (s === 2 ? "★" : s + 1) + "</span>" + esc(txt || "") + "</button>";
      }
      html2 += '<span class="dr-end">' + esc(q.end || "") + "</span></div>";
      if (!a) {
        html2 += '<div class="dr-chunks" lang="ja">';
        q.order.forEach(function (ci) {
          var used = st.placed.indexOf(ci) !== -1;
          html2 += '<button type="button" class="choice dr-chunk" data-act="dr-chunk" data-i="' + ci + '"' + (used ? " disabled" : "") + ">" + esc(q.chunks[ci]) + "</button>";
        });
        html2 += "</div>";
        if (st.placed.filter(function (x) { return x != null; }).length === 4) html2 += '<button type="button" class="primary" data-act="dr-check">Check</button>';
        else html2 += '<p class="muted">Tap the parts in order. Tap a filled box to take it back.</p>';
      }
    } else {
      html2 += '<p class="dr-prompt" lang="ja">' + q.prompt + "</p>";
      q.options.forEach(function (o, i) {
        var cls = "choice";
        if (a) {
          if (i === q.answer) cls += " right";
          else if (i === a.chosen) cls += " wrong";
        }
        html2 += '<button type="button" class="' + cls + '" lang="' + q.lang + '" data-act="dr-pick" data-i="' + i + '"' + (a ? " disabled" : "") + ">" + (i + 1) + ". " + esc(o) + "</button>";
      });
    }
    if (a) {
      html2 += '<p class="' + (a.ok ? "dr-ok" : "warn dr-bad") + '">' + (a.ok ? "Right." : "Not this one.") + "</p>";
      if (q.kind === "comp") {
        html2 += '<p lang="ja" class="dr-full">' + esc(q.pre || "") + q.chunks.map(function (c2, ci2) { return ci2 === 2 ? "<b>" + esc(c2) + "</b>" : esc(c2); }).join("") + esc(q.end || "") + "</p>";
      }
      html2 += drillCardHtml(q);
      if (a.ok && !a.marked) {
        html2 += '<p class="mode-label">How did you get it?</p><div class="dr-marks">';
        html2 += '<button type="button" class="primary" data-act="dr-mark" data-mark="knew">Knew it</button>';
        html2 += '<button type="button" class="secondary" data-act="dr-mark" data-mark="elim">Elimination</button>';
        html2 += '<button type="button" class="secondary" data-act="dr-mark" data-mark="lucky">Lucky guess</button></div>';
      } else {
        html2 += '<p class="muted">Added to Redo.</p><button type="button" class="primary" data-act="dr-next">Next</button>';
      }
    }
    html2 += '<p><button type="button" class="secondary" data-act="dr-home">Stop</button></p>';
    main.innerHTML = html2;
  }
  function renderDrill() {
    if (ui.drill) { renderDrillSession(); return; }
    ensureBuiltin();
    var data = drillData();
    var sum = drillSummary(data);
    var B = builtinItems();
    var html = "<h1>Drill</h1>";
    html += '<p class="muted">JLPT N2 language knowledge from your own words, chapters and grammar, plus a built-in N2 set. About ' + DRILL_SIZE + " questions a round; redo items come first.</p>";
    html += '<div class="actions">';
    if (sum.total.redo) html += '<button type="button" class="primary" data-act="dr-start" data-scope="redo"><span class="action-title">Redo · ' + sum.total.redo + '</span><span class="action-desc">Wrong answers first, then lucky guesses, then eliminations.</span></button>';
    else html += '<div class="dr-none"><b>Redo · 0</b> <span class="muted">' + (sum.total.waiting ? sum.total.waiting + " waiting for another day." : "Nothing to redo.") + "</span></div>";
    var anyAvail = DRILL_SECTIONS.some(function (s) { return sum.sections[s.id].available; });
    if (anyAvail) html += '<button type="button" class="secondary" data-act="dr-start" data-scope="mixed"><span class="action-title">Mixed round</span><span class="action-desc">All unlocked sections together, using each section’s My items / Built-in choice.</span></button>';
    html += "</div>";
    if (sum.total.redo && sum.total.waiting) html += '<p class="muted">' + sum.total.waiting + " more waiting for another day (you knew them today; check again tomorrow).</p>";

    /* Built-in N2 set */
    var imp = drillImpOnly();
    html += '<section class="card dr-bi"><h2>Built-in N2 set</h2>';
    if (B) {
      var nPts = Object.keys(B.points).length;
      html += '<p class="muted">Original practice questions on high-frequency N2 grammar and vocabulary, kept separate from your own items. Wrong answers go to Redo (and to Wrong words only when the word is also in your list).</p>';
      html += '<ul class="dr-bi-counts">';
      DRILL_SECTIONS.forEach(function (s) {
        var all = (B[s.id] || []).length;
        var extra = s.id === "gram" ? " (" + nPts + " points, " + B.star.length + " ★)" : "";
        html += "<li>" + s.n + ". " + esc(s.name) + ': <b>' + all + "</b>" + extra + "</li>";
      });
      html += "</ul>";
      html += '<button type="button" class="secondary dr-imp" data-act="dr-imp" aria-pressed="' + (imp ? "true" : "false") + '">' + (imp ? "☑" : "☐") + " ★ Important only <span class=\"muted\">(grammar and composition)</span></button>";
      html += '<div class="actions"><button type="button" class="primary" data-act="dr-start" data-scope="builtin"><span class="action-title">Built-in round</span><span class="action-desc">10 questions from the built-in set across all sections' + (imp ? " (★ only for grammar and composition)" : "") + ".</span></button></div>";
      html += '<details class="dr-star-list"><summary>★ The ' + B.star.length + " important grammar points</summary><ul>";
      B.star.forEach(function (pt) { html += '<li><span lang="ja">' + gPatternHtml(pt) + "</span> — " + esc(pt.meaning) + "</li>"; });
      html += "</ul></details>";
      html += '<p class="note dr-credits">' + esc(B.credits) + " Details in SOURCES.md.</p>";
    } else if (builtinLoad.failed) {
      html += '<p class="warn">Could not load the built-in set. If you are offline, open Drill once while online so it is saved for offline use.</p><button type="button" class="secondary" data-act="dr-reload-bi">Try again</button>';
    } else {
      html += '<p class="muted">Loading the built-in set…</p>';
    }
    html += "</section>";

    html += '<h2>Sections</h2><div class="dr-sections">';
    DRILL_SECTIONS.forEach(function (s) {
      var r = sum.sections[s.id];
      var tried = r.knew + r.elim + r.lucky + r.wrong;
      var src = drillSrcFor(s.id), nMine = (data.mine[s.id] || []).length, nBi = (data.bi[s.id] || []).length;
      html += '<div class="dr-sec-wrap">';
      if (r.available) {
        html += '<button type="button" class="dr-sec" data-act="dr-start" data-scope="' + s.id + '">';
        html += '<span class="dr-sec-top"><span class="dr-sec-name">' + s.n + ". " + esc(s.name) + ' <span lang="ja">' + esc(s.jp) + '</span></span><span class="dr-count">' + r.available + "</span></span>";
        html += '<span class="dr-sec-desc">' + esc(s.desc) + "</span>";
        html += '<span class="dr-sec-meta">' + (r.redo ? '<span class="badge">redo ' + r.redo + "</span> " : "") + (tried ? "knew " + r.knew + " · elim " + r.elim + " · lucky " + r.lucky + " · wrong " + r.wrong : "not tried yet") + "</span>";
        html += "</button>";
      } else {
        html += '<div class="dr-sec locked"><span class="dr-sec-top"><span class="dr-sec-name">' + s.n + ". " + esc(s.name) + ' <span lang="ja">' + esc(s.jp) + '</span></span><span class="dr-count">0</span></span>';
        var why = src === "builtin" ? (B ? "No built-in items with the current filter." : "The built-in set is still loading.") : esc(s.need) + (nBi && src === "mine" ? " Or switch to Built-in / Both." : "");
        html += '<span class="dr-sec-desc"><b>Locked.</b> ' + why + "</span></div>";
      }
      html += '<div class="dr-src" role="group" aria-label="Questions from">';
      [["mine", "My items", nMine], ["builtin", "Built-in", nBi], ["both", "Both", nMine + nBi]].forEach(function (o) {
        html += '<button type="button" data-act="dr-src" data-sec="' + s.id + '" data-src="' + o[0] + '" aria-pressed="' + (src === o[0] ? "true" : "false") + '">' + o[1] + ' <span class="dr-src-n">' + o[2] + "</span></button>";
      });
      html += "</div></div>";
    });
    html += "</div>";
    html += '<p class="note">After a right answer, tap <b>Knew it</b>, <b>Elimination</b> or <b>Lucky guess</b>. Only “Knew it” clears an item; after a mistake it needs “Knew it” on a later day. Wrong answers on your own words also show up in Wrong words. <a href="#stats">Stats</a></p>';
    main.innerHTML = html;
  }

  function pageName() {
    var hash = (location.hash || "#today").replace("#", "");
    var open = ["today", "drill", "chapters", "combos", "wrong", "stats", "add", "grammar"];
    if (todayISO() >= EXAM) open = open.concat(["reading", "listening", "test"]);
    if (open.indexOf(hash) === -1) return "today";
    return hash;
  }
  function syncNav() {
    if (todayISO() >= EXAM && !nav.querySelector('[href="#reading"]')) {
      [
        ["#reading", "読", "Read"],
        ["#listening", "聴", "Listen"],
        ["#test", "試", "Test"]
      ].forEach(function (pair) {
        var a = document.createElement("a");
        a.href = pair[0];
        a.innerHTML = '<span class="nav-ico" aria-hidden="true">' + pair[1] + '</span><span class="nav-lbl">' + pair[2] + "</span>";
        nav.appendChild(a);
      });
    }
    var page = pageName();
    nav.querySelectorAll("a").forEach(function (a) {
      var id = (a.getAttribute("href") || "").replace("#", "");
      if (id === page || (page === "stats" && id === "today")) a.setAttribute("aria-current", "page");
      else a.removeAttribute("aria-current");
    });
    if (furiBtn) furiBtn.setAttribute("aria-pressed", furigana ? "true" : "false");
  }
  function backupControlsHtml() {
    return '<div class="backup-bar"><button type="button" class="secondary" data-act="export">Export backup</button><p class="muted">Saves jlpt-n2-progress.json (words, chapters, grammar, mistakes, stats). Import is on Add.</p></div>';
  }

  function renderHome() {
    var today = todayISO();
    var day = todayStudySummary();
    var left = daysBetween(today, EXAM);
    var plan = planFor(today);
    var misses = yesterdayMissIds(progress, today).length;
    var fresh = newItemCount(progress, today);
    var when;
    if (left > 1) when = left + " days to Sunday 6 December 2026.";
    else if (left === 1) when = "1 day to Sunday 6 December 2026.";
    else if (left === 0) when = "Sunday 6 December 2026 is today.";
    else when = "The exam date, 6 December 2026, has passed.";
    var html = '<p class="big-count">' + (left > 0 ? left : 0) + "</p>";
    html += "<p>" + esc(when) + "</p>";
    html += studyBoxHtml(day);
    html += "<h1>" + esc(plan.label) + "</h1>";
    if (progress.doneDays[today]) {
      html += "<p>Today's unit is complete.</p>";
    } else {
      html += "<p>New items for today: " + fresh + "</p>";
      html += "<p>Yesterday's mistakes: " + misses + ' · <a href="#wrong">Wrong words</a></p>';
      html += '<button type="button" class="primary" data-act="start">Start today\'s session</button>';
    }
    html += "<p class=\"muted\">Exam date: 6 December 2026. Pass mark: 90/180, at least 19 in each section. This app does not calculate scaled scores.</p>";
    html += audioSettingsHtml();
    html += syncCardHtml();
    html += backupControlsHtml();
    main.innerHTML = html;
    updateSyncStatus();
  }

  function renderEnd() {
    main.innerHTML = "<p>Today's unit is complete.</p>" + studyBoxHtml(todayStudySummary()) + audioSettingsHtml() + backupControlsHtml();
  }

  function renderStats() {
    flushActiveTime();
    var streak = studyStreak();
    var today = todayStudySummary();
    var recent = statsWindowDays();
    var maxMs = 1;
    recent.forEach(function (d) { if ((d.activeMs || 0) > maxMs) maxMs = d.activeMs; });
    var html = "<h1>Stats</h1>";
    html += '<div class="stat-kpi">';
    html += '<div class="stat-box"><div class="num">' + esc(formatMinutes(today.activeMs)) + '</div><div class="muted">Today</div></div>';
    html += '<div class="stat-box"><div class="num">' + streak + '</div><div class="muted">Day streak</div></div>';
    html += "</div>";
    html += '<p class="mode-label">Time per day</p>';
    html += '<p class="muted">Active while the page is visible (Europe/Bucharest). ' + esc(START) + " → " + esc(STATS_END) + " (newest first). Scroll for the full window.</p>";
    html += '<div class="stat-scroll"><ul class="stat-bars">';
    recent.forEach(function (d) {
      var pct = Math.round(((d.activeMs || 0) / maxMs) * 100);
      html += "<li><span>" + esc(d.date.slice(5)) + '</span><span class="bar-track"><span class="bar-fill" style="width:' + pct + '%"></span></span><span>' + esc(formatMinutes(d.activeMs)) + "</span></li>";
    });
    html += "</ul></div>";
    var drTot = { q: 0, r: 0, ms: 0 };
    recent.forEach(function (d) { drTot.q += d.drillQs || 0; drTot.r += d.drills || 0; drTot.ms += d.drillMs || 0; });
    html += '<p class="mode-label">Drill</p>';
    html += '<p class="muted">Today: ' + (today.drillQs || 0) + " questions, " + (today.drills || 0) + " rounds, " + esc(formatMinutes(today.drillMs || 0)) + ". All days: " + drTot.q + " questions, " + drTot.r + " rounds, " + esc(formatMinutes(drTot.ms)) + '. <a href="#drill">Open Drill</a></p>';
    html += '<p class="mode-label">Completions</p>';
    html += '<p class="muted">Days with activity in the same window.</p>';
    html += '<div class="stat-scroll">';
    var listed = false;
    recent.forEach(function (d) {
      if (!dayHasStudy(d)) return;
      listed = true;
      html += '<div class="item"><div class="w">' + esc(d.date) + "</div>";
      html += '<div class="m">' + esc(formatMinutes(d.activeMs)) + " · sessions " + (d.sessions || 0) + " · quizzes " + (d.quizzes || 0) + " · levels " + (d.levels || 0) + " · words " + (d.wordsGraded || 0) + "</div>";
      if (d.drillQs || d.drills || d.drillMs) html += '<div class="m">Drill: ' + (d.drillQs || 0) + " questions · " + (d.drills || 0) + " rounds · " + esc(formatMinutes(d.drillMs || 0)) + "</div>";
      html += "</div>";
    });
    if (!listed) html += '<div class="empty"><p>No study logged yet. Time counts while this page is open and visible.</p></div>';
    html += "</div>";
    html += backupControlsHtml();
    html += audioSettingsHtml();
    main.innerHTML = html;
  }

  function renderSession() {
    var today = todayISO();
    if (!session || session.day !== today) {
      session = null;
      saveSession();
      renderHome();
      return;
    }
    while (session.index < session.ids.length && !wordBy(session.ids[session.index])) session.index += 1;
    if (session.index >= session.ids.length) {
      finishDay();
      return;
    }
    var w = wordBy(session.ids[session.index]);
    var html = "";
    if (!session.revealed) {
      html += '<button type="button" class="card" data-act="flip"><div class="jp kanji" lang="ja">' + esc(w.kanji) + "</div></button>";
    } else {
      html += '<div class="card">';
      if (furigana && w.reading) {
        html += '<div class="jp kanji" lang="ja"><ruby>' + esc(w.kanji) + "<rt>" + esc(w.reading) + "</rt></ruby></div>";
      }
      html += '<p class="meaning" lang="ja">' + esc(w.reading) + "</p>";
      html += '<p class="meaning">' + esc(w.english) + "</p>";
      if (w.example) html += '<p lang="ja">' + esc(w.example) + "</p>";
      html += sayButtonsHtml(speechReadingOfWord(w), w.example);
      html += "</div>";
      html += '<button type="button" class="primary" data-act="mark" data-ok="1">Read correctly</button>';
      html += '<button type="button" class="could" data-act="mark" data-ok="0">Could not read.</button>';
    }
    main.innerHTML = html;
  }

  function finishDay() {
    var today = todayISO();
    progress.doneDays[today] = true;
    bumpStat("sessions", 1);
    saveProgress();
    session = null;
    saveSession();
    if ((location.hash || "") !== "#today") location.hash = "#today";
    else renderEnd();
  }



  var COMBO_CHUNK = 30;
  function comboLevels() {
    var root = window.COMBOS;
    if (!root || !root.levels) return [];
    return ["n3-common", "n3-less", "n2-common", "n2-less"].map(function (id) {
      var lv = root.levels[id];
      return lv ? { id: id, label: lv.label, count: (lv.words || []).length, words: lv.words || [] } : null;
    }).filter(Boolean);
  }
  function comboLevelById(id) {
    var levels = comboLevels();
    for (var i = 0; i < levels.length; i++) if (levels[i].id === id) return levels[i];
    return null;
  }
  function comboChunks(band) {
    var words = (band && band.words) || [];
    var out = [];
    var i = 0;
    var n = 1;
    while (i < words.length) {
      var slice = words.slice(i, i + COMBO_CHUNK);
      out.push({ index: n - 1, label: "Level " + n, count: slice.length, words: slice });
      i += COMBO_CHUNK;
      n += 1;
    }
    return out;
  }
  function comboChunkBy(bandId, chunkIndex) {
    var band = comboLevelById(bandId);
    if (!band) return null;
    var chunks = comboChunks(band);
    if (chunkIndex < 0 || chunkIndex >= chunks.length) return null;
    return { band: band, chunk: chunks[chunkIndex], chunkCount: chunks.length };
  }
  function startComboFlash(bandId, chunkIndex) {
    var pack = comboChunkBy(bandId, chunkIndex);
    if (!pack || !pack.chunk.words.length) return;
    markLevelPracticed(bandId, chunkIndex);
    ui._comboPool = pack.chunk.words.map(function (w) {
      return { id: w.id, kanji: w.kanji, reading: w.reading, english: w.english, example: "" };
    });
    ui._comboLabel = pack.band.label + " · " + pack.chunk.label;
    ui.chFlash = {
      comboRef: bandId + ":" + chunkIndex,
      fromCombo: true,
      chapterId: "combo-virt",
      ids: ui._comboPool.map(function (w) { return w.id; }),
      index: 0,
      revealed: false
    };
    ui.chQuiz = null;
    render();
  }
  function startComboQuiz(bandId, chunkIndex, mode) {
    var pack = comboChunkBy(bandId, chunkIndex);
    if (!pack || !pack.chunk.words.length) return;
    markLevelPracticed(bandId, chunkIndex);
    ui._comboPool = pack.chunk.words.map(function (w) {
      return { id: w.id, kanji: w.kanji, reading: w.reading, english: w.english, example: "" };
    });
    ui._comboLabel = pack.band.label + " · " + pack.chunk.label;
    mode = mode === "type" ? "type" : mode === "dark" ? "dark" : "choice";
    ui.chQuiz = {
      comboRef: bandId + ":" + chunkIndex,
      fromCombo: true,
      chapterId: "combo-virt",
      ids: shuffleIds(ui._comboPool.map(function (w) { return w.id; })),
      index: 0,
      correct: 0,
      mode: mode,
      promptSide: mode === "dark" ? darkPromptSide() : (Math.random() < 0.5 ? "english" : "reading"),
      choices: null,
      feedback: null
    };
    ui.chFlash = null;
    render();
  }

  function renderCombos() {
    if (ui.chFlash && ui.chFlash.fromCombo) {
      renderChapterFlash();
      return;
    }
    if (ui.chQuiz && ui.chQuiz.fromCombo) {
      renderChapterQuiz();
      return;
    }
    var levels = comboLevels();
    var html = "<h1>Combinations</h1>";
    html += "<p>Kanji words and compounds from the open JLPT word list. Not from a textbook.</p>";
    if (!levels.length) {
      html += '<div class="empty"><p>Combination data did not load.</p></div>';
      main.innerHTML = html;
      return;
    }
    if (!ui.comboLevel) {
      html += '<p class="mode-label">Bands</p>';
      html += '<div class="actions">';
      levels.forEach(function (lv) {
        var chunks = comboChunks(lv);
        html += '<button type="button" class="secondary" data-act="combo-level" data-id="' + esc(lv.id) + '">';
        html += '<span class="action-title">' + esc(lv.label) + completionBadge(completionsFor("combo", lv.id + ":", true)) + "</span>";
        html += '<span class="action-desc">' + lv.count + " words · " + chunks.length + " level" + (chunks.length === 1 ? "" : "s") + "</span></button>";
      });
      html += "</div>";
      html += completionHistoryHtml("combo");
      html += '<p class="muted">Common vs less common is the top vs bottom half of each JLPT level by OpenSubtitles word frequency (FrequencyWords 2016 ja_50k). Words not in that list sort as less common. Each band is then split into levels of about 30 words, still in that frequency order.</p>';
      main.innerHTML = html;
      return;
    }
    var lv = comboLevelById(ui.comboLevel);
    if (!lv) { ui.comboLevel = null; ui.comboChunk = null; renderCombos(); return; }
    var chunks = comboChunks(lv);
    if (ui.comboChunk == null) {
      html += '<p><button type="button" class="secondary" data-act="combo-back">All bands</button></p>';
      html += "<h1>" + esc(lv.label) + "</h1>";
      html += "<p>" + lv.count + " words · " + chunks.length + " level" + (chunks.length === 1 ? "" : "s") + " of about " + COMBO_CHUNK + "</p>";
      if (!chunks.length) {
        html += '<div class="empty"><p>No words in this band.</p></div>';
        main.innerHTML = html;
        return;
      }
      html += '<p class="mode-label">Levels</p>';
      html += '<div class="actions">';
      chunks.forEach(function (ch) {
        html += '<button type="button" class="secondary" data-act="combo-chunk" data-index="' + ch.index + '">';
        html += '<span class="action-title">' + esc(ch.label) + completionBadge(completionsFor("combo", lv.id + ":" + ch.index)) + "</span>";
        html += '<span class="action-desc">' + ch.count + " words</span></button>";
      });
      html += "</div>";
      main.innerHTML = html;
      return;
    }
    var pack = comboChunkBy(ui.comboLevel, ui.comboChunk);
    if (!pack) { ui.comboChunk = null; renderCombos(); return; }
    html += '<p><button type="button" class="secondary" data-act="combo-back">Back to ' + esc(lv.label) + "</button></p>";
    html += "<h1>" + esc(lv.label) + " · " + esc(pack.chunk.label) + "</h1>" + completionLine(completionsFor("combo", ui.comboLevel + ":" + ui.comboChunk));
    html += "<p>" + pack.chunk.count + " words · level " + (pack.chunk.index + 1) + " of " + pack.chunkCount + "</p>";
    html += '<p class="mode-label">Practice</p>';
    html += '<div class="actions">';
    html += '<button type="button" class="primary" data-act="combo-flash"><span class="action-title">Flashcards</span><span class="action-desc">Kanji on the front. Flip for reading and meaning.</span></button>';
    html += '<button type="button" class="secondary" data-act="combo-quiz" data-mode="choice"><span class="action-title">Quiz · choose</span><span class="action-desc">See reading or meaning. Pick the kanji.</span></button>';
    html += '<button type="button" class="secondary" data-act="combo-quiz" data-mode="type"><span class="action-title">Quiz · type</span><span class="action-desc">See the word. Type its reading in kana.</span></button>';
    html += '<button type="button" class="secondary" data-act="combo-quiz" data-mode="dark"><span class="action-title">Darker day</span><span class="action-desc">Reading and meaning only. No kanji on the prompt.</span></button>';
    html += "</div>";
    main.innerHTML = html;
  }

  function renderChapters() {
    var chapters = progress.chapters || [];
    if (ui.chFlash) {
      renderChapterFlash();
      return;
    }
    if (ui.chQuiz) {
      renderChapterQuiz();
      return;
    }
    if (ui.chapterId) {
      var ch = chapterBy(ui.chapterId);
      if (!ch) { ui.chapterId = null; renderChapters(); return; }
      var html = '<p><button type="button" class="secondary" data-act="ch-back">All chapters</button></p>';
      html += "<h1>" + esc(ch.name) + "</h1>" + completionLine(completionsFor("ch", ch.id));
      html += "<p>" + (ch.words || []).length + " words</p>";
      html += '<div class="edit-block">';
      html += '<p class="mode-label">Rename chapter</p>';
      html += "<p>Change the name without re-pasting words. Example: Ch1 or Unit 1.</p>";
      html += '<form data-act="ch-rename">';
      html += '<label for="ch-rename">New name</label>';
      html += '<input id="ch-rename" name="name" type="text" autocomplete="off" value="' + esc(ch.name) + '" required>';
      html += '<p><button type="submit" class="primary">Save name</button></p>';
      html += "</form>";
      if (ui.editMsg) html += '<p class="muted">' + esc(ui.editMsg) + "</p>";
      html += "</div>";
      if (!(ch.words && ch.words.length)) {
        html += '<div class="empty"><p>This chapter has no words yet.</p><p>Paste a list below, one word per line.</p></div>';
      } else {
        html += '<p class="mode-label">Practice</p>';
        html += '<div class="actions">';
        html += '<button type="button" class="primary" data-act="ch-flash" data-id="' + esc(ch.id) + '"><span class="action-title">Flashcards</span><span class="action-desc">Kanji on the front. Flip for reading and meaning.</span></button>';
        html += '<button type="button" class="secondary" data-act="ch-quiz" data-id="' + esc(ch.id) + '" data-mode="choice"><span class="action-title">Quiz · choose</span><span class="action-desc">See reading or meaning. Pick the kanji.</span></button>';
        html += '<button type="button" class="secondary" data-act="ch-quiz" data-id="' + esc(ch.id) + '" data-mode="type"><span class="action-title">Quiz · type</span><span class="action-desc">See the word. Type its reading in kana.</span></button>';
        html += '<button type="button" class="secondary" data-act="ch-quiz" data-id="' + esc(ch.id) + '" data-mode="dark"><span class="action-title">Darker day</span><span class="action-desc">Reading and meaning only. No kanji on the prompt.</span></button>';
        html += "</div>";
      }
      html += "<h2>Paste words</h2>";
      html += '<p class="note">One word per line. Use tab, comma, or | between fields:<br>kanji[TAB]reading[TAB]english<br>kanji,reading,english<br>kanji | reading | english<br>Optional 4th field: example sentence. Nothing is invented; only what you paste is saved.</p>';
      html += '<label for="paste-box">Paste</label>';
      html += '<textarea id="paste-box" lang="ja" placeholder="漢字 | かんじ | kanji"></textarea>';
      html += '<div class="paste-actions">';
      html += '<button type="button" class="primary" data-act="ch-paste" data-id="' + esc(ch.id) + '" data-mode="append">Append paste</button>';
      html += '<button type="button" class="secondary" data-act="ch-paste" data-id="' + esc(ch.id) + '" data-mode="replace">Replace all with paste</button>';
      html += "</div>";
      if (ui.pasteMsg) html += '<p class="muted">' + esc(ui.pasteMsg) + "</p>";
      if (ch.words && ch.words.length) {
        html += "<h2>Words in this chapter</h2>";
        ch.words.forEach(function (w) {
          html += '<div class="word-row"><div class="meta"><div class="w" lang="ja">' + esc(w.kanji) + "</div>";
          html += '<div class="m" lang="ja">' + esc(w.reading) + " · " + esc(w.english) + "</div></div>";
          html += '<button type="button" class="danger" data-act="ch-del-word" data-id="' + esc(ch.id) + '" data-word="' + esc(w.id) + '">Delete</button></div>';
        });
      }
      html += '<div class="edit-block">';
      html += '<p class="mode-label">Delete chapter</p>';
      html += "<p>Removes this chapter and its pasted words. Mistake history stays.</p>";
      html += '<button type="button" class="could" data-act="ch-delete" data-id="' + esc(ch.id) + '">Delete chapter</button>';
      html += "</div>";
      main.innerHTML = html;
      return;
    }
    var list = "<h1>Chapters</h1>";
    list += "<p>Paste Speed Master chapters yourself. This app does not ship textbook words.</p>";
    if (!chapters.length) {
      list += '<div class="empty"><p>No chapters yet.</p><p>Add a name below, then paste the words for that chapter.</p></div>';
    } else {
      list += '<div class="chapter-list">';
      chapters.forEach(function (c) {
        list += '<button type="button" class="item" data-act="ch-open" data-id="' + esc(c.id) + '">';
        list += '<div class="w">' + esc(c.name) + completionBadge(completionsFor("ch", c.id)) + "</div>";
        list += '<div class="m">' + (c.words || []).length + " words</div></button>";
      });
      list += "</div>";
    }
    list += completionHistoryHtml("ch");
    list += "<h2>New chapter</h2>";
    list += '<form data-act="ch-create">';
    list += '<label for="ch-name">Name</label>';
    list += '<input id="ch-name" name="name" type="text" autocomplete="off" placeholder="Unit 1" required>';
    list += '<p><button type="submit" class="primary">Add chapter</button></p>';
    list += "</form>";
    main.innerHTML = list;
  }

  function renderChapterFlash() {
    var st = ui.chFlash;
    var ch = chapterBy(st.chapterId);
    if (!ch || !(ch.words && ch.words.length)) {
      ui.chFlash = null;
      if (st && st.fromCombo) renderCombos();
      else if (st && st.fromWrong) renderWrong();
      else renderChapters();
      return;
    }
    if (st.index >= st.ids.length) {
      var done = "<h1>" + esc(ch.name) + "</h1>";
      done += '<p class="mode-label">Flashcards</p><p>Finished.</p>';
      done += '<button type="button" class="secondary" data-act="ch-stop">' + (st.fromCombo ? "Back to practice" : st.fromWrong ? "Back" : "Back to chapter") + "</button>";
      main.innerHTML = done;
      return;
    }
    var w = chapterWordBy(st.chapterId, st.ids[st.index]);
    var html = '<p class="muted">' + esc(ch.name) + " · flashcards · " + (st.index + 1) + " of " + st.ids.length + "</p>";
    if (!st.revealed) {
      html += '<button type="button" class="card" data-act="ch-flip"><div class="jp kanji" lang="ja">' + esc(w.kanji) + "</div></button>";
    } else {
      html += '<div class="card">';
      if (furigana && w.reading) {
        html += '<div class="jp kanji" lang="ja"><ruby>' + esc(w.kanji) + "<rt>" + esc(w.reading) + "</rt></ruby></div>";
      }
      html += '<p class="meaning" lang="ja">' + esc(w.reading) + "</p>";
      html += '<p class="meaning">' + esc(w.english) + "</p>";
      if (w.example) html += '<p lang="ja">' + esc(w.example) + "</p>";
      html += sayButtonsHtml(speechReadingOfWord(w), w.example);
      html += "</div>";
    }
    html += '<button type="button" class="primary" data-act="ch-next">Next</button>';
    html += '<div class="row">';
    html += '<button type="button" data-act="ch-shuffle">Shuffle</button>';
    html += '<button type="button" data-act="ch-stop">Back</button>';
    html += "</div>";
    main.innerHTML = html;
  }

  function quizChoices(words, correct) {
    var pool = words.filter(function (w) { return w.id !== correct.id; });
    pool = shuffleIds(pool.map(function (w) { return w.id; })).slice(0, 3).map(function (id) {
      for (var i = 0; i < words.length; i++) if (words[i].id === id) return words[i];
      return null;
    }).filter(Boolean);
    var opts = pool.concat([correct]);
    return shuffleIds(opts.map(function (w) { return w.id; })).map(function (id) {
      for (var i = 0; i < words.length; i++) if (words[i].id === id) return words[i];
      return null;
    }).filter(Boolean);
  }
  function darkPromptSide() {
    return Math.random() < 0.5 ? "reading" : "english";
  }
  function choiceLabel(word, mode, promptSide) {
    if (mode === "dark") {
      return promptSide === "reading" ? word.english : word.reading;
    }
    return word.kanji;
  }

  function renderChapterQuiz() {
    var st = ui.chQuiz;
    var ch = chapterBy(st.chapterId);
    if (!ch || !(ch.words && ch.words.length)) {
      ui.chQuiz = null;
      if (st && st.fromCombo) renderCombos();
      else if (st && st.fromWrong) renderWrong();
      else renderChapters();
      return;
    }
    var modeName = st.mode === "dark" ? "Darker day" : st.mode === "type" ? "Quiz · type" : "Quiz · choose";
    if (st.index >= st.ids.length) {
      var done = "<h1>" + esc(ch.name) + "</h1>";
      done += '<p class="mode-label">' + esc(modeName) + "</p>";
      done += '<p class="score">Score: ' + st.correct + " / " + st.ids.length + "</p>";
      done += "<p>Wrong answers were added as Could not read for tomorrow's session.</p>";
      done += '<button type="button" class="secondary" data-act="ch-stop">' + (st.fromCombo ? "Back to practice" : st.fromWrong ? "Back" : "Back to chapter") + "</button>";
      main.innerHTML = done;
      return;
    }
    var w = chapterWordBy(st.chapterId, st.ids[st.index]);
    var promptSide = st.promptSide || (st.mode === "dark" ? "reading" : "english");
    var html = '<p class="muted">' + esc(ch.name) + " · " + (st.index + 1) + " of " + st.ids.length + " · score " + st.correct + "</p>";
    html += '<p class="mode-label">' + esc(modeName) + "</p>";
    if (st.mode === "dark") {
      html += '<p class="quiz-prompt" lang="' + (promptSide === "reading" ? "ja" : "en") + '">' + esc(promptSide === "reading" ? w.reading : w.english) + "</p>";
      html += "<p>" + (promptSide === "reading" ? "Choose the meaning." : "Choose the reading.") + "</p>";
    } else {
      if (st.mode === "type") {
        var hasK = dHasKanji(w.kanji) || !w.english;
        html += '<p class="quiz-prompt" lang="' + (hasK ? "ja" : "en") + '">' + esc(hasK ? w.kanji : (w.english || w.kanji)) + "</p>";
        html += "<p>" + (hasK ? "Type the reading in kana." : "Type the word in kana.") + "</p>";
      } else {
        html += '<p class="quiz-prompt" lang="' + (promptSide === "reading" ? "ja" : "en") + '">' + esc(promptSide === "reading" ? w.reading : w.english) + "</p>";
        html += "<p>Choose the kanji.</p>";
      }
    }
    if (st.feedback) {
      html += '<p class="' + (st.feedback.ok ? "muted" : "warn") + '">' + (st.feedback.ok ? "Correct." : "Not this one.") + "</p>";
      if (st.feedback.typed != null) html += '<p class="muted">You typed: <span lang="ja">' + esc(st.feedback.typed) + "</span></p>";
      html += '<div class="card">';
      html += '<p class="meaning" lang="ja">' + esc(w.kanji) + "</p>";
      html += '<p class="meaning" lang="ja">' + esc(w.reading) + "</p>";
      html += '<p class="meaning">' + esc(w.english || "") + "</p>";
      if (w.example) html += '<p lang="ja">' + esc(w.example) + "</p>";
      html += sayButtonsHtml(speechReadingOfWord(w), w.example);
      html += "</div>";
      html += '<button type="button" class="primary" data-act="ch-quiz-next">Next</button>';
    } else if (st.mode === "type") {
      html += '<form data-act="ch-type">';
      html += '<label for="quiz-type">Type the reading (kana)</label>';
      html += '<input id="quiz-type" name="answer"' + TYPE_IN_ATTRS + ' placeholder="ひらがな" autofocus>';
      html += '<p><button type="submit" class="primary">Check</button></p>';
      html += "</form>";
    } else {
      var choices = st.choices || quizChoices(ch.words, w);
      st.choices = choices;
      choices.forEach(function (opt) {
        var label = choiceLabel(opt, st.mode, promptSide);
        var lang = (st.mode === "dark" && promptSide === "english") || st.mode !== "dark" ? "ja" : "en";
        if (st.mode === "dark" && promptSide === "reading") lang = "en";
        html += '<button type="button" class="choice" lang="' + lang + '" data-act="ch-choice" data-id="' + esc(opt.id) + '">' + esc(label) + "</button>";
      });
    }
    html += '<p><button type="button" class="secondary" data-act="ch-stop">Stop</button></p>';
    main.innerHTML = html;
    var input = document.getElementById("quiz-type");
    if (input) try { input.focus(); } catch (e) {}
  }


  function renderWrong() {
    if (ui.chFlash && ui.chFlash.fromWrong) {
      if (ui.chFlash.index >= ui.chFlash.ids.length) ui.chFlash = null;
      else { renderWrongFlash(); return; }
    }
    if (ui.chQuiz && ui.chQuiz.fromWrong) {
      if (ui.chQuiz.index >= ui.chQuiz.ids.length) ui.chQuiz = null;
      else { renderChapterQuiz(); return; }
    }
    var rows = wrongWordSummaries();
    var openN = rows.filter(function (r) { return r.open; }).length;
    var html = "<h1>Wrong words</h1>";
    html += "<p>Words marked Could not read, or missed in Quiz / Darker day. After a miss, a word stays <strong>open</strong> until you get it right <strong>3 times</strong> (flashcards, quizzes, or today's session). A new miss resets that count. History stays in the log. Grammar quiz misses stay in Gram practice only — this hub is for vocabulary.</p>";
    if (!rows.length) {
      html += '<div class="empty"><p>Nothing missed yet. When you miss a word, it stays open until 3 correct reviews.</p></div>';
      main.innerHTML = html;
      return;
    }
    html += "<p>" + openN + " open · " + rows.length + " in the log</p>";
    if (openN) {
      html += '<div class="actions">';
      html += '<button type="button" class="primary" data-act="wrong-flash" data-scope="open"><span class="action-title">Flashcards · open</span><span class="action-desc">Re-drill words still open.</span></button>';
      html += '<button type="button" class="secondary" data-act="wrong-quiz" data-scope="open" data-mode="choice"><span class="action-title">Quiz · open</span><span class="action-desc">Choose the kanji for open misses.</span></button>';
      html += '<button type="button" class="secondary" data-act="wrong-quiz" data-scope="open" data-mode="dark"><span class="action-title">Darker day · open</span><span class="action-desc">Reading and meaning only.</span></button>';
      html += "</div>";
    }
    html += '<div class="actions">';
    html += '<button type="button" class="secondary" data-act="wrong-flash" data-scope="all"><span class="action-title">Flashcards · all</span><span class="action-desc">Whole log, including resolved.</span></button>';
    html += "</div>";
    rows.forEach(function (r) {
      html += '<div class="item">';
      html += '<div class="w" lang="ja">' + esc(r.kanji) + '</div>';
      html += '<div class="m" lang="ja">' + esc(r.reading) + (r.english ? " · " + esc(r.english) : "") + "</div>";
      html += '<div class="m"><span class="badge ' + (r.open ? "open" : "resolved") + '">' + (r.open ? ("Open · " + (r.correctSince || 0) + "/3 correct") : "Resolved") + "</span> · " + r.missCount + " miss" + (r.missCount === 1 ? "" : "es");
      if (r.lastAt) html += " · last " + esc(fmtWhen(r.lastAt));
      html += "</div></div>";
    });
    main.innerHTML = html;
  }

  function renderWrongFlash() {
    var st = ui.chFlash;
    if (!st || !st.ids.length) {
      ui.chFlash = null;
      renderWrong();
      return;
    }
    if (st.index >= st.ids.length) {
      main.innerHTML = "<h1>Wrong words</h1><p class=\"mode-label\">Flashcards</p><p>Finished.</p><button type=\"button\" class=\"secondary\" data-act=\"wrong-stop\">Back</button>";
      return;
    }
    var w = wordBy(st.ids[st.index]);
    if (!w) {
      st.index += 1;
      renderWrongFlash();
      return;
    }
    var html = '<p class="muted">Wrong words · ' + (st.index + 1) + " of " + st.ids.length + "</p>";
    if (!st.revealed) {
      html += '<button type="button" class="card" data-act="ch-flip"><div class="jp kanji" lang="ja">' + esc(w.kanji) + "</div></button>";
    } else {
      html += '<div class="card">';
      if (furigana && w.reading) html += '<div class="jp kanji" lang="ja"><ruby>' + esc(w.kanji) + "<rt>" + esc(w.reading) + "</rt></ruby></div>";
      html += '<p class="meaning" lang="ja">' + esc(w.reading) + "</p>";
      html += '<p class="meaning">' + esc(w.english) + "</p>";
      if (w.example) html += '<p lang="ja">' + esc(w.example) + "</p>";
      html += sayButtonsHtml(speechReadingOfWord(w), w.example);
      html += "</div>";
      html += '<button type="button" class="primary" data-act="wrong-mark" data-ok="1">Read correctly</button>';
      html += '<button type="button" class="could" data-act="wrong-mark" data-ok="0">Could not read.</button>';
    }
    html += '<p><button type="button" class="secondary" data-act="wrong-stop">Stop</button></p>';
    main.innerHTML = html;
  }

  function renderAdd() {
    var html = "<h1>Add a word</h1>";
    html += "<p>A word you could not read. It can be in today's session, up to 20 new words.</p>";
    html += '<form data-act="save-word">';
    html += '<label for="kanji">Kanji</label><input id="kanji" name="kanji" type="text" autocomplete="off" lang="ja" required>';
    html += '<label for="reading">Reading</label><input id="reading" name="reading" type="text" autocomplete="off" lang="ja" required>';
    html += '<label for="english">English</label><input id="english" name="english" type="text" autocomplete="off" required>';
    html += '<label for="example">Example, if you have one</label><textarea id="example" name="example" lang="ja"></textarea>';
    html += '<p><button type="submit" class="primary">Save word</button></p>';
    html += "</form>";
    html += '<h2 id="bulk-title">Paste many words</h2>';
    html += '<p class="note">Paste a whole list at once. Leave a blank line between words. Each word is 3 or 4 lines:<br>word<br>reading<br>meaning<br>example (optional)<br>One line also works: word | reading | meaning | example. Words you already have (same word and reading) are skipped.</p>';
    html += '<label for="bulk-box">Your list</label>';
    html += '<textarea id="bulk-box" class="bulk-box" lang="ja" autocomplete="off" placeholder="燃料\nねんりょう\nfuel\n昔の列車は、石炭が主な燃料だった。\n\n沈む\nしずむ\nto sink">' + esc(ui.bulkDraft || "") + "</textarea>";
    html += '<p id="bulk-preview" class="bulk-preview" aria-live="polite">' + esc(bulkPreviewText(ui.bulkDraft || "")) + "</p>";
    html += '<div class="paste-actions"><button type="button" class="primary" data-act="bulk-add">Add all words</button></div>';
    if (ui.bulkMsg) html += '<p class="bulk-msg" role="status">' + esc(ui.bulkMsg) + "</p>";
    html += "<h2>Move words</h2>";
    html += "<p>Export saves words, vocab chapters, grammar chapters, mistakes, and stats as jlpt-n2-progress.json. Data is also kept in localStorage and IndexedDB on this device. Import replaces them here.</p>";
    html += '<button type="button" class="secondary" data-act="export">Export backup</button>';
    html += '<p><input id="import-file" type="file" accept="application/json"></p>';
    main.innerHTML = html;
  }

  function existingWordKeys() {
    var seen = {};
    (progress.words || []).forEach(function (w) { if (w) seen[wordKey(w.kanji, w.reading)] = 1; });
    return seen;
  }
  function bulkCount(text) {
    var parsed = parseBulkWords(text);
    var seen = existingWordKeys();
    var fresh = 0, dup = 0;
    parsed.rows.forEach(function (r) {
      var k = wordKey(r.kanji, r.reading);
      if (seen[k]) dup += 1;
      else { seen[k] = 1; fresh += 1; }
    });
    return { parsed: parsed, found: parsed.rows.length, fresh: fresh, dup: dup };
  }
  function bulkPreviewText(text) {
    if (!String(text || "").trim()) return "Nothing pasted yet.";
    var c = bulkCount(text);
    var msg = c.found + " word" + (c.found === 1 ? "" : "s") + " found";
    if (c.dup) msg += " · " + c.dup + " already saved, will be skipped";
    if (c.found) msg += " · " + c.fresh + " will be added";
    msg += ".";
    if (c.parsed.bad.length) msg += " Could not read " + c.parsed.bad.length + " part" + (c.parsed.bad.length === 1 ? "" : "s") + " (starting “" + c.parsed.bad[0] + "”). Check for a missing blank line.";
    return msg;
  }

  function partsHtml(parts) {
    return (parts || []).map(function (p) {
      var t = esc(p.t);
      if (furigana && p.r) return "<ruby>" + t + "<rt>" + esc(p.r) + "</rt></ruby>";
      return t;
    }).join("");
  }

  function gChapterBy(id) {
    var list = progress.grammarChapters || [];
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }
  function gPointBy(chapterId, pointId) {
    var ch = gChapterBy(chapterId);
    if (!ch) return null;
    var pts = ch.points || [];
    for (var i = 0; i < pts.length; i++) if (pts[i].id === pointId) return pts[i];
    return null;
  }
  function grammarChoices(chapter, correctId, n) {
    var pts = (chapter.points || []).slice();
    var correct = null;
    var others = [];
    pts.forEach(function (p) {
      if (p.id === correctId) correct = p;
      else others.push(p);
    });
    if (!correct) return [];
    others = shuffleIds(others.map(function (p) { return p.id; })).slice(0, Math.max(0, (n || 4) - 1));
    var ids = shuffleIds([correct.id].concat(others));
    return ids.map(function (id) { return gPointBy(chapter.id, id); }).filter(Boolean);
  }
  function normGrammarAnswer(s) {
    return String(s || "").replace(/[\s\u3000〜～~]+/g, "").toLowerCase();
  }
  /* Pattern with furigana (ruby) when the Furigana toggle is on and a reading exists. */
  function gPatternHtml(p) {
    if (furigana && p.reading) return "<ruby>" + esc(p.pattern) + "<rt>" + esc(p.reading) + "</rt></ruby>";
    return esc(p.pattern);
  }
  function gReadingLine(p) {
    return p.reading ? '<p class="g-reading" lang="ja">' + esc(p.reading) + "</p>" : "";
  }

  function renderGrammar() {
    if (ui.gFlash) { renderGrammarFlash(); return; }
    if (ui.gQuiz) { renderGrammarQuiz(); return; }
    var chapters = progress.grammarChapters || [];
    if (ui.gChapterId) {
      var ch = gChapterBy(ui.gChapterId);
      if (!ch) { ui.gChapterId = null; renderGrammar(); return; }
      var html = '<p><button type="button" class="secondary" data-act="g-back">All grammar</button></p>';
      html += "<h1>" + esc(ch.name) + "</h1>" + completionLine(completionsFor("g", ch.id));
      html += "<p>" + (ch.points || []).length + " points</p>";
      html += '<div class="edit-block">';
      html += '<p class="mode-label">Rename chapter</p>';
      html += "<p>Name it yourself (e.g. Try unit 3). Nothing is copied from a textbook.</p>";
      html += '<form data-act="g-rename">';
      html += '<label for="g-rename">New name</label>';
      html += '<input id="g-rename" name="name" type="text" autocomplete="off" value="' + esc(ch.name) + '" required>';
      html += '<p><button type="submit" class="primary">Save name</button></p>';
      html += "</form>";
      if (ui.gEditMsg) html += '<p class="muted">' + esc(ui.gEditMsg) + "</p>";
      html += "</div>";
      if (!(ch.points && ch.points.length)) {
        html += '<div class="empty"><p>No grammar points yet.</p><p>Paste a list below.</p></div>';
      } else {
        html += '<p class="mode-label">Practice</p>';
        html += '<div class="actions">';
        html += '<button type="button" class="primary" data-act="g-flash" data-id="' + esc(ch.id) + '"><span class="action-title">Flashcards</span><span class="action-desc">Pattern on the front. Flip for meaning, usage, and example.</span></button>';
        html += '<button type="button" class="secondary" data-act="g-quiz" data-id="' + esc(ch.id) + '" data-mode="choice"><span class="action-title">Quiz · choose</span><span class="action-desc">See the meaning. Pick the pattern.</span></button>';
        html += '<button type="button" class="secondary" data-act="g-quiz" data-id="' + esc(ch.id) + '" data-mode="type"><span class="action-title">Quiz · type</span><span class="action-desc">See the meaning. Type the pattern’s reading in kana.</span></button>';
        html += "</div>";
      }
      html += "<h2>Paste grammar</h2>";
      html += '<p class="note">One point per line, fields separated by | (or tab):<br><b>pattern | reading | meaning | usage | example</b><br>Reading, usage and example are optional. Old lines <b>pattern | meaning | usage</b> still work.<br>Or one field per line (pattern, reading, meaning, usage, example) with a blank line between points.<br>Example:<br><span lang="ja">〜に際して | にさいして | on the occasion of | formal; after a noun or verb | 卒業に際して、先生にお礼の手紙を書いた。</span><br>Only what you paste is saved — this app does not ship textbook grammar.</p>';
      html += '<label for="g-paste-box">Paste</label>';
      html += '<textarea id="g-paste-box" lang="ja" placeholder="〜に応じて | におうじて | depending on | after a noun | 予算に応じて選ぶ。"></textarea>';
      html += '<div class="paste-actions">';
      html += '<button type="button" class="primary" data-act="g-paste" data-id="' + esc(ch.id) + '" data-mode="append">Append paste</button>';
      html += '<button type="button" class="secondary" data-act="g-paste" data-id="' + esc(ch.id) + '" data-mode="replace">Replace all with paste</button>';
      html += "</div>";
      if (ui.gPasteMsg) html += '<p class="muted">' + esc(ui.gPasteMsg) + "</p>";
      if (ch.points && ch.points.length) {
        html += "<h2>Points in this chapter</h2>";
        html += '<p class="muted">Tap Edit on a point to add or fix its reading.</p>';
        if (ui.gPointMsg) html += '<p class="bulk-msg" role="status">' + esc(ui.gPointMsg) + "</p>";
        ch.points.forEach(function (p) {
          if (ui.gEditPointId === p.id) {
            html += '<form class="edit-block g-edit" data-act="g-edit-save" data-id="' + esc(ch.id) + '" data-point="' + esc(p.id) + '">';
            html += '<p class="mode-label">Edit point</p>';
            html += '<label for="ge-pattern">Pattern</label><input id="ge-pattern" name="pattern" type="text" lang="ja" autocomplete="off" required value="' + esc(p.pattern) + '">';
            html += '<label for="ge-reading">Reading (kana)</label><input id="ge-reading" name="reading" type="text" lang="ja" autocomplete="off" placeholder="にさいして" value="' + esc(p.reading || "") + '">';
            html += '<label for="ge-meaning">Meaning</label><input id="ge-meaning" name="meaning" type="text" autocomplete="off" required value="' + esc(p.meaning) + '">';
            html += '<label for="ge-usage">Usage</label><input id="ge-usage" name="usage" type="text" autocomplete="off" value="' + esc(p.usage || "") + '">';
            html += '<label for="ge-example">Example</label><textarea id="ge-example" name="example" lang="ja">' + esc(p.example || "") + "</textarea>";
            html += '<div class="paste-actions"><button type="submit" class="primary">Save point</button><button type="button" class="secondary" data-act="g-edit-cancel">Cancel</button></div>';
            html += "</form>";
            return;
          }
          html += '<div class="word-row"><div class="meta"><div class="w" lang="ja">' + esc(p.pattern) + "</div>";
          if (p.reading) html += '<div class="g-reading" lang="ja">' + esc(p.reading) + "</div>";
          html += '<div class="m">' + esc(p.meaning) + (p.usage ? " · " + esc(p.usage) : "") + "</div></div>";
          html += '<div class="row-btns"><button type="button" class="edit" data-act="g-edit-point" data-point="' + esc(p.id) + '">Edit</button>';
          html += '<button type="button" class="danger" data-act="g-del-point" data-id="' + esc(ch.id) + '" data-point="' + esc(p.id) + '">Delete</button></div></div>';
        });
      }
      html += '<div class="edit-block">';
      html += '<p class="mode-label">Delete chapter</p>';
      html += "<p>Removes this grammar chapter and its pasted points.</p>";
      html += '<button type="button" class="could" data-act="g-delete" data-id="' + esc(ch.id) + '">Delete chapter</button>';
      html += "</div>";
      main.innerHTML = html;
      return;
    }
    var list = "<h1>Grammar</h1>";
    list += "<p>Paste your own grammar chapters (name them yourself). This app does not ship textbook explanations.</p>";
    if (!chapters.length) {
      list += '<div class="empty"><p>No grammar chapters yet.</p><p>Add a name below, then paste the points for that chapter.</p></div>';
    } else {
      list += '<div class="chapter-list">';
      chapters.forEach(function (c) {
        list += '<button type="button" class="item" data-act="g-open" data-id="' + esc(c.id) + '">';
        list += '<div class="w">' + esc(c.name) + completionBadge(completionsFor("g", c.id)) + "</div>";
        list += '<div class="m">' + (c.points || []).length + " points</div></button>";
      });
      list += "</div>";
    }
    list += completionHistoryHtml("g");
    list += "<h2>New grammar chapter</h2>";
    list += '<form data-act="g-create">';
    list += '<label for="g-name">Name</label>';
    list += '<input id="g-name" name="name" type="text" autocomplete="off" placeholder="Unit 1" required>';
    list += '<p><button type="submit" class="primary">Add chapter</button></p>';
    list += "</form>";
    main.innerHTML = list;
  }

  function renderGrammarFlash() {
    var st = ui.gFlash;
    var ch = gChapterBy(st.chapterId);
    if (!ch || !(ch.points && ch.points.length)) {
      ui.gFlash = null;
      renderGrammar();
      return;
    }
    if (st.index >= st.ids.length) {
      main.innerHTML = "<h1>" + esc(ch.name) + '</h1><p class="mode-label">Flashcards</p><p>Finished.</p><button type="button" class="secondary" data-act="g-stop">Back to chapter</button>';
      return;
    }
    var p = gPointBy(st.chapterId, st.ids[st.index]);
    if (!p) {
      st.index += 1;
      renderGrammarFlash();
      return;
    }
    var html = '<p class="muted">' + esc(ch.name) + " · flashcards · " + (st.index + 1) + " of " + st.ids.length + "</p>";
    if (!st.revealed) {
      html += '<button type="button" class="card" data-act="g-flip"><div class="jp kanji" lang="ja">' + gPatternHtml(p) + "</div></button>";
    } else {
      html += '<div class="card">';
      html += '<div class="jp kanji" lang="ja">' + gPatternHtml(p) + "</div>";
      html += gReadingLine(p);
      html += '<p class="meaning">' + esc(p.meaning) + "</p>";
      html += '<p class="muted">' + esc(p.usage) + "</p>";
      if (p.example) html += '<p lang="ja">' + esc(p.example) + "</p>";
      html += sayButtonsHtml(speechReadingOfPattern(p), p.example);
      html += "</div>";
    }
    html += '<button type="button" class="primary" data-act="g-next">Next</button>';
    html += '<div class="row">';
    html += '<button type="button" data-act="g-shuffle">Shuffle</button>';
    html += '<button type="button" data-act="g-stop">Back</button>';
    html += "</div>";
    main.innerHTML = html;
  }

  function renderGrammarQuiz() {
    var st = ui.gQuiz;
    var ch = gChapterBy(st.chapterId);
    if (!ch || !(ch.points && ch.points.length)) {
      ui.gQuiz = null;
      renderGrammar();
      return;
    }
    if (st.index >= st.ids.length) {
      var done = "<h1>" + esc(ch.name) + "</h1>";
      done += '<p class="mode-label">Quiz</p><p class="score">' + st.correct + " / " + st.ids.length + " correct</p>";
      done += '<button type="button" class="secondary" data-act="g-stop">Back to chapter</button>';
      main.innerHTML = done;
      return;
    }
    var p = gPointBy(st.chapterId, st.ids[st.index]);
    if (!p) {
      st.index += 1;
      renderGrammarQuiz();
      return;
    }
    var html = '<p class="muted">' + esc(ch.name) + " · quiz · " + (st.index + 1) + " of " + st.ids.length + "</p>";
    html += '<p class="quiz-prompt">' + esc(p.meaning) + "</p>";
    if (p.usage) html += '<p class="muted">' + esc(p.usage) + "</p>";
    if (st.feedback) {
      html += '<p class="' + (st.feedback.ok ? "muted" : "warn") + '">' + (st.feedback.ok ? "Correct." : "Not this one.") + "</p>";
      if (st.feedback.typed != null) html += '<p class="muted">You typed: <span lang="ja">' + esc(st.feedback.typed) + "</span></p>";
      html += '<div class="card"><div class="jp kanji" lang="ja">' + gPatternHtml(p) + "</div>";
      html += gReadingLine(p);
      html += '<p class="meaning">' + esc(p.meaning) + "</p>";
      if (p.usage) html += '<p class="muted">' + esc(p.usage) + "</p>";
      if (p.example) html += '<p lang="ja">' + esc(p.example) + "</p>";
      html += sayButtonsHtml(speechReadingOfPattern(p), p.example);
      html += "</div>";
      html += '<button type="button" class="primary" data-act="g-quiz-next">Next</button>';
    } else if (st.mode === "type") {
      html += '<form data-act="g-type">';
      html += '<label for="g-type-in">Type the reading (kana)</label>';
      html += '<input id="g-type-in" name="answer"' + TYPE_IN_ATTRS + ' placeholder="ひらがな" required>';
      html += '<p><button type="submit" class="primary">Check</button></p>';
      html += "</form>";
    } else {
      if (!st.choices) st.choices = grammarChoices(ch, p.id, 4);
      st.choices.forEach(function (opt) {
        html += '<button type="button" class="choice" lang="ja" data-act="g-choice" data-id="' + esc(opt.id) + '">' + gPatternHtml(opt) + "</button>";
      });
    }
    html += '<p><button type="button" class="secondary" data-act="g-stop">Stop</button></p>';
    main.innerHTML = html;
  }

  function renderReading() {
    var READING = window.READING || [];
    if (ui.readingId) {
      var p = null;
      READING.forEach(function (item) { if (item.id === ui.readingId) p = item; });
      if (!p) { ui.readingId = null; renderReading(); return; }
      var html = '<p><button type="button" class="secondary" data-act="close-read">All passages</button></p>';
      html += "<h1 lang=\"ja\">" + esc(p.title) + "</h1>";
      html += '<p class="note">Original practice. Not an official JLPT item.</p>';
      html += '<p class="jp" lang="ja" style="font-size:1.2rem;font-weight:500">' + partsHtml(p.parts) + "</p>";
      p.questions.forEach(function (q, qi) {
        html += "<h2>" + (qi + 1) + ". " + esc(q.q) + "</h2>";
        q.choices.forEach(function (ch, ci) {
          var picked = ui["rq-" + p.id + "-" + qi];
          var cls = "choice";
          if (picked != null) {
            if (ci === q.answer) cls += " right";
            else if (ci === picked) cls += " wrong";
          }
          html += '<button type="button" class="' + cls + '" lang="ja" data-act="read-pick" data-pid="' + esc(p.id) + '" data-qi="' + qi + '" data-ci="' + ci + '">' + esc(ch) + "</button>";
        });
      });
      main.innerHTML = html;
      return;
    }
    var html2 = "<h1>Read</h1>";
    html2 += "<p>Original passages already in this app. Not past-paper text.</p>";
    READING.forEach(function (p) {
      html2 += '<button type="button" class="item" data-act="open-read" data-id="' + esc(p.id) + '"><div class="w" lang="ja">' + esc(p.title) + '</div><div class="m">' + esc(p.level) + "</div></button>";
    });
    main.innerHTML = html2;
  }

  function renderListening() {
    var LISTENING = window.LISTENING || [];
    var html = "<h1>Listen</h1>";
    html += "<p>Original practice. Play uses the phone's Japanese voice. Show script is there if speech fails.</p>";
    LISTENING.forEach(function (item) {
      html += '<div class="item">';
      html += "<p>" + esc(item.level) + "</p>";
      html += "<p>" + esc(item.q) + "</p>";
      html += '<button type="button" class="secondary" data-act="speak" data-id="' + esc(item.id) + '">Play</button>';
      item.choices.forEach(function (ch, ci) {
        var picked = ui["lq-" + item.id];
        var cls = "choice";
        if (picked != null) {
          if (ci === item.answer) cls += " right";
          else if (ci === picked) cls += " wrong";
        }
        html += '<button type="button" class="' + cls + '" lang="ja" data-act="listen-pick" data-id="' + esc(item.id) + '" data-ci="' + ci + '">' + esc(ch) + "</button>";
      });
      html += '<button type="button" class="secondary" data-act="script" data-id="' + esc(item.id) + '">' + (ui.scripts[item.id] ? "Hide script" : "Show script") + "</button>";
      if (ui.scripts[item.id]) html += '<p class="script" lang="ja">' + partsHtml(item.parts) + "</p>";
      html += "</div>";
    });
    main.innerHTML = html;
  }

  function activePaper() {
    if (ui.mock && ui.mock.paper === "long" && window.MOCK_LONG) return window.MOCK_LONG;
    return window.MOCK;
  }
  function renderTest() {
    if (!window.MOCK) {
      main.innerHTML = "<h1>Test</h1><p>The mock file did not load.</p>";
      return;
    }
    if (!ui.mock) {
      var html = "<h1>Test</h1>";
      html += "<p>The short and long papers already in this app. Raw correct counts only. Not a scaled score.</p>";
      html += '<button type="button" class="primary" data-act="mock-start" data-paper="short">Short paper</button>';
      html += '<button type="button" class="secondary" data-act="mock-start" data-paper="long">Long paper</button>';
      main.innerHTML = html;
      return;
    }
    var paper = activePaper();
    var mock = ui.mock;
    if (mock.phase === "done") {
      var lk = 0, rd = 0, ls = 0;
      paper.lk.forEach(function (item, i) { if (mock.lkAnswers[i] === item.answer) lk += 1; });
      paper.reading.forEach(function (ref, i) {
        var passage = (window.READING || []).filter(function (p) { return p.id === ref.passage; })[0];
        if (passage && mock.rdAnswers[i] === passage.questions[ref.q].answer) rd += 1;
      });
      paper.listening.forEach(function (id, i) {
        var item = (window.LISTENING || []).filter(function (x) { return x.id === id; })[0];
        if (item && mock.lsAnswers[i] === item.answer) ls += 1;
      });
      var htmlDone = "<h1>Result</h1>";
      htmlDone += "<p>Language knowledge: " + lk + " / " + paper.lk.length + "</p>";
      htmlDone += "<p>Reading: " + rd + " / " + paper.reading.length + "</p>";
      htmlDone += "<p>Listening: " + ls + " / " + paper.listening.length + "</p>";
      htmlDone += "<p>Raw counts. Not a scaled score.</p>";
      htmlDone += '<button type="button" class="secondary" data-act="mock-clear">Close</button>';
      main.innerHTML = htmlDone;
      return;
    }
    var htmlQ = "";
    if (mock.phase === "lk") {
      var item = paper.lk[mock.idx];
      htmlQ += "<p>Language knowledge · " + (mock.idx + 1) + " / " + paper.lk.length + " · " + paper.part1Minutes + " minutes for this part and reading together.</p>";
      htmlQ += '<p class="jp" lang="ja">' + esc(item.prompt) + "</p>";
      item.choices.forEach(function (ch, ci) {
        var on = mock.lkAnswers[mock.idx] === ci;
        htmlQ += '<button type="button" class="choice" aria-pressed="' + (on ? "true" : "false") + '" data-act="mock-pick" data-ci="' + ci + '">' + esc(ch) + "</button>";
      });
    } else if (mock.phase === "reading") {
      var ref = paper.reading[mock.idx];
      var passage = (window.READING || []).filter(function (p) { return p.id === ref.passage; })[0];
      var q = passage.questions[ref.q];
      htmlQ += "<p>Reading · " + (mock.idx + 1) + " / " + paper.reading.length + "</p>";
      htmlQ += "<h1 lang=\"ja\">" + esc(passage.title) + "</h1>";
      htmlQ += '<p lang="ja">' + partsHtml(passage.parts) + "</p>";
      htmlQ += "<p>" + esc(q.q) + "</p>";
      q.choices.forEach(function (ch, ci) {
        var on = mock.rdAnswers[mock.idx] === ci;
        htmlQ += '<button type="button" class="choice" lang="ja" aria-pressed="' + (on ? "true" : "false") + '" data-act="mock-pick" data-ci="' + ci + '">' + esc(ch) + "</button>";
      });
    } else if (mock.phase === "listening") {
      var id = paper.listening[mock.idx];
      var lit = (window.LISTENING || []).filter(function (x) { return x.id === id; })[0];
      htmlQ += "<p>Listening · " + (mock.idx + 1) + " / " + paper.listening.length + " · " + paper.part2Minutes + " minutes.</p>";
      htmlQ += '<button type="button" class="secondary" data-act="speak" data-id="' + esc(id) + '">Play</button>';
      htmlQ += "<p>" + esc(lit.q) + "</p>";
      lit.choices.forEach(function (ch, ci) {
        var on = mock.lsAnswers[mock.idx] === ci;
        htmlQ += '<button type="button" class="choice" lang="ja" aria-pressed="' + (on ? "true" : "false") + '" data-act="mock-pick" data-ci="' + ci + '">' + esc(ch) + "</button>";
      });
      htmlQ += '<button type="button" class="secondary" data-act="script" data-id="' + esc(id) + '">' + (ui.scripts[id] ? "Hide script" : "Show script") + "</button>";
      if (ui.scripts[id]) htmlQ += '<p class="script" lang="ja">' + partsHtml(lit.parts) + "</p>";
    }
    htmlQ += '<div class="row"><button type="button" data-act="mock-prev">Back</button><button type="button" data-act="mock-next">Next</button></div>';
    main.innerHTML = htmlQ;
  }

  function render() {
    syncNav();
    var page = pageName();
    if ((location.hash || "#today") !== "#" + page) {
      location.hash = "#" + page;
      return;
    }
    if (page !== activePage) { flushActiveTime(); activePage = page; }
    if (page === "today") {
      if (session && session.day === todayISO()) renderSession();
      else renderHome();
    } else if (page === "chapters") renderChapters();
    else if (page === "combos") renderCombos();
    else if (page === "drill") renderDrill();
    else if (page === "wrong") renderWrong();
    else if (page === "stats") renderStats();
    else if (page === "add") renderAdd();
    else if (page === "grammar") renderGrammar();
    else if (page === "reading") renderReading();
    else if (page === "listening") renderListening();
    else if (page === "test") renderTest();
  }

  function exportProgress() {
    var blob = new Blob([JSON.stringify({
      app: "jlpt-n2",
      version: 2,
      exported: new Date().toISOString(),
      words: progress.words,
      mistakes: progress.mistakes,
      doneDays: progress.doneDays,
      chapters: progress.chapters || [],
      grammarChapters: progress.grammarChapters || [],
      drillLog: progress.drillLog || [],
      completions: progress.completions || [],
      stats: progress.stats || { days: {} }
    }, null, 2)], { type: "application/json" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "jlpt-n2-progress.json";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1500);
  }

  main.addEventListener("click", function (e) {
    var b = e.target.closest("[data-act]");
    if (!b) return;
    var act = b.getAttribute("data-act");
    var today = todayISO();
    if (act === "start") {
      if (progress.doneDays[today]) { renderEnd(); return; }
      session = { day: today, ids: buildQueue(progress, today), index: 0, revealed: false };
      saveSession();
      if (!session.ids.length) finishDay();
      else renderSession();
      return;
    }
    if (act === "flip") {
      if (!session) return;
      session.revealed = true;
      saveSession();
      renderSession();
      autoSpeak(speechReadingOfWord(wordBy(session.ids[session.index])));
      return;
    }
    if (act === "mark") {
      if (!session) return;
      var w = wordBy(session.ids[session.index]);
      if (!w) return;
      var ok = b.getAttribute("data-ok") === "1";
      gradeWord(w, ok, today);
      if (!ok) logCouldNotRead(w, today);
      else recordCorrectReview(w.id);
      bumpStat("wordsGraded", 1);
      saveProgress();
      session.index += 1;
      session.revealed = false;
      saveSession();
      renderSession();
      return;
    }

    if (act === "ch-open") {
      ui.chapterId = b.getAttribute("data-id");
      ui.pasteMsg = null;
      ui.editMsg = null;
      ui.chFlash = null;
      ui.chQuiz = null;
      render();
      return;
    }
    if (act === "ch-back") {
      ui.chapterId = null;
      ui.pasteMsg = null;
      ui.chFlash = null;
      ui.chQuiz = null;
      render();
      return;
    }
    if (act === "ch-stop") {
      var backWrong = (ui.chQuiz && ui.chQuiz.fromWrong) || (ui.chFlash && ui.chFlash.fromWrong);
      var backCombo = (ui.chQuiz && ui.chQuiz.fromCombo) || (ui.chFlash && ui.chFlash.fromCombo);
      ui.chFlash = null;
      ui.chQuiz = null;
      if (backWrong) {
        if ((location.hash || "") !== "#wrong") location.hash = "#wrong";
        else render();
      } else if (backCombo) {
        if ((location.hash || "") !== "#combos") location.hash = "#combos";
        else render();
      } else render();
      return;
    }
    if (act === "say") {
      speakJa(b.getAttribute("data-text"));
      return;
    }
    if (act === "audio-auto") {
      setAudioPrefs({ auto: !audioPrefs().auto });
      render();
      return;
    }
    if (act === "audio-rate") {
      setAudioPrefs({ rate: audioPrefs().rate === "slow" ? "normal" : "slow" });
      render();
      speakJa(audioPrefs().rate === "slow" ? "ゆっくり" : "ふつう");
      return;
    }
    if (act === "dr-start") {
      if (!startDrill(b.getAttribute("data-scope"))) { window.alert("No questions available here yet."); return; }
      render();
      window.scrollTo(0, 0);
      return;
    }
    if (act === "dr-home") {
      ui.drill = null;
      render();
      return;
    }
    if (act === "dr-src") {
      setDrillSrc(b.getAttribute("data-sec"), b.getAttribute("data-src"));
      render();
      return;
    }
    if (act === "dr-imp") {
      setDrillImpOnly(!drillImpOnly());
      render();
      return;
    }
    if (act === "dr-reload-bi") {
      builtinLoad.failed = false;
      ensureBuiltin();
      render();
      return;
    }
    if (ui.drill && /^dr-/.test(act)) {
      var dst = ui.drill, dq = dst.qs[dst.index];
      if (!dq) return;
      if (act === "dr-pick") {
        if (dst.answered) return;
        var di = parseInt(b.getAttribute("data-i"), 10);
        dst.answered = { chosen: di, ok: di === dq.answer };
        if (!dst.answered.ok) { drillRecord(dq, false, "wrong"); dst.results.push("wrong"); }
        render();
        autoSpeak(drillSpeechText(dq));
        return;
      }
      if (act === "dr-chunk") {
        if (dst.answered) return;
        var ci = parseInt(b.getAttribute("data-i"), 10);
        if (dst.placed.indexOf(ci) !== -1) return;
        for (var si = 0; si < 4; si++) if (dst.placed[si] == null) { dst.placed[si] = ci; break; }
        render();
        return;
      }
      if (act === "dr-unslot") {
        if (dst.answered) return;
        dst.placed[parseInt(b.getAttribute("data-slot"), 10)] = null;
        render();
        return;
      }
      if (act === "dr-check") {
        if (dst.answered || dst.placed.filter(function (x) { return x != null; }).length !== 4) return;
        var cok = dst.placed.join(",") === "0,1,2,3";
        dst.answered = { ok: cok };
        if (!cok) { drillRecord(dq, false, "wrong"); dst.results.push("wrong"); }
        render();
        autoSpeak(drillSpeechText(dq));
        return;
      }
      if (act === "dr-mark") {
        if (!dst.answered || !dst.answered.ok || dst.answered.marked) return;
        var mark = b.getAttribute("data-mark");
        if (["knew", "elim", "lucky"].indexOf(mark) === -1) return;
        dst.answered.marked = true;
        drillRecord(dq, true, mark);
        dst.results.push(mark);
        dst.index += 1; dst.answered = null; dst.placed = [null, null, null, null];
        render();
        window.scrollTo(0, 0);
        return;
      }
      if (act === "dr-next") {
        dst.index += 1; dst.answered = null; dst.placed = [null, null, null, null];
        render();
        window.scrollTo(0, 0);
        return;
      }
    }
    if (act === "sync-connect") {
      var tokBox = document.getElementById("sync-token");
      var tok = tokBox ? String(tokBox.value || "").replace(/\s+/g, "") : "";
      if (!tok) { ui.syncMsg = "Paste the token first."; render(); return; }
      try { localStorage.setItem(SYNC_TOKEN_KEY, tok); } catch (err) {}
      setSyncMeta({ status: null, error: null, gistId: null, gistUrl: null, lastSync: null });
      ui.syncMsg = "Connecting…";
      render();
      syncNow("connect").then(function (r) {
        var m = syncMeta();
        if (r === "error" && m.authError) {
          try { localStorage.removeItem(SYNC_TOKEN_KEY); localStorage.removeItem(SYNC_META_KEY); } catch (err) {}
          ui.syncMsg = m.error;
        } else if (r === "error") ui.syncMsg = "Saved the token, but the first sync failed. It will retry.";
        else ui.syncMsg = "Sync is on. Do the same on your other devices.";
        render();
      });
      return;
    }
    if (act === "sync-now") {
      ui.syncMsg = null;
      syncNow("manual").then(function () { updateSyncStatus(); });
      return;
    }
    if (act === "sync-off") {
      if (!window.confirm("Turn off sync on this device? Your words stay here and on GitHub; this device just stops syncing.")) return;
      try { localStorage.removeItem(SYNC_TOKEN_KEY); localStorage.removeItem(SYNC_META_KEY); } catch (err) {}
      ui.syncMsg = "Sync turned off on this device.";
      render();
      return;
    }
    if (act === "bulk-add") {
      var bulkBox = document.getElementById("bulk-box");
      if (!bulkBox) return;
      /* Fold in anything another tab/app copy saved first, so duplicates are judged against everything. */
      progress = mergeProgress(progress, readLocalParsed());
      var bc = bulkCount(bulkBox.value);
      if (!bc.found) {
        ui.bulkDraft = bulkBox.value;
        ui.bulkMsg = "No words found. Leave a blank line between words, 3 or 4 lines each.";
        render();
        return;
      }
      var bulkSeen = existingWordKeys();
      var bulkAt = Date.now();
      var bulkAdded = 0;
      bc.parsed.rows.forEach(function (row, i) {
        var k = wordKey(row.kanji, row.reading);
        if (bulkSeen[k]) return;
        bulkSeen[k] = 1;
        progress.words.push({
          id: newId("w"),
          kanji: row.kanji,
          reading: row.reading,
          english: row.english,
          example: row.example || "",
          addedDay: today,
          addedAt: new Date(bulkAt + i).toISOString(),
          lastResult: null,
          lastDay: null,
          due: null,
          streak: 0,
          interval: 0
        });
        bulkAdded += 1;
      });
      if (bulkAdded) saveProgress();
      ui.bulkMsg = "Added " + bulkAdded + " word" + (bulkAdded === 1 ? "" : "s") + (bc.dup ? "; skipped " + bc.dup + " you already had" : "") + "." + (bc.parsed.bad.length ? " " + bc.parsed.bad.length + (bc.parsed.bad.length === 1 ? " part was" : " parts were") + " not read (starting “" + bc.parsed.bad[0] + "”); your paste is still in the box so you can fix it." : "") + (bulkAdded ? " They join Today, 20 new words a day." : "");
      ui.bulkDraft = bc.parsed.bad.length ? bulkBox.value : "";
      render();
      return;
    }
    if (act === "ch-paste") {
      var pasteCh = chapterBy(b.getAttribute("data-id"));
      var box = document.getElementById("paste-box");
      if (!pasteCh || !box) return;
      var mode = b.getAttribute("data-mode") === "replace" ? "replace" : "append";
      if (mode === "replace" && !window.confirm("Replace every word in this chapter with this paste?")) return;
      var parsed = parsePaste(box.value);
      if (!parsed.rows.length) {
        ui.pasteMsg = "No lines imported" + (parsed.skipped ? " (" + parsed.skipped + " skipped)." : ".");
        render();
        return;
      }
      if (mode === "replace") { (pasteCh.words || []).forEach(function (w) { tombstone(w.id); }); pasteCh.words = []; }
      parsed.rows.forEach(function (row) {
        pasteCh.words.push({
          id: newId("cw"),
          kanji: row.kanji,
          reading: row.reading,
          english: row.english,
          example: row.example || ""
        });
      });
      saveProgress();
      ui.pasteMsg = (mode === "replace" ? "Replaced with " : "Appended ") + parsed.rows.length + " word" + (parsed.rows.length === 1 ? "" : "s") + (parsed.skipped ? "; skipped " + parsed.skipped + "." : ".");
      box.value = "";
      render();
      return;
    }
    if (act === "ch-del-word") {
      var delCh = chapterBy(b.getAttribute("data-id"));
      var wid = b.getAttribute("data-word");
      if (!delCh || !wid) return;
      if (!window.confirm("Delete this word from the chapter?")) return;
      tombstone(wid);
      delCh.words = (delCh.words || []).filter(function (w) { return w.id !== wid; });
      saveProgress();
      render();
      return;
    }
    if (act === "ch-delete") {
      var killId = b.getAttribute("data-id");
      var kill = chapterBy(killId);
      if (!kill) return;
      if (!window.confirm("Delete chapter “" + kill.name + "”? Words in it will be removed. Mistake history stays.")) return;
      tombstone(killId);
      progress.chapters = (progress.chapters || []).filter(function (c) { return c.id !== killId; });
      ui.chapterId = null;
      ui.editMsg = null;
      saveProgress();
      render();
      return;
    }
    if (act === "combo-level") {
      ui.comboLevel = b.getAttribute("data-id");
      ui.comboChunk = null;
      render();
      return;
    }
    if (act === "combo-chunk") {
      ui.comboChunk = Number(b.getAttribute("data-index"));
      render();
      return;
    }
    if (act === "combo-back") {
      ui.chFlash = null;
      ui.chQuiz = null;
      if (ui.comboChunk != null) ui.comboChunk = null;
      else ui.comboLevel = null;
      render();
      return;
    }
    if (act === "combo-flash") {
      if (ui.comboLevel == null || ui.comboChunk == null) return;
      startComboFlash(ui.comboLevel, ui.comboChunk);
      return;
    }
    if (act === "combo-quiz") {
      if (ui.comboLevel == null || ui.comboChunk == null) return;
      startComboQuiz(ui.comboLevel, ui.comboChunk, b.getAttribute("data-mode"));
      return;
    }
    if (act === "wrong-stop") {
      ui.chFlash = null;
      ui.chQuiz = null;
      if ((location.hash || "") !== "#wrong") location.hash = "#wrong";
      else render();
      return;
    }
    if (act === "wrong-flash") {
      var scopeF = b.getAttribute("data-scope") === "all" ? "all" : "open";
      var rowsF = wrongWordSummaries().filter(function (r) { return scopeF === "all" || r.open; });
      if (!rowsF.length) return;
      var idsF = rowsF.map(function (r) { return ensureWordFromSummary(r).id; });
      saveProgress();
      ui.chFlash = { fromWrong: true, ids: idsF, index: 0, revealed: false };
      ui.chQuiz = null;
      render();
      return;
    }
    if (act === "wrong-quiz") {
      var scopeQ = b.getAttribute("data-scope") === "all" ? "all" : "open";
      var modeQ = b.getAttribute("data-mode") === "dark" ? "dark" : "choice";
      var rowsQ = wrongWordSummaries().filter(function (r) { return scopeQ === "all" || r.open; });
      if (!rowsQ.length) return;
      var wordsQ = rowsQ.map(function (r) { return ensureWordFromSummary(r); });
      saveProgress();
      // virtual chapter for quizChoices
      var virtId = "wrong-virt";
      ui._wrongPool = wordsQ;
      ui.chQuiz = {
        fromWrong: true,
        chapterId: virtId,
        ids: shuffleIds(wordsQ.map(function (w) { return w.id; })),
        index: 0,
        correct: 0,
        mode: modeQ,
        promptSide: modeQ === "dark" ? darkPromptSide() : (Math.random() < 0.5 ? "english" : "reading"),
        choices: null,
        feedback: null
      };
      ui.chFlash = null;
      render();
      return;
    }
    if (act === "wrong-mark") {
      if (!ui.chFlash || !ui.chFlash.fromWrong) return;
      var ww = wordBy(ui.chFlash.ids[ui.chFlash.index]);
      if (!ww) return;
      var wok = b.getAttribute("data-ok") === "1";
      gradeWord(ww, wok, today);
      if (!wok) logCouldNotRead(ww, today);
      else recordCorrectReview(ww.id);
      bumpStat("wordsGraded", 1);
      saveProgress();
      ui.chFlash.index += 1;
      ui.chFlash.revealed = false;
      render();
      return;
    }
    if (act === "ch-flash") {
      var flashCh = chapterBy(b.getAttribute("data-id"));
      if (!flashCh || !(flashCh.words && flashCh.words.length)) return;
      ui.chFlash = {
        chapterId: flashCh.id,
        ids: flashCh.words.map(function (w) { return w.id; }),
        index: 0,
        revealed: false
      };
      ui.chQuiz = null;
      render();
      return;
    }
    if (act === "ch-flip") {
      if (!ui.chFlash) return;
      ui.chFlash.revealed = true;
      render();
      var fId = ui.chFlash.ids[ui.chFlash.index];
      autoSpeak(speechReadingOfWord(ui.chFlash.fromWrong ? wordBy(fId) : chapterWordBy(ui.chFlash.chapterId, fId)));
      return;
    }
    if (act === "ch-next") {
      if (!ui.chFlash) return;
      ui.chFlash.index += 1;
      ui.chFlash.revealed = false;
      if (ui.chFlash.index === ui.chFlash.ids.length) {
        var cf = ui.chFlash;
        if (cf.fromCombo) recordCompletion("combo", cf.comboRef, ui._comboLabel, "flash", null, cf.ids.length);
        else if (!cf.fromWrong) recordCompletion("ch", cf.chapterId, (chapterBy(cf.chapterId) || {}).name, "flash", null, cf.ids.length);
      }
      render();
      return;
    }
    if (act === "ch-shuffle") {
      if (!ui.chFlash) return;
      ui.chFlash.ids = shuffleIds(ui.chFlash.ids);
      ui.chFlash.index = 0;
      ui.chFlash.revealed = false;
      render();
      return;
    }
    if (act === "ch-quiz") {
      var quizCh = chapterBy(b.getAttribute("data-id"));
      if (!quizCh || !(quizCh.words && quizCh.words.length)) return;
      var rawMode = b.getAttribute("data-mode");
      var mode = rawMode === "type" ? "type" : rawMode === "dark" ? "dark" : "choice";
      ui.chQuiz = {
        chapterId: quizCh.id,
        ids: shuffleIds(quizCh.words.map(function (w) { return w.id; })),
        index: 0,
        correct: 0,
        mode: mode,
        promptSide: mode === "dark" ? darkPromptSide() : (Math.random() < 0.5 ? "english" : "reading"),
        choices: null,
        feedback: null
      };
      ui.chFlash = null;
      render();
      return;
    }
    if (act === "ch-choice") {
      if (!ui.chQuiz || ui.chQuiz.feedback) return;
      var pickedId = b.getAttribute("data-id");
      var curW = chapterWordBy(ui.chQuiz.chapterId, ui.chQuiz.ids[ui.chQuiz.index]);
      var ok = pickedId === curW.id;
      finishQuizItem(ok, curW);
      return;
    }
    if (act === "ch-quiz-next") {
      if (!ui.chQuiz) return;
      ui.chQuiz.index += 1;
      ui.chQuiz.feedback = null;
      ui.chQuiz.choices = null;
      ui.chQuiz.promptSide = ui.chQuiz.mode === "dark" ? darkPromptSide() : (Math.random() < 0.5 ? "english" : "reading");
      if (ui.chQuiz.index >= ui.chQuiz.ids.length) {
        bumpStat("quizzes", 1);
        var cq = ui.chQuiz;
        if (cq.fromCombo) recordCompletion("combo", cq.comboRef, ui._comboLabel, cq.mode, cq.correct, cq.ids.length);
        else if (!cq.fromWrong) recordCompletion("ch", cq.chapterId, (chapterBy(cq.chapterId) || {}).name, cq.mode, cq.correct, cq.ids.length);
      }
      render();
      return;
    }
    if (act === "export") { exportProgress(); return; }
    if (act === "g-open") {
      ui.gChapterId = b.getAttribute("data-id");
      ui.gEditPointId = null;
      ui.gPointMsg = null;
      ui.gPasteMsg = null;
      ui.gEditMsg = null;
      ui.gFlash = null;
      ui.gQuiz = null;
      render();
      return;
    }
    if (act === "g-back") {
      ui.gChapterId = null;
      ui.gEditPointId = null;
      ui.gPointMsg = null;
      ui.gPasteMsg = null;
      ui.gFlash = null;
      ui.gQuiz = null;
      render();
      return;
    }
    if (act === "g-stop") {
      ui.gFlash = null;
      ui.gQuiz = null;
      render();
      return;
    }
    if (act === "g-paste") {
      var gCh = gChapterBy(b.getAttribute("data-id"));
      var gBox = document.getElementById("g-paste-box");
      if (!gCh || !gBox) return;
      var gMode = b.getAttribute("data-mode") === "replace" ? "replace" : "append";
      if (gMode === "replace" && !window.confirm("Replace every grammar point in this chapter with this paste?")) return;
      var gParsed = parseGrammarPaste(gBox.value);
      if (!gParsed.rows.length) {
        ui.gPasteMsg = "No lines imported" + (gParsed.skipped ? " (" + gParsed.skipped + " skipped)." : ".");
        render();
        return;
      }
      if (gMode === "replace") { (gCh.points || []).forEach(function (pt) { tombstone(pt.id); }); gCh.points = []; }
      gParsed.rows.forEach(function (row) {
        gCh.points.push({
          id: newId("gp"),
          pattern: row.pattern,
          reading: row.reading || "",
          meaning: row.meaning,
          usage: row.usage,
          example: row.example || ""
        });
      });
      saveProgress();
      var gWithR = gParsed.rows.filter(function (r) { return r.reading; }).length;
      ui.gPasteMsg = (gMode === "replace" ? "Replaced with " : "Appended ") + gParsed.rows.length + " point" + (gParsed.rows.length === 1 ? "" : "s") + (gWithR ? " (" + gWithR + " with reading)" : "") + (gParsed.skipped ? "; skipped " + gParsed.skipped + "." : ".");
      gBox.value = "";
      render();
      return;
    }
    if (act === "g-edit-point") {
      ui.gEditPointId = b.getAttribute("data-point");
      ui.gPointMsg = null;
      render();
      var geR = document.getElementById("ge-reading");
      if (geR) { geR.scrollIntoView({ block: "center" }); geR.focus(); }
      return;
    }
    if (act === "g-edit-cancel") {
      ui.gEditPointId = null;
      render();
      return;
    }
    if (act === "g-del-point") {
      var delG = gChapterBy(b.getAttribute("data-id"));
      var pid = b.getAttribute("data-point");
      if (!delG || !pid) return;
      if (!window.confirm("Delete this grammar point?")) return;
      tombstone(pid);
      delG.points = (delG.points || []).filter(function (p) { return p.id !== pid; });
      saveProgress();
      render();
      return;
    }
    if (act === "g-delete") {
      var killG = b.getAttribute("data-id");
      var killCh = gChapterBy(killG);
      if (!killCh) return;
      if (!window.confirm("Delete grammar chapter “" + killCh.name + "”?")) return;
      tombstone(killG);
      progress.grammarChapters = (progress.grammarChapters || []).filter(function (c) { return c.id !== killG; });
      ui.gChapterId = null;
      ui.gEditMsg = null;
      saveProgress();
      render();
      return;
    }
    if (act === "g-flash") {
      var flashG = gChapterBy(b.getAttribute("data-id"));
      if (!flashG || !(flashG.points && flashG.points.length)) return;
      ui.gFlash = {
        chapterId: flashG.id,
        ids: flashG.points.map(function (p) { return p.id; }),
        index: 0,
        revealed: false
      };
      ui.gQuiz = null;
      render();
      return;
    }
    if (act === "g-flip") {
      if (!ui.gFlash) return;
      ui.gFlash.revealed = true;
      render();
      autoSpeak(speechReadingOfPattern(gPointBy(ui.gFlash.chapterId, ui.gFlash.ids[ui.gFlash.index])));
      return;
    }
    if (act === "g-next") {
      if (!ui.gFlash) return;
      ui.gFlash.index += 1;
      ui.gFlash.revealed = false;
      if (ui.gFlash.index === ui.gFlash.ids.length) recordCompletion("g", ui.gFlash.chapterId, (gChapterBy(ui.gFlash.chapterId) || {}).name, "flash", null, ui.gFlash.ids.length);
      render();
      return;
    }
    if (act === "g-shuffle") {
      if (!ui.gFlash) return;
      ui.gFlash.ids = shuffleIds(ui.gFlash.ids);
      ui.gFlash.index = 0;
      ui.gFlash.revealed = false;
      render();
      return;
    }
    if (act === "g-quiz") {
      var quizG = gChapterBy(b.getAttribute("data-id"));
      if (!quizG || !(quizG.points && quizG.points.length)) return;
      var gQMode = b.getAttribute("data-mode") === "type" ? "type" : "choice";
      ui.gQuiz = {
        chapterId: quizG.id,
        ids: shuffleIds(quizG.points.map(function (p) { return p.id; })),
        index: 0,
        correct: 0,
        mode: gQMode,
        choices: null,
        feedback: null
      };
      ui.gFlash = null;
      render();
      return;
    }
    if (act === "g-choice") {
      if (!ui.gQuiz || ui.gQuiz.feedback) return;
      var pickId = b.getAttribute("data-id");
      var curG = gPointBy(ui.gQuiz.chapterId, ui.gQuiz.ids[ui.gQuiz.index]);
      if (!curG) return;
      var gOk = pickId === curG.id;
      if (gOk) ui.gQuiz.correct += 1;
      bumpStat("wordsGraded", 1);
      ui.gQuiz.feedback = { ok: gOk };
      render();
      autoSpeak(speechReadingOfPattern(curG));
      return;
    }
    if (act === "g-quiz-next") {
      if (!ui.gQuiz) return;
      ui.gQuiz.index += 1;
      ui.gQuiz.feedback = null;
      ui.gQuiz.choices = null;
      if (ui.gQuiz.index >= ui.gQuiz.ids.length) {
        bumpStat("quizzes", 1);
        recordCompletion("g", ui.gQuiz.chapterId, (gChapterBy(ui.gQuiz.chapterId) || {}).name, ui.gQuiz.mode, ui.gQuiz.correct, ui.gQuiz.ids.length);
      }
      render();
      return;
    }

    if (act === "open-read") { ui.readingId = b.getAttribute("data-id"); render(); return; }
    if (act === "close-read") { ui.readingId = null; render(); return; }
    if (act === "read-pick") {
      var key = "rq-" + b.getAttribute("data-pid") + "-" + b.getAttribute("data-qi");
      if (ui[key] == null) ui[key] = Number(b.getAttribute("data-ci"));
      render();
      return;
    }
    if (act === "listen-pick") {
      var id = b.getAttribute("data-id");
      if (ui["lq-" + id] == null) ui["lq-" + id] = Number(b.getAttribute("data-ci"));
      render();
      return;
    }
    if (act === "script") {
      var sid = b.getAttribute("data-id");
      ui.scripts[sid] = !ui.scripts[sid];
      render();
      return;
    }
    if (act === "speak") {
      var listen = (window.LISTENING || []).filter(function (x) { return x.id === b.getAttribute("data-id"); })[0];
      if (!listen || !window.speechSynthesis) return;
      window.speechSynthesis.cancel();
      var u = new SpeechSynthesisUtterance(listen.parts.map(function (p) { return p.t; }).join(""));
      u.lang = "ja-JP";
      u.rate = 0.92;
      window.speechSynthesis.speak(u);
      return;
    }
    if (act === "mock-start") {
      ui.mock = {
        paper: b.getAttribute("data-paper") === "long" ? "long" : "short",
        phase: "lk",
        idx: 0,
        lkAnswers: [],
        rdAnswers: [],
        lsAnswers: []
      };
      render();
      return;
    }
    if (act === "mock-clear") { ui.mock = null; render(); return; }
    if (act === "mock-pick") {
      var ci = Number(b.getAttribute("data-ci"));
      if (ui.mock.phase === "lk") ui.mock.lkAnswers[ui.mock.idx] = ci;
      if (ui.mock.phase === "reading") ui.mock.rdAnswers[ui.mock.idx] = ci;
      if (ui.mock.phase === "listening") ui.mock.lsAnswers[ui.mock.idx] = ci;
      render();
      return;
    }
    if (act === "mock-prev") {
      if (ui.mock.idx > 0) ui.mock.idx -= 1;
      render();
      return;
    }
    if (act === "mock-next") {
      var paper = activePaper();
      if (ui.mock.phase === "lk") {
        if (ui.mock.idx < paper.lk.length - 1) ui.mock.idx += 1;
        else { ui.mock.phase = "reading"; ui.mock.idx = 0; }
      } else if (ui.mock.phase === "reading") {
        if (ui.mock.idx < paper.reading.length - 1) ui.mock.idx += 1;
        else { ui.mock.phase = "listening"; ui.mock.idx = 0; }
      } else if (ui.mock.phase === "listening") {
        if (ui.mock.idx < paper.listening.length - 1) ui.mock.idx += 1;
        else ui.mock.phase = "done";
      }
      render();
      return;
    }
  });

  main.addEventListener("submit", function (e) {
    var rename = e.target.closest("form[data-act='ch-rename']");
    if (rename) {
      e.preventDefault();
      var chR = chapterBy(ui.chapterId);
      if (!chR) return;
      var newName = (rename.name.value || "").trim();
      if (!newName) return;
      chR.name = newName;
      chR.updatedAt = new Date().toISOString();
      ui.editMsg = "Renamed to “" + newName + "”.";
      saveProgress();
      render();
      return;
    }
    var create = e.target.closest("form[data-act='ch-create']");
    if (create) {
      e.preventDefault();
      var name = (create.name.value || "").trim();
      if (!name) return;
      if (!progress.chapters) progress.chapters = [];
      progress.chapters.push({ id: newId("ch"), name: name, createdAt: new Date().toISOString(), words: [] });
      saveProgress();
      if (typeof create.reset === "function") create.reset();
      render();
      return;
    }
    var typeForm = e.target.closest("form[data-act='ch-type']");
    if (typeForm) {
      e.preventDefault();
      if (!ui.chQuiz || ui.chQuiz.feedback) return;
      var cur = chapterWordBy(ui.chQuiz.chapterId, ui.chQuiz.ids[ui.chQuiz.index]);
      var ans = (typeForm.answer.value || "").trim();
      if (!ans) return;
      ui.chQuiz.typed = ans;
      finishQuizItem(wordTypedOk(ans, cur), cur);
      if (ui.chQuiz && ui.chQuiz.feedback) { ui.chQuiz.feedback.typed = ans; render(); }
      return;
    }
    var gRename = e.target.closest("form[data-act='g-rename']");
    if (gRename) {
      e.preventDefault();
      var gChR = gChapterBy(ui.gChapterId);
      if (!gChR) return;
      var gNew = (gRename.name.value || "").trim();
      if (!gNew) return;
      gChR.name = gNew;
      gChR.updatedAt = new Date().toISOString();
      ui.gEditMsg = "Renamed to “" + gNew + "”.";
      saveProgress();
      render();
      return;
    }
    var gCreate = e.target.closest("form[data-act='g-create']");
    if (gCreate) {
      e.preventDefault();
      var gName = (gCreate.name.value || "").trim();
      if (!gName) return;
      if (!progress.grammarChapters) progress.grammarChapters = [];
      progress.grammarChapters.push({ id: newId("gch"), name: gName, createdAt: new Date().toISOString(), points: [] });
      saveProgress();
      if (typeof gCreate.reset === "function") gCreate.reset();
      render();
      return;
    }
    var gEdit = e.target.closest("form[data-act='g-edit-save']");
    if (gEdit) {
      e.preventDefault();
      progress = mergeProgress(progress, readLocalParsed());
      var gePt = gPointBy(gEdit.getAttribute("data-id"), gEdit.getAttribute("data-point"));
      if (!gePt) { ui.gEditPointId = null; render(); return; }
      var gePattern = (gEdit.pattern.value || "").trim();
      var geMeaning = (gEdit.meaning.value || "").trim();
      if (!gePattern || !geMeaning) return;
      gePt.pattern = gePattern;
      gePt.reading = (gEdit.reading.value || "").trim();
      gePt.meaning = geMeaning;
      gePt.usage = (gEdit.usage.value || "").trim();
      gePt.example = (gEdit.example.value || "").trim();
      gePt.updatedAt = new Date().toISOString();
      ui.gEditPointId = null;
      ui.gPointMsg = "Saved “" + gePattern + "”" + (gePt.reading ? " (" + gePt.reading + ")." : ".");
      saveProgress();
      render();
      return;
    }
    var gType = e.target.closest("form[data-act='g-type']");
    if (gType) {
      e.preventDefault();
      if (!ui.gQuiz || ui.gQuiz.feedback) return;
      var gCur = gPointBy(ui.gQuiz.chapterId, ui.gQuiz.ids[ui.gQuiz.index]);
      if (!gCur) return;
      var gAns = (gType.answer.value || "").trim();
      var gOkType = grammarTypedOk(gAns, gCur);
      if (gOkType) ui.gQuiz.correct += 1;
      bumpStat("wordsGraded", 1);
      ui.gQuiz.feedback = { ok: gOkType, typed: gAns };
      render();
      autoSpeak(speechReadingOfPattern(gCur));
      return;
    }
    var form = e.target.closest("form[data-act='save-word']");
    if (!form) return;
    e.preventDefault();
    var kanji = form.kanji.value.trim();
    var reading = form.reading.value.trim();
    var english = form.english.value.trim();
    var example = form.example.value.trim();
    if (!kanji || !reading || !english) return;
    var today = todayISO();
    progress.words.push({
      id: newId("w"),
      kanji: kanji,
      reading: reading,
      english: english,
      example: example,
      addedDay: today,
      addedAt: new Date().toISOString(),
      lastResult: null,
      lastDay: null,
      due: null,
      streak: 0,
      interval: 0
    });
    saveProgress();
    if (typeof form.reset === "function") form.reset();
    location.hash = "#today";
  });

  main.addEventListener("input", function (e) {
    if (e.target.id !== "bulk-box") return;
    ui.bulkDraft = e.target.value;
    ui.bulkMsg = null;
    var pv = document.getElementById("bulk-preview");
    if (pv) pv.textContent = bulkPreviewText(e.target.value);
  });

  main.addEventListener("change", function (e) {
    if (e.target.id !== "import-file") return;
    var file = e.target.files && e.target.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var data = JSON.parse(String(reader.result));
        if (!data || data.app !== "jlpt-n2" || !Array.isArray(data.words) || !Array.isArray(data.mistakes)) {
          window.alert("That file is not an export of your N2 study progress.");
          return;
        }
        if (!window.confirm("Replace words, chapters, grammar, and mistake history on this device with this file?")) return;
        progress = normalizeProgress({
          version: 2,
          words: data.words,
          mistakes: data.mistakes,
          doneDays: (data.doneDays && typeof data.doneDays === "object") ? data.doneDays : {},
          chapters: Array.isArray(data.chapters) ? data.chapters : [],
          grammarChapters: Array.isArray(data.grammarChapters) ? data.grammarChapters : [],
          drillLog: Array.isArray(data.drillLog) ? data.drillLog : [],
          completions: Array.isArray(data.completions) ? data.completions : [],
          stats: (data.stats && typeof data.stats === "object") ? data.stats : { days: {} }
        });
        writeLocal(progress);
        idbSetProgress(progress);
        session = null;
        saveSession();
        location.hash = "#today";
        render();
      } catch (err) {
        window.alert("That file could not be read as JSON.");
      }
    };
    reader.readAsText(file);
  });

  if (furiBtn) furiBtn.addEventListener("click", function () {
    furigana = !furigana;
    localStorage.setItem(FURI_KEY, furigana ? "1" : "0");
    render();
  });
  if (nav) {
    nav.addEventListener("click", function (e) {
      var a = e.target.closest("a");
      if (!a || !nav.contains(a)) return;
      var href = a.getAttribute("href") || "";
      if (href.charAt(0) !== "#") return;
      e.preventDefault();
      if (location.hash === href) render();
      else location.hash = href;
    });
  }
  window.addEventListener("hashchange", function () { render(); });
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "visible") { startActiveClock(); syncIfStale(20000); }
    else { stopActiveClock(); syncNow("hidden"); }
  });
  function syncIfStale(ms) {
    var last = syncMeta().lastSync;
    if (!last || Date.now() - new Date(last).getTime() > ms || syncMeta().pending) syncNow("focus");
  }
  window.addEventListener("online", function () { syncNow("online"); });
  window.addEventListener("offline", function () { if (syncToken()) setSyncMeta({ status: "offline" }); });
  setInterval(function () { if (document.visibilityState === "visible") syncIfStale(180000); }, 60000);
  window.addEventListener("pageshow", function () { startActiveClock(); });
  window.addEventListener("pagehide", function () { stopActiveClock(); });
  window.addEventListener("focus", function () { startActiveClock(); syncIfStale(20000); });
  window.addEventListener("blur", function () { flushActiveTime(); });
  setInterval(function () {
    if (document.visibilityState === "visible") flushActiveTime();
  }, 15000);
  startActiveClock();
  if ("serviceWorker" in navigator && location.protocol.indexOf("http") === 0) {
    navigator.serviceWorker.register("./sw.js").catch(function () {});
  }
  restoreFromMirrors().then(function () {
    render();
    syncNow("startup");
  }).catch(function () {
    render();
    syncNow("startup");
  });
})();
}
