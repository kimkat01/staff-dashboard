/* ===== GAS「しおどめねほりんぱほりん 通信」（2026-11-18 試作版） =====
   スプレッドシート「しおどめねほりんぱほりん 記録」（cryk0289）に紐付けて使う（拡張機能 → Apps Script に全文を貼る）。

   役割
   ・会場（staff-dashboard/nehori/）の入室・定期通信・退室・MCの操作
   ・どのアバターが誰か（園名・ログインID・名前）を記録する ← 本部だけが見る。ほかの参加者には送らない
   ・録音（各参加者の加工後の声を30秒ずつ）をドライブのフォルダ「しおどめねほりんぱほりん 録音」に保存
   ・本部の入室状況（honbu-dashboard/nehori-monitor.html）に、本名つきの一覧を返す

   シート（なければ自動で作る）
   ・入室記録：日時｜回｜種別｜役割｜アバター｜声｜園名｜ログインID｜名前｜接続ID
   ・録音    ：日時｜回｜役割｜アバター｜園名｜名前｜連番｜ファイル名｜URL｜接続ID

   デプロイ：デプロイ → 新しいデプロイ → 種類「ウェブアプリ」／次のユーザーとして実行「自分」／アクセスできるユーザー「全員」
   初回は doGet を一度「実行」してドライブ・スプレッドシートへのアクセスを許可しておく。 */

const MC_KEY = "nehori-mc-2026";      // MCの合言葉（本部の2名にだけ伝える。変えてよい）
const MONITOR_KEY = "honbu2026";       // 本部の入室状況を見るときの合言葉（変えてよい）
const MAX_PARTICIPANTS = 8;
const MAX_MC = 2;
const ALIVE_SEC = 20;                  // この秒数、定期通信がなければ「通信切れ」とみなす
const FOLDER_NAME = "しおどめねほりんぱほりん 録音";
const TZ = "Asia/Tokyo";
const AVATAR_NAMES = { neko:"ねこ", inu:"いぬ", usagi:"うさぎ", kuma:"くま", panda:"ぱんだ", hiyoko:"ひよこ", kitsune:"きつね", koala:"こあら", fukurou:"ふくろう", pengin:"ぺんぎん" };
const MC_AVATARS = ["fukurou", "pengin"];

function doGet() { return out_({ ok: true, name: "nehori" }); }

function doPost(e) {
  let b = {};
  try { b = JSON.parse((e && e.postData && e.postData.contents) || "{}"); } catch (x) { return out_({ ok: false, message: "bad request" }); }
  const ev = String(b.ev || "").replace(/[^\w-]/g, "").slice(0, 40);
  if (!ev && b.action !== "checkKey") return out_({ ok: false, message: "no event" });
  try {
    switch (b.action) {
      case "peek":    return out_({ ok: true, roster: pub_(live_(ev)), counts: counts_(live_(ev)) });
      case "join":    return out_(join_(ev, b));
      case "beat":    return out_(beat_(ev, b));
      case "leave":   return out_(leave_(ev, b));
      case "mc":      return out_(mc_(ev, b));
      case "upload":  return out_(upload_(ev, b));
      case "monitor": return out_(monitor_(ev, b));
      case "checkKey":return out_({ ok: b.kind === "mc" ? b.key === MC_KEY : b.key === MONITOR_KEY });
    }
  } catch (err) {
    return out_({ ok: false, message: String(err && err.message || err) });
  }
  return out_({ ok: false, message: "unknown action" });
}

/* ---------- 部屋の状態（キャッシュ） ----------
   list_<回>      … 入室中の接続IDの一覧（入室・退室のときだけ書く。ロックあり）
   m_<回>_<ID>    … その人の状態（2.5秒ごとの定期通信で上書き。ALIVE_SEC で自然に消える）
   who_<ID>       … その人が誰か（本部用。6時間保持）
   cmd_<ID>       … MCからの指示（マイクOFFなど） */
