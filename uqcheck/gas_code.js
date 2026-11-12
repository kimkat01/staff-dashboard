// ============================================================
// UQ checker - Google Apps Script バックエンド v3（全園共通）
// スプレッドシート：「UQchecker」（cryk0289@gmail.com）
// スプレッドシートID: 197yLc-CxuIAomrtAoTPXY1cROu8hWfsxjCbmi7YGIno
//
// 2026-11-12 v3.6
//  ・園長画面から、申請の種別（有給全日／午前半休／午後半休／夏期／時間休）を後から変更できる updateRequestType を追加
//    （例：夏期休暇で申請したものを有給に変える。受付済の申請は職員マスタの取得済み日数も付け替える）
//  ・変更は「変更履歴」シートに記録。他の園の申請は変更できない
//
// 2026-10-26 v3.5（セキュリティ対策・段階1）
//  ・職員一覧（getStaff）は、指定された園の職員だけを返すようにした（今までは全園分）
//    ※画面側も同じ園名で絞り込んでいたので、表示は変わらない。園の指定がないときは空で返す
//  ・画面へ返す職員情報から、メールアドレス・園長メールを外し、基本給・手当・時給は0で返す
//    （画面ではメールは使っていない。給与欄はもともと全員0なので「手当の計算」の表示も変わらない）
//    ※メール送信（受付・相談の通知）はGASの中で職員マスタを直接読むので、これまでどおり届く
//  ・シートの初期化（initSheets）は外から呼べないようにした（必要なときはエディタから実行）
//
// 2026-10-14 v3.4（つくば園：申請ボタン1回で2件・4件登録される不具合の対策）
//  ・同じ職員・同じ日・同じ種類の申請が「申請中」か「受付済」で既にあれば、新しく登録しない（二重登録防止）
//    ※「相談」になった申請は対象外（同じ日でもう一度申請し直せる）
//  ・申請の登録中は他の登録を待たせる（ほぼ同時に届いた同じ申請が両方入らないように）
//  ・申請IDが同じ秒にかぶっても重ならないよう、かぶったときは末尾に -2, -3 … を付ける
//  ・二重だった申請は園長へのメールも送らない
//
// 2026-10-14 v3.3
//  ・表示とメールの言葉を変更：「承認」→「受付」、「却下」→「相談」（年次有給休暇は職員の権利で、許可・却下するものではないため）
//    ※スプレッドシートに保存する値（承認済／却下）は従来のまま。画面側で言い換えて表示する
//
// 2026-10-14 v3.2
//  ・職員マスタ W列「1日の所定時間」を追加（空欄なら8時間）。短時間勤務の職員の時間休を正しく日数に直すため
//  ・園長画面の「職員の編集」から W列も変更できるようにした
//
// 2026-10-06 v3.1
//  ・園長画面「全申請履歴」から申請の取得日を変更できる updateRequestDate を追加
//  ・日付の形が正しくないときは、元の日付を消さずにそのまま残す
//  ・空欄と0は同じとみなし、「変更履歴」に余計な記録を残さない
//
// 2026-10-06 v3
//  ・園長画面「職員の残日数一覧」から職員マスタを変更できる updateStaff を追加
//    （変更内容は「変更履歴」シートに自動記録。他園の職員は変更不可）
//  ・職員マスタの T列「次回付与日」・U列「次回付与日数」・V列「状態」を読み込む
//  ・時間休の承認時は「時間休取得済」と「取得済み（年休）」の両方に加算（時間休は年休の一部）
//  ・同じ申請を二重に承認しても、日数が二重に引かれないようにした
//  ・取得済みの丸めを小数1桁→3桁に変更（0.125日＝1時間が0.1にならないように）
// ============================================================

const SS_ID = '197yLc-CxuIAomrtAoTPXY1cROu8hWfsxjCbmi7YGIno';
const SS = SpreadsheetApp.openById(SS_ID);

const SHEET_STAFF    = '職員マスタ';
const SHEET_REQUESTS = '申請ログ';
const SHEET_EDITLOG  = '変更履歴';

