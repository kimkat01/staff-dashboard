/**
 * 給食・駐車場 記録用 GAS Web App（v2：1ヶ月一覧に対応 2026-10-08）
 *
 * 置き場所：スプレッドシート「給食駐車場記録」（cryk0289のマイドライブ）
 *           → 拡張機能 → Apps Script のコードを全部これに置き換える
 * 控え：kimkat01/staff-dashboard リポジトリの gas/kyushoku_chusha_gas.js
 *
 * 使っている画面・ツール
 *   ・職員ダッシュボード（シフト管理）の「きょうの給食／駐車場」ボタン … action=save / today
 *   ・職員ダッシュボード（シフト管理）の「給食・駐車場」タブ（自分の1ヶ月分） … action=history  ← v2で追加
 *   ・園長ダッシュボードの「給食・駐車場」一覧（園の全員の1ヶ月分） … action=list  ← v2で追加
 *   ・rpa_kodomon（コドモン→連絡票の自動転記） … action=summary（今までと同じ形で返す）
 *
 * ---- シート「記録」（1行目は見出し）----
 *   A:日付(YYYY-MM-DD)  B:施設ID(園キー)  C:氏名  D:給食(0/1)  E:駐車場(0/1)  F:更新日時
 *   ・1人1日1行。同じ人・同じ日はその行を上書きする
 *   ・古いデータに同じ人・同じ日の行が複数あっても、集計は「一番下の行（最後に押した状態）」だけを使う
 */

const SHEET_NAME = "記録";
const TZ = "Asia/Tokyo";

function getSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(SHEET_NAME);
    sh.appendRow(["日付", "施設ID", "氏名", "給食", "駐車場", "更新日時"]);
    sh.setFrozenRows(1);
  }
  return sh;
}

/* 日付を必ず "YYYY-MM-DD" の文字列にそろえる（シートが自動で日付型に変えてしまうことがあるため） */
function normDate_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, TZ, "yyyy-MM-dd");
  const s = String(v || "").trim();
  const m = s.match(/^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})/);
  if (!m) return s;
  return m[1] + "-" + ("0" + m[2]).slice(-2) + "-" + ("0" + m[3]).slice(-2);
}

/* 名前の空白（全角・半角）の違いを無視して比べるため */
function normName_(v) {
  return String(v || "").replace(/[\s　]/g, "");
}

function flag_(v) {
  return (v === 1 || v === "1" || v === true || v === "TRUE" || v === "true") ? 1 : 0;
}

/* シート全体を読み、 施設ID|名前|日付 → {meal, park, name, date} にまとめる（下の行が勝つ） */
function readAll_(facility) {
  const sh = getSheet_();
  const data = sh.getDataRange().getValues();
  const map = {};
  for (let i = 1; i < data.length; i++) {
    const fac = String(data[i][1] || "").trim();
    if (facility && fac !== facility) continue;
    const date = normDate_(data[i][0]);
    const name = String(data[i][2] || "").trim();
    if (!date || !name) continue;
    map[fac + "|" + normName_(name) + "|" + date] = {
      date: date, name: name, meal: flag_(data[i][3]), park: flag_(data[i][4])
    };
  }
  return map;
}

function findRow_(sh, date, facility, name) {
  const data = sh.getDataRange().getValues();
  const nn = normName_(name);
  for (let i = data.length - 1; i >= 1; i--) {
    if (normDate_(data[i][0]) === date && String(data[i][1]).trim() === facility && normName_(data[i][2]) === nn) {
      return i + 1;
    }
  }
  return -1;
}

function save_(date, facility, name, meal, park) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sh = getSheet_();
    date = normDate_(date);
    const row = findRow_(sh, date, facility, name);
    const values = [[date, facility, name, meal, park, new Date()]];
    if (row > 0) {
      sh.getRange(row, 1, 1, 6).setValues(values);
    } else {
      sh.appendRow(values[0]);
      // 日付が自動で日付型に変わらないよう、追加した行のA列を文字として入れ直す
      const r = sh.getLastRow();
      sh.getRange(r, 1).setNumberFormat("@").setValue(date);
    }
    return { ok: true };
  } finally {
    lock.releaseLock();
  }
}

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    return jsonOut_(save_(String(body.date || ""), String(body.facility || ""), String(body.name || ""),
      body.meal ? 1 : 0, body.park ? 1 : 0));
  } catch (err) {
    return jsonOut_({ error: String(err) });
  }
}

function doGet(e) {
  const p = e.parameter || {};
  const action = String(p.action || "");
  const facility = String(p.facility || "").trim();

  // ボタンを押したときの保存（職員ダッシュボードは画像リクエストで送ってくる）
  if (action === "save") {
    const date = String(p.date || "");
    const name = String(p.name || "");
    if (!date || !facility || !name) return jsonOut_({ error: "date / facility / name が必要です" });
    return jsonOut_(save_(date, facility, name, flag_(p.meal), flag_(p.park)));
  }

  // その日の自分の状態（ボタンの表示に使う）
  if (action === "today") {
    const date = normDate_(p.date);
    const map = readAll_(facility);
    const r = map[facility + "|" + normName_(p.name) + "|" + date];
    return jsonOut_(r ? { meal: r.meal, park: r.park } : { meal: 0, park: 0 });
  }

  const start = normDate_(p.start);
  const end = normDate_(p.end);
  const inRange = function (d) { return (!start || d >= start) && (!end || d <= end); };

  // 自分の1ヶ月分（職員ダッシュボード）
  // 返り値：{ days: { "2026-10-01": {meal:1, park:0}, ... }, meal: 回数, park: 回数 }
  if (action === "history") {
    const nn = normName_(p.name);
    const map = readAll_(facility);
    const days = {};
    let meal = 0, park = 0;
    Object.keys(map).forEach(function (k) {
      const r = map[k];
      if (normName_(r.name) !== nn || !inRange(r.date)) return;
      days[r.date] = { meal: r.meal, park: r.park };
      meal += r.meal; park += r.park;
    });
    return jsonOut_({ days: days, meal: meal, park: park });
  }

  // 園の全員の1ヶ月分（園長ダッシュボード）
  // 返り値：{ staff: [ { name, meal, park, days: { "2026-10-01": {meal, park} } }, ... ] }
  if (action === "list") {
    if (!facility) return jsonOut_({ error: "facility が必要です" });
    const map = readAll_(facility);
    const people = {};
    Object.keys(map).forEach(function (k) {
      const r = map[k];
      if (!inRange(r.date)) return;
      const key = normName_(r.name);
      if (!people[key]) people[key] = { name: r.name, meal: 0, park: 0, days: {} };
      people[key].days[r.date] = { meal: r.meal, park: r.park };
      people[key].meal += r.meal; people[key].park += r.park;
    });
    const staff = Object.keys(people).map(function (k) { return people[k]; });
    return jsonOut_({ staff: staff });
  }

  // 期間の回数だけ（rpa_kodomon 用・今までと同じ形）
  // 返り値：{ "氏名": {meal: 回数, park: 回数}, ... }
  if (action === "summary") {
    const map = readAll_(facility);
    const summary = {};
    Object.keys(map).forEach(function (k) {
      const r = map[k];
      if (!inRange(r.date)) return;
      if (!summary[r.name]) summary[r.name] = { meal: 0, park: 0 };
      summary[r.name].meal += r.meal;
      summary[r.name].park += r.park;
    });
    return jsonOut_(summary);
  }

  return jsonOut_({ error: "action は save / today / history / list / summary のどれかを指定してください" });
}

function jsonOut_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
