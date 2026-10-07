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
  return { version: 2, words: [], mistakes: [], doneDays: {}, chapters: [], grammarChapters: [], stats: { days: {} } };
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

/* Grammar paste: pattern | meaning | usage [| example] — tab, comma, or | */
function splitGrammarPasteLine(line) {
  var s = String(line || "").trim();
  if (!s) return null;
  var parts;
  if (s.indexOf("\t") !== -1) parts = s.split("\t");
  else if (s.indexOf("|") !== -1) parts = s.split("|");
  else if (s.indexOf(",") !== -1) parts = s.split(",");
  else return null;
  parts = parts.map(function (p) { return p.trim(); });
  while (parts.length && parts[parts.length - 1] === "") parts.pop();
  if (parts.length < 3) return null;
  return {
    pattern: parts[0],
    meaning: parts[1],
    usage: parts[2],
    example: parts.slice(3).join(" ").trim()
  };
}

function parseGrammarPaste(text) {
  var rows = [];
  var skipped = 0;
  String(text || "").split(/\r?\n/).forEach(function (line) {
    var t = line.trim();
    if (!t) return;
    var row = splitGrammarPasteLine(t);
    if (!row || !row.pattern || !row.meaning || !row.usage) {
      skipped += 1;
      return;
    }
    rows.push(row);
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
  var ui = { readingId: null, scripts: {}, mock: null, mockPaper: "short", chapterId: null, pasteMsg: null, chFlash: null, chQuiz: null, editMsg: null, comboLevel: null, comboChunk: null, gChapterId: null, gPasteMsg: null, gEditMsg: null, gFlash: null, gQuiz: null, bulkDraft: "", bulkMsg: null, syncMsg: null };

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
    var hasMiss = p.mistakes && p.mistakes.length;
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
    a.chapters = byIdMerge(a.chapters, b.chapters, tomb, function (x, y) { x.words = byIdMerge(x.words, y.words, tomb); });
    a.grammarChapters = byIdMerge(a.grammarChapters, b.grammarChapters, tomb, function (x, y) { x.points = byIdMerge(x.points, y.points, tomb); });
    a.words = byIdMerge(a.words, b.words, tomb, function (x, y) {
      if (JSON.stringify(y).length > JSON.stringify(x).length && (y.lastDay || "") >= (x.lastDay || "")) Object.keys(y).forEach(function (k) { x[k] = y[k]; });
    });
    var mk = {};
    (a.mistakes || []).forEach(function (m) { if (m) mk[m.at + "|" + m.wordId] = 1; });
    (b.mistakes || []).forEach(function (m) { if (m && !mk[m.at + "|" + m.wordId]) a.mistakes.push(m); });
    Object.keys(b.doneDays || {}).forEach(function (k) { if (!a.doneDays[k]) a.doneDays[k] = b.doneDays[k]; });
    var bd = (b.stats && b.stats.days) || {};
    Object.keys(bd).forEach(function (k) {
      var x = a.stats.days[k], y = bd[k];
      if (!x) { a.stats.days[k] = y; return; }
      ["activeMs", "sessions", "quizzes", "levels", "wordsGraded"].forEach(function (f) { if ((y[f] || 0) > (x[f] || 0)) x[f] = y[f]; });
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
  function blankDayStats(date) {
    return { date: date, activeMs: 0, sessions: 0, quizzes: 0, levels: 0, wordsGraded: 0, levelKeys: [] };
  }
  function ensureDayStats(date) {
    if (!progress.stats || typeof progress.stats !== "object") progress.stats = { days: {} };
    if (!progress.stats.days || typeof progress.stats.days !== "object") progress.stats.days = {};
    if (!progress.stats.days[date]) progress.stats.days[date] = blankDayStats(date);
    var d = progress.stats.days[date];
    if (!Array.isArray(d.levelKeys)) d.levelKeys = [];
    ["activeMs", "sessions", "quizzes", "levels", "wordsGraded"].forEach(function (k) {
      if (d[k] == null) d[k] = 0;
    });
    return d;
  }
  function flushActiveTime() {
    if (activeSince == null) return;
    var now = Date.now();
    var elapsed = now - activeSince;
    if (elapsed > 0) {
      ensureDayStats(todayISO()).activeMs += elapsed;
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
    return !!(row && ((row.activeMs || 0) > 0 || (row.wordsGraded || 0) > 0 || (row.sessions || 0) > 0 || (row.quizzes || 0) > 0 || (row.levels || 0) > 0));
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
  }

  function pageName() {
    var hash = (location.hash || "#today").replace("#", "");
    var open = ["today", "chapters", "combos", "wrong", "stats", "add", "grammar"];
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
      if (id === page || (page === "drill" && id === "today")) a.setAttribute("aria-current", "page");
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
    html += syncCardHtml();
    html += backupControlsHtml();
    main.innerHTML = html;
    updateSyncStatus();
  }

  function renderEnd() {
    main.innerHTML = "<p>Today's unit is complete.</p>" + studyBoxHtml(todayStudySummary()) + backupControlsHtml();
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
    html += '<p class="mode-label">Completions</p>';
    html += '<p class="muted">Days with activity in the same window.</p>';
    html += '<div class="stat-scroll">';
    var listed = false;
    recent.forEach(function (d) {
      if (!dayHasStudy(d)) return;
      listed = true;
      html += '<div class="item"><div class="w">' + esc(d.date) + "</div>";
      html += '<div class="m">' + esc(formatMinutes(d.activeMs)) + " · sessions " + (d.sessions || 0) + " · quizzes " + (d.quizzes || 0) + " · levels " + (d.levels || 0) + " · words " + (d.wordsGraded || 0) + "</div></div>";
    });
    if (!listed) html += '<div class="empty"><p>No study logged yet. Time counts while this page is open and visible.</p></div>';
    html += "</div>";
    html += backupControlsHtml();
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
        html += '<span class="action-title">' + esc(lv.label) + "</span>";
        html += '<span class="action-desc">' + lv.count + " words · " + chunks.length + " level" + (chunks.length === 1 ? "" : "s") + "</span></button>";
      });
      html += "</div>";
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
        html += '<span class="action-title">' + esc(ch.label) + "</span>";
        html += '<span class="action-desc">' + ch.count + " words</span></button>";
      });
      html += "</div>";
      main.innerHTML = html;
      return;
    }
    var pack = comboChunkBy(ui.comboLevel, ui.comboChunk);
    if (!pack) { ui.comboChunk = null; renderCombos(); return; }
    html += '<p><button type="button" class="secondary" data-act="combo-back">Back to ' + esc(lv.label) + "</button></p>";
    html += "<h1>" + esc(lv.label) + " · " + esc(pack.chunk.label) + "</h1>";
    html += "<p>" + pack.chunk.count + " words · level " + (pack.chunk.index + 1) + " of " + pack.chunkCount + "</p>";
    html += '<p class="mode-label">Practice</p>';
    html += '<div class="actions">';
    html += '<button type="button" class="primary" data-act="combo-flash"><span class="action-title">Flashcards</span><span class="action-desc">Kanji on the front. Flip for reading and meaning.</span></button>';
    html += '<button type="button" class="secondary" data-act="combo-quiz" data-mode="choice"><span class="action-title">Quiz · choose</span><span class="action-desc">See reading or meaning. Pick the kanji.</span></button>';
    html += '<button type="button" class="secondary" data-act="combo-quiz" data-mode="type"><span class="action-title">Quiz · type</span><span class="action-desc">See reading or meaning. Type the kanji.</span></button>';
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
      html += "<h1>" + esc(ch.name) + "</h1>";
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
        html += '<button type="button" class="secondary" data-act="ch-quiz" data-id="' + esc(ch.id) + '" data-mode="type"><span class="action-title">Quiz · type</span><span class="action-desc">See reading or meaning. Type the kanji.</span></button>';
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
        list += '<div class="w">' + esc(c.name) + "</div>";
        list += '<div class="m">' + (c.words || []).length + " words</div></button>";
      });
      list += "</div>";
    }
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
      html += '<p class="quiz-prompt" lang="' + (promptSide === "reading" ? "ja" : "en") + '">' + esc(promptSide === "reading" ? w.reading : w.english) + "</p>";
      html += "<p>" + (st.mode === "type" ? "Type the kanji." : "Choose the kanji.") + "</p>";
    }
    if (st.feedback) {
      html += '<p class="' + (st.feedback.ok ? "muted" : "warn") + '">' + (st.feedback.ok ? "Correct." : "Not this one.") + "</p>";
      html += '<div class="card">';
      html += '<p class="meaning" lang="ja">' + esc(w.kanji) + "</p>";
      html += '<p class="meaning" lang="ja">' + esc(w.reading) + "</p>";
      html += '<p class="meaning">' + esc(w.english || "") + "</p>";
      if (w.example) html += '<p lang="ja">' + esc(w.example) + "</p>";
      html += "</div>";
      html += '<button type="button" class="primary" data-act="ch-quiz-next">Next</button>';
    } else if (st.mode === "type") {
      html += '<form data-act="ch-type">';
      html += '<label for="quiz-type">Kanji</label>';
      html += '<input id="quiz-type" name="answer" type="text" autocomplete="off" lang="ja" autofocus>';
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
    return String(s || "").replace(/\s+/g, "").toLowerCase();
  }

  function renderGrammar() {
    if (ui.gFlash) { renderGrammarFlash(); return; }
    if (ui.gQuiz) { renderGrammarQuiz(); return; }
    var chapters = progress.grammarChapters || [];
    if (ui.gChapterId) {
      var ch = gChapterBy(ui.gChapterId);
      if (!ch) { ui.gChapterId = null; renderGrammar(); return; }
      var html = '<p><button type="button" class="secondary" data-act="g-back">All grammar</button></p>';
      html += "<h1>" + esc(ch.name) + "</h1>";
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
        html += '<div class="empty"><p>No grammar points yet.</p><p>Paste a list below, one point per line.</p></div>';
      } else {
        html += '<p class="mode-label">Practice</p>';
        html += '<div class="actions">';
        html += '<button type="button" class="primary" data-act="g-flash" data-id="' + esc(ch.id) + '"><span class="action-title">Flashcards</span><span class="action-desc">Pattern on the front. Flip for meaning, usage, and example.</span></button>';
        html += '<button type="button" class="secondary" data-act="g-quiz" data-id="' + esc(ch.id) + '" data-mode="choice"><span class="action-title">Quiz · choose</span><span class="action-desc">See the meaning. Pick the pattern.</span></button>';
        html += '<button type="button" class="secondary" data-act="g-quiz" data-id="' + esc(ch.id) + '" data-mode="type"><span class="action-title">Quiz · type</span><span class="action-desc">See the meaning. Type the pattern.</span></button>';
        html += "</div>";
      }
      html += "<h2>Paste grammar</h2>";
      html += '<p class="note">One point per line. Use tab, comma, or | between fields:<br>pattern[TAB]meaning[TAB]usage<br>pattern | meaning | usage<br>Optional 4th field: example. Only what you paste is saved — this app does not ship textbook grammar.</p>';
      html += '<label for="g-paste-box">Paste</label>';
      html += '<textarea id="g-paste-box" lang="ja" placeholder="～ばかり | only / just | marks that something is all that happens | 食べてばかりいる"></textarea>';
      html += '<div class="paste-actions">';
      html += '<button type="button" class="primary" data-act="g-paste" data-id="' + esc(ch.id) + '" data-mode="append">Append paste</button>';
      html += '<button type="button" class="secondary" data-act="g-paste" data-id="' + esc(ch.id) + '" data-mode="replace">Replace all with paste</button>';
      html += "</div>";
      if (ui.gPasteMsg) html += '<p class="muted">' + esc(ui.gPasteMsg) + "</p>";
      if (ch.points && ch.points.length) {
        html += "<h2>Points in this chapter</h2>";
        ch.points.forEach(function (p) {
          html += '<div class="word-row"><div class="meta"><div class="w" lang="ja">' + esc(p.pattern) + "</div>";
          html += '<div class="m">' + esc(p.meaning) + (p.usage ? " · " + esc(p.usage) : "") + "</div></div>";
          html += '<button type="button" class="danger" data-act="g-del-point" data-id="' + esc(ch.id) + '" data-point="' + esc(p.id) + '">Delete</button></div>';
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
        list += '<div class="w">' + esc(c.name) + "</div>";
        list += '<div class="m">' + (c.points || []).length + " points</div></button>";
      });
      list += "</div>";
    }
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
      html += '<button type="button" class="card" data-act="g-flip"><div class="jp kanji" lang="ja">' + esc(p.pattern) + "</div></button>";
    } else {
      html += '<div class="card">';
      html += '<div class="jp kanji" lang="ja">' + esc(p.pattern) + "</div>";
      html += '<p class="meaning">' + esc(p.meaning) + "</p>";
      html += '<p class="muted">' + esc(p.usage) + "</p>";
      if (p.example) html += '<p lang="ja">' + esc(p.example) + "</p>";
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
      html += '<div class="card"><div class="jp kanji" lang="ja">' + esc(p.pattern) + "</div>";
      html += '<p class="meaning">' + esc(p.meaning) + "</p>";
      if (p.usage) html += '<p class="muted">' + esc(p.usage) + "</p>";
      if (p.example) html += '<p lang="ja">' + esc(p.example) + "</p>";
      html += "</div>";
      html += '<button type="button" class="primary" data-act="g-quiz-next">Next</button>';
    } else if (st.mode === "type") {
      html += '<form data-act="g-type">';
      html += '<label for="g-type-in">Type the pattern</label>';
      html += '<input id="g-type-in" name="answer" type="text" autocomplete="off" lang="ja" required>';
      html += '<p><button type="submit" class="primary">Check</button></p>';
      html += "</form>";
    } else {
      if (!st.choices) st.choices = grammarChoices(ch, p.id, 4);
      st.choices.forEach(function (opt) {
        html += '<button type="button" class="choice" lang="ja" data-act="g-choice" data-id="' + esc(opt.id) + '">' + esc(opt.pattern) + "</button>";
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
    if (page === "today") {
      if (session && session.day === todayISO()) renderSession();
      else renderHome();
    } else if (page === "chapters") renderChapters();
    else if (page === "combos") renderCombos();
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
      return;
    }
    if (act === "ch-next") {
      if (!ui.chFlash) return;
      ui.chFlash.index += 1;
      ui.chFlash.revealed = false;
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
      if (ui.chQuiz.index >= ui.chQuiz.ids.length) bumpStat("quizzes", 1);
      render();
      return;
    }
    if (act === "export") { exportProgress(); return; }
    if (act === "g-open") {
      ui.gChapterId = b.getAttribute("data-id");
      ui.gPasteMsg = null;
      ui.gEditMsg = null;
      ui.gFlash = null;
      ui.gQuiz = null;
      render();
      return;
    }
    if (act === "g-back") {
      ui.gChapterId = null;
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
          meaning: row.meaning,
          usage: row.usage,
          example: row.example || ""
        });
      });
      saveProgress();
      ui.gPasteMsg = (gMode === "replace" ? "Replaced with " : "Appended ") + gParsed.rows.length + " point" + (gParsed.rows.length === 1 ? "" : "s") + (gParsed.skipped ? "; skipped " + gParsed.skipped + "." : ".");
      gBox.value = "";
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
      return;
    }
    if (act === "g-next") {
      if (!ui.gFlash) return;
      ui.gFlash.index += 1;
      ui.gFlash.revealed = false;
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
      return;
    }
    if (act === "g-quiz-next") {
      if (!ui.gQuiz) return;
      ui.gQuiz.index += 1;
      ui.gQuiz.feedback = null;
      ui.gQuiz.choices = null;
      if (ui.gQuiz.index >= ui.gQuiz.ids.length) bumpStat("quizzes", 1);
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
      finishQuizItem(ans === cur.kanji, cur);
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
    var gType = e.target.closest("form[data-act='g-type']");
    if (gType) {
      e.preventDefault();
      if (!ui.gQuiz || ui.gQuiz.feedback) return;
      var gCur = gPointBy(ui.gQuiz.chapterId, ui.gQuiz.ids[ui.gQuiz.index]);
      if (!gCur) return;
      var gAns = (gType.answer.value || "").trim();
      var gOkType = normGrammarAnswer(gAns) === normGrammarAnswer(gCur.pattern);
      if (gOkType) ui.gQuiz.correct += 1;
      bumpStat("wordsGraded", 1);
      ui.gQuiz.feedback = { ok: gOkType };
      render();
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