// ============================================================
// レスポンス（JSONP対応でCORS回避）
// ============================================================
function response(data, callback) {
  const json = JSON.stringify(data);
  if (callback) {
    // JSONPモード
    return ContentService
      .createTextOutput(callback + '(' + json + ')')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService
    .createTextOutput(json)
    .setMimeType(ContentService.MimeType.JSON);
}

// ============================================================
// GETリクエスト（JSONPでCORS回避）
// ============================================================
function doGet(e) {
  try {
    const action   = e.parameter.action;
    const callback = e.parameter.callback; // JSONPコールバック

    if (action === 'getStaff') {
      return response({ ok: true, data: getStaffForGarden_(e.parameter.garden) }, callback);
    }
    if (action === 'getStaffById') {
      return response({ ok: true, data: publicStaff_(getStaffById(e.parameter.id)) }, callback);
    }
    if (action === 'getRequests') {
      return response({ ok: true, data: getAllRequests(e.parameter.staffId) }, callback);
    }
    if (action === 'getPending') {
      return response({ ok: true, data: getPendingRequests() }, callback);
    }
    // initSheets（シート初期化）は外から呼べないようにした（v3.5）。必要なときはエディタで直接実行する
    // POSTをGETで受け付ける（ローカルファイル用）
    if (action === 'addRequest') {
      const data = JSON.parse(e.parameter.data);
      const req = addRequest(data);
      if (req.duplicate) return response({ ok: true, duplicate: true, data: req }, callback);
      sendMailToEncho(req);
      return response({ ok: true, data: req }, callback);
    }
    if (action === 'approveRequest') {
      const req = updateRequestStatus(e.parameter.reqId, '承認済', e.parameter.approver, '');
      if(req) sendMailToStaff(req, '受付');
      return response({ ok: true, data: req }, callback);
    }
    if (action === 'rejectRequest') {
      const req = updateRequestStatus(e.parameter.reqId, '却下', e.parameter.approver, e.parameter.reason || '');
      if(req) sendMailToStaff(req, '相談');
      return response({ ok: true, data: req }, callback);
    }
    // 園長画面「職員の残日数一覧」からの変更（v3）
    if (action === 'updateStaff') {
      const result = updateStaffFields(e.parameter.id, e.parameter.garden, e.parameter.editor,
                                       JSON.parse(e.parameter.data || '{}'));
      return response(result, callback);
    }
    // 園長画面「全申請履歴」からの取得日変更（v3.1）
    if (action === 'updateRequestDate') {
      const result = updateRequestDate(e.parameter.reqId, e.parameter.garden, e.parameter.editor, e.parameter.date);
      return response(result, callback);
    }
    // 園長画面からの申請の種別変更（v3.6）
    if (action === 'updateRequestType') {
      const result = updateRequestType(e.parameter.reqId, e.parameter.garden, e.parameter.editor,
                                       e.parameter.category, e.parameter.type, e.parameter.days);
      return response(result, callback);
    }

    return response({ ok: false, error: 'Unknown action' }, callback);
  } catch(err) {
    return response({ ok: false, error: err.message }, (e.parameter||{}).callback);
  }
}

// POSTも念のため残す
function doPost(e) {
  try {
    const body   = JSON.parse(e.postData.contents);
    const action = body.action;
    if (action === 'addRequest') {
      const req = addRequest(body.data);
      if (req.duplicate) return response({ ok: true, duplicate: true, data: req });
      sendMailToEncho(req);
      return response({ ok: true, data: req });
    }
    if (action === 'approveRequest') {
      const req = updateRequestStatus(body.reqId, '承認済', body.approver, '');
      if(req) sendMailToStaff(req, '受付');
      return response({ ok: true, data: req });
    }
    if (action === 'rejectRequest') {
      const req = updateRequestStatus(body.reqId, '却下', body.approver, body.reason || '');
      if(req) sendMailToStaff(req, '相談');
      return response({ ok: true, data: req });
    }
    if (action === 'updateStaff') {
      return response(updateStaffFields(body.id, body.garden, body.editor, body.data || {}));
    }
    if (action === 'updateRequestDate') {
      return response(updateRequestDate(body.reqId, body.garden, body.editor, body.date));
    }
    if (action === 'updateRequestType') {
      return response(updateRequestType(body.reqId, body.garden, body.editor, body.category, body.type, body.days));
    }
    return response({ ok: false, error: 'Unknown action' });
  } catch(err) {
    return response({ ok: false, error: err.message });
  }
}

// ============================================================
// シート初期化（シートが無いときだけ作る。既存データには触らない）
// ============================================================
function initSheets() {
  let staffSheet = SS.getSheetByName(SHEET_STAFF);
  if (!staffSheet) staffSheet = SS.insertSheet(SHEET_STAFF);
  if (staffSheet.getLastRow() === 0) {
    staffSheet.appendRow([
      '職員ID','氏名','雇用形態','採用日',
      '今年度付与','繰越','取得済み',
      '夏季付与','夏季取得済',
      '時間休付与','時間休取得済',
      '基本給','手当','月平均所定時間','時給',
      'メールアドレス','園名','園長メール','基準日',
      '次回付与日','次回付与日数','状態','1日の所定時間'
    ]);
    staffSheet.getRange(1,1,1,23).setFontWeight('bold').setBackground('#4169e1').setFontColor('#ffffff');
  }
  let reqSheet = SS.getSheetByName(SHEET_REQUESTS);
  if (!reqSheet) reqSheet = SS.insertSheet(SHEET_REQUESTS);
  if (reqSheet.getLastRow() === 0) {
    reqSheet.appendRow([
      '申請ID','職員ID','氏名','園名',
      '取得希望日','種別','消化数','カテゴリ','メモ',
      'ステータス','承認者','承認日時','却下理由','申請日時'
    ]);
    reqSheet.getRange(1,1,1,14).setFontWeight('bold').setBackground('#4169e1').setFontColor('#ffffff');
  }
}

// ============================================================
// 職員マスタ
// ============================================================
function getAllStaff() {
  const sheet = SS.getSheetByName(SHEET_STAFF);
  if (!sheet) return [];
  const rows = sheet.getDataRange().getValues();
  if (rows.length <= 1) return [];
  return rows.slice(1).filter(row => row[0] !== '').map(row => rowToStaff(row));
}

function getStaffById(id) {
  return getAllStaff().find(s => s.id === id) || null;
}

// ------------------------------------------------------------
// 画面へ返す用（v3.5）
//  ・その園の職員だけ
//  ・メールアドレス・園長メールは返さない。基本給・手当・時給は0で返す
//  ※GAS内部のメール送信は getStaffById / getAllStaff をそのまま使うので影響しない
// ------------------------------------------------------------
function getStaffForGarden_(garden) {
  const g = String(garden || '').trim();
  if (!g) return [];
  return getAllStaff()
    .filter(s => String(s.garden || '').trim() === g)
    .map(publicStaff_);
}

function publicStaff_(s) {
  if (!s) return null;
  const o = Object.assign({}, s);
  o.email = '';
  o.enchoEmail = '';
  o.basicPay = 0;
  o.allowance = 0;
  o.hourlyWage = 0;
  return o;
}

function rowToStaff(row) {
  return {
    id: row[0], name: row[1], type: row[2],
    hire: formatDate(row[3]),
    grant: Number(row[4])||0, carry: Number(row[5])||0, used: Number(row[6])||0,
    summerTotal: Number(row[7])||0, summerUsed: Number(row[8])||0,
    // 時間休付与：空欄なら5日、0と入っていれば0日
    hourLeaveGrant: (row[9] === '' || row[9] === null) ? 5 : (Number(row[9])||0),
    hourLeaveUsed: Number(row[10])||0,
    basicPay: Number(row[11])||0, allowance: Number(row[12])||0,
    avgMonthlyHours: Number(row[13])||160, hourlyWage: Number(row[14])||0,
    email: row[15]||'', garden: row[16]||'', enchoEmail: row[17]||'',
    grantDate: formatDate(row[18]),
    nextGrantDate: formatDate(row[19]),
    nextGrant: Number(row[20])||0,
    status: row[21] ? String(row[21]) : '',
    // 1日の所定時間（W列）：空欄・0なら8時間
    dailyHours: (Number(row[22]) > 0) ? Number(row[22]) : 8,
  };
}

function formatDate(val) {
  if (!val) return '';
  if (val instanceof Date) return Utilities.formatDate(val, 'Asia/Tokyo', 'yyyy-MM-dd');
  return String(val);
}

// ------------------------------------------------------------
// 園長画面からの職員マスタ変更（v3）
// ------------------------------------------------------------
// 変更できる項目と、職員マスタの列番号（A=1）
const STAFF_EDIT_COLS = {
  type:           { col: 3,  label: '雇用形態',     kind: 'text' },
  grant:          { col: 5,  label: '今年度付与',   kind: 'num'  },
  carry:          { col: 6,  label: '繰越',         kind: 'num'  },
  used:           { col: 7,  label: '取得済み',     kind: 'num'  },
  summerTotal:    { col: 8,  label: '夏季付与',     kind: 'num'  },
  summerUsed:     { col: 9,  label: '夏季取得済',   kind: 'num'  },
  hourLeaveGrant: { col: 10, label: '時間休付与',   kind: 'num'  },
  hourLeaveUsed:  { col: 11, label: '時間休取得済', kind: 'num'  },
  grantDate:      { col: 19, label: '基準日',       kind: 'date' },
  nextGrantDate:  { col: 20, label: '次回付与日',   kind: 'date' },
  nextGrant:      { col: 21, label: '次回付与日数', kind: 'num'  },
  status:         { col: 22, label: '状態',         kind: 'text' },
  dailyHours:     { col: 23, label: '1日の所定時間', kind: 'num'  },
};

function updateStaffFields(staffId, garden, editor, data) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sheet = SS.getSheetByName(SHEET_STAFF);
    const rows = sheet.getDataRange().getValues();
    let r = -1;
    for (let i = 1; i < rows.length; i++) {
      if (String(rows[i][0]) === String(staffId)) { r = i; break; }
    }
    if (r < 0) return { ok: false, error: '職員が見つかりません：' + staffId };
    // 他の園の職員は変更できない（園名＝Q列で確認）
    if (String(rows[r][16]) !== String(garden || '')) {
      return { ok: false, error: 'この園の職員ではないため変更できません' };
    }

    const logs = [];
    Object.keys(STAFF_EDIT_COLS).forEach(key => {
      if (!(key in data)) return;
      const def = STAFF_EDIT_COLS[key];
      let v = data[key];
      if (def.kind === 'num') {
        v = Number(v);
        if (isNaN(v) || v < 0) return;
      } else if (def.kind === 'date') {
        const t = String(v || '').trim();
        if (t === '') {
          v = '';                                  // 空欄にしたいとき
        } else {
          const m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
          if (!m) return;                          // 形が正しくない日付は書かない（元の日付を残す）
          v = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
        }
      } else {
        v = String(v || '').trim();
      }
      const before = (def.col - 1 < rows[r].length) ? rows[r][def.col - 1] : '';
      const b = (before instanceof Date) ? Utilities.formatDate(before, 'Asia/Tokyo', 'yyyy-MM-dd') : String(before);
      const a = (v instanceof Date) ? Utilities.formatDate(v, 'Asia/Tokyo', 'yyyy-MM-dd') : String(v);
      if (b === a) return;                       // 変わっていない項目は書かない
      if (def.kind === 'num' && (Number(before) || 0) === v) return;   // 空欄と0は同じとみなす
      sheet.getRange(r + 1, def.col).setValue(v);
      logs.push([new Date(), garden, staffId, rows[r][1], def.label, b, a, editor || '園長']);
    });

    writeEditLog(logs);
    return { ok: true, changed: logs.length };
  } finally {
    lock.releaseLock();
  }
}