function cache_() { return CacheService.getScriptCache(); }
function getList_(ev) { const v = cache_().get("list_" + ev); return v ? JSON.parse(v) : []; }
function putList_(ev, list) { cache_().put("list_" + ev, JSON.stringify(list), 21600); }
function live_(ev) {
  const list = getList_(ev);
  if (!list.length) return [];
  const got = cache_().getAll(list.map(function (sid) { return "m_" + ev + "_" + sid; }));
  const res = [];
  list.forEach(function (sid) { const v = got["m_" + ev + "_" + sid]; if (v) res.push(JSON.parse(v)); });
  return res;
}
function putMember_(ev, m) { cache_().put("m_" + ev + "_" + m.sid, JSON.stringify(m), ALIVE_SEC); }
function pub_(arr) {
  // ほかの参加者に返すのは、アバター・役割・状態だけ（園名・名前は入れない）
  return arr.map(function (m) { return { sid: m.sid, av: m.av, role: m.role, muted: !!m.muted, hand: !!m.hand, react: m.react || "", rt: m.rt || 0 }; });
}
function counts_(arr) {
  let p = 0, mc = 0; arr.forEach(function (m) { if (m.role === "mc") mc++; else p++; });
  return { p: p, mc: mc };
}
// 一覧から、定期通信が途切れた人を外して「通信切れ」を記録する（ロック中に呼ぶ）
function prune_(ev) {
  const list = getList_(ev);
  const alive = live_(ev).map(function (m) { return m.sid; });
  const gone = list.filter(function (sid) { return alive.indexOf(sid) < 0; });
  if (gone.length) {
    gone.forEach(function (sid) {
      const w = cache_().get("who_" + sid);
      if (w) log_(ev, "退室（通信切れ）", JSON.parse(w), sid);
    });
    putList_(ev, alive);
  }
  return alive;
}

function join_(ev, b) {
  const sid = String(b.sid || "");
  const av = String(b.av || "");
  const role = b.role === "mc" ? "mc" : "p";
  if (!sid || !AVATAR_NAMES[av]) return { ok: false, message: "入室の情報が足りません" };
  if (role === "mc") {
    if (b.key !== MC_KEY) return { ok: false, code: "badkey" };
    if (MC_AVATARS.indexOf(av) < 0) return { ok: false, message: "MCのアバターではありません" };
  } else if (MC_AVATARS.indexOf(av) >= 0) {
    return { ok: false, message: "参加者は選べないアバターです" };
  }
  const who = b.who || {};
  const w = {
    role: role, av: av, voice: String(b.voice || ""),
    garden: role === "mc" ? "本部" : String(who.garden || ""),
    loginId: role === "mc" ? "" : String(who.loginId || ""),
    name: String(who.name || "（不明）")
  };
  const lock = LockService.getScriptLock();
  lock.waitLock(8000);
  try {
    prune_(ev);
    let members = live_(ev);
    // 同じ職員が別の画面で入ったままなら、古いほうを外す
    if (role === "p" && w.loginId) {
      members.forEach(function (m) {
        const ow = cache_().get("who_" + m.sid);
        if (!ow) return;
        const o = JSON.parse(ow);
        if (o.role === "p" && o.loginId === w.loginId && o.garden === w.garden) {
          cache_().remove("m_" + ev + "_" + m.sid);
          log_(ev, "退室（入り直し）", o, m.sid);
        }
      });
      members = live_(ev);
    }
    if (members.some(function (m) { return m.av === av; })) return { ok: false, code: "taken" };
    const c = counts_(members);
    if (role === "p" && c.p >= MAX_PARTICIPANTS) return { ok: false, code: "full" };
    if (role === "mc" && c.mc >= MAX_MC) return { ok: false, code: "mcfull" };
    const m = { sid: sid, av: av, role: role, muted: false, hand: false, react: "", rt: 0, t: Date.now() };
    putMember_(ev, m);
    cache_().put("who_" + sid, JSON.stringify(w), 21600);
    const list = members.map(function (x) { return x.sid; }); list.push(sid);
    putList_(ev, list);
    log_(ev, "入室", w, sid);
    return { ok: true, roster: pub_(live_(ev)) };
  } finally {
    lock.releaseLock();
  }
}

function beat_(ev, b) {
  const sid = String(b.sid || "");
  const raw = cache_().get("m_" + ev + "_" + sid);
  if (!raw || getList_(ev).indexOf(sid) < 0) return { ok: true, gone: true };
  const m = JSON.parse(raw);
  m.muted = !!b.muted; m.hand = !!b.hand; m.t = Date.now();
  if (b.react === "clap" || b.react === "nod") { m.react = b.react; m.rt = Date.now(); }
  const cmd = cache_().get("cmd_" + sid) || "";
  if (cmd) {
    cache_().remove("cmd_" + sid);
    if (cmd === "mute") m.muted = true;
    if (cmd === "lowerHand") m.hand = false;
  }
  putMember_(ev, m);
  return { ok: true, roster: pub_(live_(ev)), cmd: cmd };
}

function leave_(ev, b) {
  const sid = String(b.sid || "");
  const lock = LockService.getScriptLock();
  lock.waitLock(8000);
  try {
    cache_().remove("m_" + ev + "_" + sid);
    const list = getList_(ev).filter(function (x) { return x !== sid; });
    putList_(ev, list);
    const w = cache_().get("who_" + sid);
    if (w) log_(ev, "退室", JSON.parse(w), sid);
    return { ok: true };
  } finally {
    lock.releaseLock();
  }
}

