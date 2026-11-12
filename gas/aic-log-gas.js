/**
 * GAS「AIカウンセリング記録」（2026-11-12）
 * ------------------------------------------------------------
 * ANSHIN KUN（職員ダッシュボード）の「AIメンタルカウンセリング」の会話を、
 * スプレッドシート「AIカウンセリング記録」（cryk0289）のシート「記録」に1往復ずつ残す。
 *
 * 送ってくる側：
 *   ・kimkat01/staff-dashboard/index.html              の AIC_LOG_URL
 *   ・kimkat01/fureai-moriya-staff-dashboard/index.html の AIC_LOG_URL
 *
 * 列：日時 / 園 / 氏名 / ログインID / 会話ID / 相談内容 / AIの返答 / 注意
 *
 * 設置：スプレッドシート「AIカウンセリング記録」→ 拡張機能 → Apps Script に、このコードを全部貼る
 *       → デプロイ → 新しいデプロイ → 種類「ウェブアプリ」
 *          次のユーザーとして実行：自分（cryk0289@gmail.com）
 *          アクセスできるユーザー：全員
 *       → 出てきた「ウェブアプリのURL」（…/exec）を AIC_LOG_URL に貼る
 */

var SHEET_ID   = '10HjJ6hR9kzfbvuqsMGvtoxPEy9Cw4tcH4qO9INNBZeU';  // スプレッドシート「AIカウンセリング記録」
var SHEET_NAME = '記録';
var HEADERS    = ['日時', '園', '氏名', 'ログインID', '会話ID', '相談内容', 'AIの返答', '注意'];
var MAX_LEN    = 45000;  // セル1つに入る文字数の上限（50,000）より少し手前で切る

function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
    var d = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    var sh = getSheet_();
    sh.appendRow([
      cut_(d.datetime) || Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy/MM/dd HH:mm:ss'),
      cut_(d.garden),
      cut_(d.name),
      cut_(d.loginId),
      cut_(d.convId),
      cut_(d.question),
      cut_(d.answer),
      cut_(d.alert)
    ]);
    // 「要注意」の行は赤くして目立たせる
    if (d.alert) {
      sh.getRange(sh.getLastRow(), 1, 1, HEADERS.length).setBackground('#fde2e2');
    }
    return json_({ ok: true });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  } finally {
    try { lock.releaseLock(); } catch (e2) {}
  }
}

// ブラウザでURLを開いたときの動作確認用（記録の中身は返さない）
function doGet() {
  return json_({ ok: true, app: 'AIカウンセリング記録' });
}

function getSheet_() {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sh = ss.getSheetByName(SHEET_NAME) || ss.insertSheet(SHEET_NAME);
  if (sh.getLastRow() === 0) {
    sh.appendRow(HEADERS);
    sh.setFrozenRows(1);
  }
  return sh;
}

function cut_(v) {
  if (v === null || v === undefined) return '';
  var s = String(v);
  // 先頭が = + - @ だとスプレッドシートが数式として読むので、' を付けて文字のまま入れる
  if (/^[=+\-@]/.test(s)) s = "'" + s;
  return s.length > MAX_LEN ? s.slice(0, MAX_LEN) + '…（以下省略）' : s;
}

function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

// 設置後、エディタでこの関数を選んで「実行」すると、権限の許可が出る＆テスト行が1行入る（確認したら行を消してOK）
function testLog() {
  var res = doPost({ postData: { contents: JSON.stringify({
    garden: 'テスト園', name: 'テスト', loginId: '0000', convId: 'test',
    question: '（設置テスト）', answer: '（設置テスト）', alert: ''
  }) } });
  Logger.log(res.getContent());
}