// ------------------------------------------------------------
// 園長画面からの申請の取得日変更（v3.1）
// ------------------------------------------------------------
function updateRequestDate(reqId, garden, editor, date) {
  const m = String(date || '').trim().match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (!m) return { ok: false, error: '日付の形が正しくありません' };
  const newDate = m[1] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[3]).slice(-2);
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sheet = SS.getSheetByName(SHEET_REQUESTS);
    const rows = sheet.getDataRange().getValues();
    for (let i = 1; i < rows.length; i++) {
      if (String(rows[i][0]) !== String(reqId)) continue;
      // 他の園の申請は変更できない（申請ログのD列＝園名で確認）
      if (String(rows[i][3]) !== String(garden || '')) {
        return { ok: false, error: 'この園の申請ではないため変更できません' };
      }
      const before = formatDate(rows[i][4]);
      if (before === newDate) return { ok: true, changed: 0 };
      const cell = sheet.getRange(i + 1, 5);
      cell.setNumberFormat('@');                 // 文字の日付として保存（形がくずれないように）
      cell.setValue(newDate);
      writeEditLog([[new Date(), garden, rows[i][1], rows[i][2],
                     '申請の取得日（' + reqId + '）', before, newDate, editor || '園長']]);
      return { ok: true, changed: 1, data: rowToRequest(sheet.getRange(i + 1, 1, 1, 14).getValues()[0]) };
    }
    return { ok: false, error: '申請が見つかりません：' + reqId };
  } finally {
    lock.releaseLock();
  }
}