function mc_(ev, b) {
  if (b.key !== MC_KEY) return { ok: false, code: "badkey" };
  const me = cache_().get("who_" + String(b.sid || ""));
  if (!me || JSON.parse(me).role !== "mc") return { ok: false, message: "MCではありません" };
  const target = String(b.target || "");
  if (b.cmd !== "mute" && b.cmd !== "lowerHand") return { ok: false, message: "unknown cmd" };
  cache_().put("cmd_" + target, b.cmd, 120);
  return { ok: true };
}

function upload_(ev, b) {
  const sid = String(b.sid || "");
  const wraw = cache_().get("who_" + sid);
  const w = wraw ? JSON.parse(wraw) : { role: "?", av: "?", garden: "", name: "（不明）" };
  const data = String(b.data || "");
  if (!data) return { ok: false, message: "no data" };
  const mime = String(b.mime || "audio/webm").split(";")[0];
  const ext = mime.indexOf("mp4") >= 0 ? "m4a" : mime.indexOf("ogg") >= 0 ? "ogg" : "webm";
  const seq = Number(b.seq || 0);
  const now = new Date();
  const fname = [ev, Utilities.formatDate(now, TZ, "HHmmss"), (w.role === "mc" ? "MC" : "参加者"),
                 AVATAR_NAMES[w.av] || w.av, w.garden || "", w.name || "", ("000" + seq).slice(-3)].join("_") + "." + ext;
  const blob = Utilities.newBlob(Utilities.base64Decode(data), mime, fname);
  const file = eventFolder_(ev).createFile(blob);
  sheet_("録音", ["日時", "回", "役割", "アバター", "園名", "名前", "連番", "ファイル名", "URL", "接続ID"])
    .appendRow([Utilities.formatDate(now, TZ, "yyyy/MM/dd HH:mm:ss"), ev, w.role === "mc" ? "MC" : "参加者",
                AVATAR_NAMES[w.av] || w.av, w.garden || "", w.name || "", seq, fname, file.getUrl(), sid]);
  return { ok: true };
}

function monitor_(ev, b) {
  if (b.key !== MONITOR_KEY) return { ok: false, code: "badkey" };
  const lock = LockService.getScriptLock();
  if (lock.tryLock(3000)) { try { prune_(ev); } finally { lock.releaseLock(); } }
  const members = live_(ev).map(function (m) {
    const w = cache_().get("who_" + m.sid);
    const o = w ? JSON.parse(w) : {};
    return { sid: m.sid, av: m.av, role: m.role, muted: !!m.muted, hand: !!m.hand, garden: o.garden || "", loginId: o.loginId || "", name: o.name || "", voice: o.voice || "" };
  });
  const logs = rows_("入室記録", ev, 300);
  const recs = rows_("録音", ev, 500);
  return { ok: true, members: members, logs: logs, recs: recs, folder: eventFolder_(ev).getUrl() };
}

/* ---------- 記録 ---------- */
function log_(ev, kind, w, sid) {
  sheet_("入室記録", ["日時", "回", "種別", "役割", "アバター", "声", "園名", "ログインID", "名前", "接続ID"])
    .appendRow([Utilities.formatDate(new Date(), TZ, "yyyy/MM/dd HH:mm:ss"), ev, kind, w.role === "mc" ? "MC" : "参加者",
                AVATAR_NAMES[w.av] || w.av, w.voice || "", w.garden || "", w.loginId || "", w.name || "", sid]);
}
function sheet_(name, headers) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.appendRow(headers);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, headers.length).setFontWeight("bold");
  }
  return sh;
}
function rows_(name, ev, max) {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
  if (!sh || sh.getLastRow() < 2) return [];
  const n = sh.getLastRow() - 1;
  const start = Math.max(2, sh.getLastRow() - 2000 + 1);
  const vals = sh.getRange(start, 1, sh.getLastRow() - start + 1, sh.getLastColumn()).getDisplayValues();
  const head = sh.getRange(1, 1, 1, sh.getLastColumn()).getDisplayValues()[0];
  const res = [];
  for (let i = vals.length - 1; i >= 0 && res.length < max; i--) {
    if (vals[i][1] !== ev) continue;
    const o = {}; head.forEach(function (h, j) { o[h] = vals[i][j]; }); res.push(o);
  }
  return res;
}
function eventFolder_(ev) {
  const root = getOrCreateFolder_(DriveApp.getRootFolder(), FOLDER_NAME);
  return getOrCreateFolder_(root, ev);
}
function getOrCreateFolder_(parent, name) {
  const it = parent.getFoldersByName(name);
  return it.hasNext() ? it.next() : parent.createFolder(name);
}
function out_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
