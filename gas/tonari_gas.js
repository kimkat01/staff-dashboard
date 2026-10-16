/**
 * となりの保育室 GAS Web App（各園のインスタ投稿 2026-10-16）
 *
 * 置き場所：スプレッドシート「となりの保育室」（cryk0289のマイドライブに新規作成）
 *           → 拡張機能 → Apps Script のコードを全部これに置き換える
 * 控え：kimkat01/staff-dashboard リポジトリの gas/tonari_gas.js
 *
 * 使っている画面
 *   ・職員ダッシュボード「となりの保育室」
 *       一覧の取得 … GET  ?action=list
 *       投稿できるか … GET  ?action=canPost&garden=園名&loginId=1234
 *       投稿する     … POST {action:'add', garden, loginId, name, url, theme, cat, ages[], note}
 *       取り下げる   … POST {action:'delete', garden, loginId, id}
 *
 * ---- シート「投稿」（1行目は見出し・自動で作られる）----
 *   A:ID  B:登録日時  C:園名  D:ログインID  E:名前  F:URL  G:テーマ  H:カテゴリ  I:年齢  J:ひとこと  K:状態
 *   ・状態が「公開」の行だけが職員ダッシュボードに出る
 *   ・本部が止めたいときは K列を「非公開」に書き換える（行は消さなくてよい）
 *
 * ---- シート「投稿できる人」（1行目は見出し）----
 *   A:園名（ログインマスタと同じ正式名）  B:ログインID(4桁)  C:名前（メモ用）
 *   ・ここに書いた人だけが投稿できる。園長もここに書く
 *   ・やめるときは行を消す
 *
 * はじめての設置：
 *   1) このコードを貼って保存 → 関数「setup」を1回実行（シートが2枚できる）
 *   2) デプロイ → 新しいデプロイ → 種類「ウェブアプリ」
 *        実行ユーザー：自分　／　アクセスできるユーザー：全員
 *   3) 出てきたURL（…/exec）を、職員ダッシュボード index.html の TN_GAS_URL に入れる
 *   ※ コードを直したときは「デプロイを管理」→ 鉛筆 → バージョン「新バージョン」で更新（URLが変わらない）
 */

const POST_SHEET = "投稿";
const ALLOW_SHEET = "投稿できる人";
const TZ = "Asia/Tokyo";
const CATS = ["環境・コーナー", "手作り玩具", "製作", "あそびの様子", "行事"];

function setup() {
  getPostSheet_();
  getAllowSheet_();
}

function getPostSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(POST_SHEET);
  if (!sh) {
    sh = ss.insertSheet(POST_SHEET);
    sh.appendRow(["ID", "登録日時", "園名", "ログインID", "名前", "URL", "テーマ", "カテゴリ", "年齢", "ひとこと", "状態"]);
    sh.setFrozenRows(1);
    sh.getRange("D:D").setNumberFormat("@");
  }
  return sh;
}

function getAllowSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(ALLOW_SHEET);
  if (!sh) {
    sh = ss.insertSheet(ALLOW_SHEET);
    sh.appendRow(["園名", "ログインID", "名前（メモ）"]);
    sh.setFrozenRows(1);
    sh.getRange("B:B").setNumberFormat("@");
  }
  return sh;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/* 園名の空白の違いを無視して比べる */
function normGarden_(v) {
  return String(v || "").replace(/[\s　]/g, "");
}

/* ログインIDは4桁の文字列にそろえる（シートが数値にして先頭の0が消えることがあるため） */
function normId_(v) {
  const s = String(v == null ? "" : v).trim();
  return /^\d+$/.test(s) ? ("0000" + s).slice(-4) : s;
}

function canPost_(garden, loginId) {
  const g = normGarden_(garden), id = normId_(loginId);
  if (!g || !id) return false;
  const data = getAllowSheet_().getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (normGarden_(data[i][0]) === g && normId_(data[i][1]) === id) return true;
  }
  return false;
}

/* インスタ投稿のURLを https://www.instagram.com/p/コード/ の形にそろえる。違う形なら "" */
function normUrl_(v) {
  const m = String(v || "").trim().match(/^https?:\/\/(?:www\.)?instagram\.com\/(?:[A-Za-z0-9_.]+\/)?(p|reel|tv)\/([A-Za-z0-9_-]+)/);
  return m ? ("https://www.instagram.com/" + m[1] + "/" + m[2] + "/") : "";
}