// ------------------------------------------------------------
// 園長画面からの申請の種別変更（v3.6）
//  ・例：夏期休暇 → 有給（全日）、有給（全日）→ 有給（午前半休）、有給 → 時間休 など
//  ・申請ログの F列（種別）・G列（消化数）・H列（カテゴリ）を書き換える
//  ・受付済（承認済）の申請は、職員マスタの取得済み日数も付け替える
//    （元の種類の取得済みを減らし、新しい種類の取得済みを増やす）
//  ・申請中の申請は申請ログだけを書き換える（受付したときに新しい種類で引かれる）
//  ・変更は「変更履歴」シートに記録。他の園の申請は変更できない
// ------------------------------------------------------------
function updateRequestType(reqId, garden, editor, category, type, days) {
  const cat = String(category || '');
  if (['有給', '夏期', '時間単位'].indexOf(cat) < 0) return { ok: false, error: '種別が正しくありません' };
  const newType = String(type || '').trim();
  if (!newType) return { ok: false, error: '種別が正しくありません' };
  const newDays = parseFloat(Number(days).toFixed(3));
  if (!(newDays > 0) || newDays > 1) return { ok: false, error: '日数が正しくありません' };

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sheet = SS.getSheetByName(SHEET_REQUESTS);
    const rows = sheet.getDataRange().getValues();
    for (let i = 1; i < rows.length; i++) {
      if (String(rows[i][0]) !== String(reqId)) continue;
      // 他の園の申請は変更できない（申請ログのD列＝園名で確認）
      if (String(rows[i][3]) !== String(garden || '')) {
        return { ok: false, error: 'この園の申請ではないため変更できません' };
      }
      const status = String(rows[i][9] || '');
      if (status !== '承認済' && status !== '申請中') {
        return { ok: false, error: '受付済・申請中の申請だけ種別を変更できます（現在：' + status + '）' };
      }
      const oldCat  = String(rows[i][7] || '有給');
      const oldType = String(rows[i][5] || '');
      const oldDays = Number(rows[i][6]) || 0;
      if (oldCat === cat && oldType === newType && Math.abs(oldDays - newDays) < 0.0005) {
        return { ok: true, changed: 0 };
      }
      // 受付済なら、職員マスタの取得済み日数を付け替える（元を戻してから新しい種類で引く）
      if (status === '承認済') {
        updateStaffUsed(rows[i][1], -oldDays, oldCat);
        updateStaffUsed(rows[i][1], newDays, cat);
      }
      sheet.getRange(i + 1, 6, 1, 3).setValues([[newType, newDays, cat]]);   // F列 種別・G列 消化数・H列 カテゴリ
      const name = (c) => c === '夏期' ? '夏季休暇' : c === '時間単位' ? '時間休' : '有給';
      writeEditLog([[new Date(), garden, rows[i][1], rows[i][2],
                     '申請の種別（' + reqId + '）',
                     name(oldCat) + '・' + oldType + '・' + oldDays + '日',
                     name(cat) + '・' + newType + '・' + newDays + '日',
                     editor || '園長']]);
      return { ok: true, changed: 1, data: rowToRequest(sheet.getRange(i + 1, 1, 1, 14).getValues()[0]) };
    }
    return { ok: false, error: '申請が見つかりません：' + reqId };
  } finally {
    lock.releaseLock();
  }
}

// 変更履歴シートに記録（無ければ自動で作る）
function writeEditLog(logs) {
  if (!logs || !logs.length) return;
  let logSheet = SS.getSheetByName(SHEET_EDITLOG);
  if (!logSheet) {
    logSheet = SS.insertSheet(SHEET_EDITLOG);
    logSheet.appendRow(['日時', '園名', '職員ID', '氏名', '項目', '変更前', '変更後', '変更者']);
    logSheet.getRange(1, 1, 1, 8).setFontWeight('bold').setBackground('#4169e1').setFontColor('#ffffff');
  }
  logSheet.getRange(logSheet.getLastRow() + 1, 1, logs.length, 8).setValues(logs);
}

// ============================================================
// 申請ログ
// ============================================================
function getAllRequests(staffId) {
  const sheet = SS.getSheetByName(SHEET_REQUESTS);
  if (!sheet) return [];
  const rows = sheet.getDataRange().getValues();
  if (rows.length <= 1) return [];
  let reqs = rows.slice(1).filter(row => row[0] !== '').map(row => rowToRequest(row));
  if (staffId) reqs = reqs.filter(r => r.staffId === staffId);
  return reqs.reverse();
}

function getPendingRequests() {
  return getAllRequests().filter(r => r.status === '申請中');
}