function rowToPost_(r) {
  const at = r[1] instanceof Date ? r[1] : new Date(r[1]);
  const valid = !isNaN(at.getTime());
  return {
    id: String(r[0]),
    at: valid ? Utilities.formatDate(at, TZ, "HH:mm:ss") : "",
    date: valid ? Utilities.formatDate(at, TZ, "yyyy-MM-dd") : "",
    garden: String(r[2] || ""),
    loginId: normId_(r[3]),
    url: String(r[5] || ""),
    theme: String(r[6] || ""),
    cat: String(r[7] || ""),
    ages: String(r[8] || "").split(",").map(function (x) { return parseInt(x, 10); }).filter(function (x) { return !isNaN(x); }),
    note: String(r[9] || ""),
    img: ""
  };
}

function listPosts_() {
  const data = getPostSheet_().getDataRange().getValues();
  const out = [];
  for (let i = 1; i < data.length; i++) {
    if (!data[i][0]) continue;
    if (String(data[i][10] || "").trim() !== "公開") continue;
    out.push(rowToPost_(data[i]));
  }
  out.sort(function (a, b) { const x = a.date + a.at, y = b.date + b.at; return x < y ? 1 : x > y ? -1 : 0; });
  return out;
}

function doGet(e) {
  const p = (e && e.parameter) || {};
  try {
    if (p.action === "canPost") return json_({ ok: true, can: canPost_(p.garden, p.loginId) });
    return json_({ ok: true, posts: listPosts_() });
  } catch (err) {
    return json_({ ok: false, error: "読み込みに失敗しました" });
  }
}

function doPost(e) {
  let body = {};
  try { body = JSON.parse((e && e.postData && e.postData.contents) || "{}"); } catch (err) {
    return json_({ ok: false, error: "送信内容を読み取れませんでした" });
  }
  if (!canPost_(body.garden, body.loginId)) {
    return json_({ ok: false, error: "投稿できるのは、本部に登録された園長・職員だけです" });
  }
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    if (body.action === "add") return json_(add_(body));
    if (body.action === "delete") return json_(remove_(body));
    return json_({ ok: false, error: "不明な操作です" });
  } finally {
    lock.releaseLock();
  }
}

function add_(b) {
  const url = normUrl_(b.url);
  if (!url) return { ok: false, error: "インスタ投稿のURLを確認してください（https://www.instagram.com/p/… の形）" };
  const theme = String(b.theme || "").trim().slice(0, 20);
  if (!theme) return { ok: false, error: "テーマを入力してください" };
  const cat = String(b.cat || "");
  if (CATS.indexOf(cat) < 0) return { ok: false, error: "カテゴリを選んでください" };
  const ages = (Array.isArray(b.ages) ? b.ages : []).map(function (x) { return parseInt(x, 10); })
    .filter(function (x) { return x >= 0 && x <= 5; });
  if (!ages.length) return { ok: false, error: "対象年齢を選んでください" };
  const note = String(b.note || "").trim().slice(0, 100);

  const sh = getPostSheet_();
  const data = sh.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][5]) === url && String(data[i][10]).trim() === "公開") {
      return { ok: false, error: "この投稿はすでにのっています" };
    }
  }
  const now = new Date();
  const id = "ig" + Utilities.formatDate(now, TZ, "yyyyMMddHHmmss") + "-" + Math.random().toString(36).slice(2, 6);
  const row = [id, now, String(b.garden || ""), normId_(b.loginId), String(b.name || ""), url, theme, cat, ages.join(","), note, "公開"];
  sh.appendRow(row);
  return { ok: true, post: rowToPost_(row) };
}

/* 取り下げ：投稿した本人だけができる。行は残して状態を「取り下げ」にする */
function remove_(b) {
  const sh = getPostSheet_();
  const data = sh.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) !== String(b.id || "")) continue;
    if (normGarden_(data[i][2]) !== normGarden_(b.garden) || normId_(data[i][3]) !== normId_(b.loginId)) {
      return { ok: false, error: "取り下げできるのは、投稿した本人だけです" };
    }
    sh.getRange(i + 1, 11).setValue("取り下げ");
    return { ok: true };
  }
  return { ok: false, error: "投稿が見つかりませんでした" };
}