function rowToRequest(row) {
  return {
    id: row[0], staffId: row[1], name: row[2], garden: row[3],
    date: formatDate(row[4]), type: row[5],
    days: Number(row[6])||0, category: row[7], memo: row[8],
    status: row[9], approver: row[10],
    approvedAt: row[11] ? Utilities.formatDate(new Date(row[11]),'Asia/Tokyo','yyyy-MM-dd HH:mm') : '',
    rejectedReason: row[12]||'',
    createdAt: row[13] ? Utilities.formatDate(new Date(row[13]),'Asia/Tokyo','yyyy-MM-dd HH:mm') : '',
  };
}

// v3.4：二重登録を防ぐ
//  ・登録中は LockService で他の登録を待たせる（ほぼ同時に届いた同じ申請が両方入らないように）
//  ・同じ職員・同じ日・同じカテゴリ・同じ種別の申請が「申請中」か「承認済（受付済）」で既にあれば、
//    新しく登録せずに既存の申請を返す（duplicate: true）。「却下（相談）」は対象外
//  ・申請IDが同じ秒にかぶったら末尾に -2, -3 … を付けて重ならないようにする
function addRequest(data) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const sheet = SS.getSheetByName(SHEET_REQUESTS);
    const rows = sheet.getDataRange().getValues();
    const category = data.category || '有給';

    for (let i = 1; i < rows.length; i++) {
      const r = rows[i];
      if (r[0] === '') continue;
      if (String(r[1]) !== String(data.staffId)) continue;
      if (formatDate(r[4]) !== String(data.date)) continue;
      if (String(r[7] || '有給') !== String(category)) continue;
      if (String(r[5]) !== String(data.type)) continue;
      if (r[9] === '申請中' || r[9] === '承認済') {
        const dup = rowToRequest(r);
        dup.duplicate = true;
        return dup;
      }
    }

    const now = new Date();
    const base = 'REQ' + Utilities.formatDate(now, 'Asia/Tokyo', 'yyyyMMddHHmmss');
    const ids = {};
    for (let i = 1; i < rows.length; i++) ids[String(rows[i][0])] = true;
    let id = base, n = 2;
    while (ids[id]) { id = base + '-' + n; n++; }

    const ts = Utilities.formatDate(now, 'Asia/Tokyo', 'yyyy-MM-dd HH:mm');
    const staff = getStaffById(data.staffId);
    const garden = staff ? staff.garden : (data.garden || '');
    sheet.appendRow([id,data.staffId,data.name,garden,data.date,data.type,data.days,
      category,data.memo||'','申請中','','','',ts]);
    SpreadsheetApp.flush();   // 次の登録が来る前に確実に書き込む
    return {id,staffId:data.staffId,name:data.name,garden,date:data.date,type:data.type,
      days:data.days,category:category,memo:data.memo||'',
      status:'申請中',approver:'',approvedAt:'',rejectedReason:'',createdAt:ts};
  } finally {
    lock.releaseLock();
  }
}

function updateRequestStatus(reqId, status, approver, reason) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sheet = SS.getSheetByName(SHEET_REQUESTS);
    const rows = sheet.getDataRange().getValues();
    const now = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm');
    for (let i = 1; i < rows.length; i++) {
      if (rows[i][0] === reqId) {
        const prevStatus = rows[i][9];
        sheet.getRange(i+1,10).setValue(status);
        sheet.getRange(i+1,11).setValue(approver);
        sheet.getRange(i+1,12).setValue(now);
        sheet.getRange(i+1,13).setValue(reason);
        // すでに承認済みの申請をもう一度承認しても、日数は二重に引かない
        if (status === '承認済' && prevStatus !== '承認済') {
          updateStaffUsed(rows[i][1], Number(rows[i][6]), rows[i][7]);
        }
        return rowToRequest(sheet.getRange(i+1,1,1,14).getValues()[0]);
      }
    }
    return null;
  } finally {
    lock.releaseLock();
  }
}

function updateStaffUsed(staffId, days, category) {
  const sheet = SS.getSheetByName(SHEET_STAFF);
  const rows = sheet.getDataRange().getValues();
  const add = (v) => parseFloat(((Number(v)||0) + days).toFixed(3));
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0] === staffId) {
      if (category === '夏期') {
        sheet.getRange(i+1,9).setValue(add(rows[i][8]));        // I列 夏季取得済
      } else if (category === '時間単位') {
        sheet.getRange(i+1,11).setValue(add(rows[i][10]));      // K列 時間休取得済
        sheet.getRange(i+1,7).setValue(add(rows[i][6]));        // G列 取得済み（時間休は年休の一部）
      } else {
        sheet.getRange(i+1,7).setValue(add(rows[i][6]));        // G列 取得済み
      }
      break;
    }
  }
}

// ============================================================
// メール通知（メールアドレスが入っていない職員・園長には送らない）
// ============================================================
function isMail(v) { return String(v || '').indexOf('@') > 0; }

function sendMailToEncho(req) {
  try {
    const staff = getStaffById(req.staffId);
    if (!staff || !isMail(staff.enchoEmail)) return;
    const cat = req.category==='夏期'?'夏季休暇':req.category==='時間単位'?'時間単位有給':'年次有給休暇';
    GmailApp.sendEmail(staff.enchoEmail,
      `【UQ checker】有給申請 - ${req.name} (${req.date})`,
      `${staff.garden} 園長 様\n\n${req.name}さんから${cat}の申請が届きました。\n\n` +
      `■ 取得希望日：${req.date}\n■ 種別：${req.type}（${req.days}日/時間）\n` +
      `■ メモ：${req.memo||'なし'}\n■ 申請日時：${req.createdAt}\n\n` +
      `園長画面から受付をお願いします（別の日をお願いしたい場合は「相談」を使ってください）。\n\n──\nUQ checker`);
  } catch(e) { Logger.log('メール送信エラー: '+e.message); }
}

function sendMailToStaff(req, result) {
  try {
    const staff = getStaffById(req.staffId);
    if (!staff || !isMail(staff.email)) return;
    GmailApp.sendEmail(staff.email,
      result==='相談' ? `【UQ checker】園長から相談があります - ${req.date}` : `【UQ checker】申請受付のお知らせ - ${req.date}`,
      (result==='相談'
        ? `${req.name} さん\n\n${req.date}の有給申請について、園長から相談があります。\n園長と話して、必要なら別の日で申請し直してください。\n\n`
        : `${req.name} さん\n\n${req.date}の有給申請を受け付けました。\n\n`) +
      `■ 取得希望日：${req.date}\n■ 種別：${req.type}\n■ 受付者：${req.approver}\n` +
      (req.rejectedReason?`■ 相談内容：${req.rejectedReason}\n`:'') +
      `\n──\nUQ checker`);
  } catch(e) { Logger.log('メール送信エラー: '+e.message); }
}
