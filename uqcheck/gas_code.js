// ============================================================
// UQ checker - Google Apps Script バックエンド v3（全園共通）
// スプレッドシート：「UQchecker」（cryk0289@gmail.com）
// スプレッドシートID: 197yLc-CxuIAomrtAoTPXY1cROu8hWfsxjCbmi7YGIno
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
      return response({ ok: true, data: getAllStaff() }, callback);
    }
    if (action === 'getStaffById') {
      return response({ ok: true, data: getStaffById(e.parameter.id) }, callback);
    }
    if (action === 'getRequests') {
      return response({ ok: true, data: getAllRequests(e.parameter.staffId) }, callback);
    }
    if (action === 'getPending') {
      return response({ ok: true, data: getPendingRequests() }, callback);
    }
    if (action === 'initSheets') {
      initSheets();
      return response({ ok: true, message: 'シートを初期化しました' }, callback);
    }
    // POSTをGETで受け付ける（ローカルファイル用）
    if (action === 'addRequest') {
      const data = JSON.parse(e.parameter.data);
      const req = addRequest(data);
      sendMailToEncho(req);
      return response({ ok: true, data: req }, callback);
    }
    if (action === 'approveRequest') {
      const req = updateRequestStatus(e.parameter.reqId, '承認済', e.parameter.approver, '');
      if(req) sendMailToStaff(req, '承認');
      return response({ ok: true, data: req }, callback);
    }
    if (action === 'rejectRequest') {
      const req = updateRequestStatus(e.parameter.reqId, '却下', e.parameter.approver, e.parameter.reason || '');
      if(req) sendMailToStaff(req, '却下');
      return response({ ok: true, data: req }, callback);
    }
    // 園長画面「職員の残日数一覧」からの変更（v3）
    if (action === 'updateStaff') {
      const result = updateStaffFields(e.parameter.id, e.parameter.garden, e.parameter.editor,
                                       JSON.parse(e.parameter.data || '{}'));
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
      sendMailToEncho(req);
      return response({ ok: true, data: req });
    }
    if (action === 'approveRequest') {
      const req = updateRequestStatus(body.reqId, '承認済', body.approver, '');
      if(req) sendMailToStaff(req, '承認');
      return response({ ok: true, data: req });
    }
    if (action === 'rejectRequest') {
      const req = updateRequestStatus(body.reqId, '却下', body.approver, body.reason || '');
      if(req) sendMailToStaff(req, '却下');
      return response({ ok: true, data: req });
    }
    if (action === 'updateStaff') {
      return response(updateStaffFields(body.id, body.garden, body.editor, body.data || {}));
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
      '次回付与日','次回付与日数','状態'
    ]);
    staffSheet.getRange(1,1,1,22).setFontWeight('bold').setBackground('#4169e1').setFontColor('#ffffff');
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
        const m = String(v || '').match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
        v = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : '';
      } else {
        v = String(v || '').trim();
      }
      const before = (def.col - 1 < rows[r].length) ? rows[r][def.col - 1] : '';
      const b = (before instanceof Date) ? Utilities.formatDate(before, 'Asia/Tokyo', 'yyyy-MM-dd') : String(before);
      const a = (v instanceof Date) ? Utilities.formatDate(v, 'Asia/Tokyo', 'yyyy-MM-dd') : String(v);
      if (b === a) return;                       // 変わっていない項目は書かない
      sheet.getRange(r + 1, def.col).setValue(v);
      logs.push([new Date(), garden, staffId, rows[r][1], def.label, b, a, editor || '園長']);
    });

    // 変更履歴シートに記録（無ければ自動で作る）
    if (logs.length) {
      let logSheet = SS.getSheetByName(SHEET_EDITLOG);
      if (!logSheet) {
        logSheet = SS.insertSheet(SHEET_EDITLOG);
        logSheet.appendRow(['日時', '園名', '職員ID', '氏名', '項目', '変更前', '変更後', '変更者']);
        logSheet.getRange(1, 1, 1, 8).setFontWeight('bold').setBackground('#4169e1').setFontColor('#ffffff');
      }
      logSheet.getRange(logSheet.getLastRow() + 1, 1, logs.length, 8).setValues(logs);
    }
    return { ok: true, changed: logs.length };
  } finally {
    lock.releaseLock();
  }
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

function addRequest(data) {
  const sheet = SS.getSheetByName(SHEET_REQUESTS);
  const now = new Date();
  const id = 'REQ' + Utilities.formatDate(now, 'Asia/Tokyo', 'yyyyMMddHHmmss');
  const ts = Utilities.formatDate(now, 'Asia/Tokyo', 'yyyy-MM-dd HH:mm');
  const staff = getStaffById(data.staffId);
  const garden = staff ? staff.garden : (data.garden || '');
  sheet.appendRow([id,data.staffId,data.name,garden,data.date,data.type,data.days,
    data.category||'有給',data.memo||'','申請中','','','',ts]);
  return {id,staffId:data.staffId,name:data.name,garden,date:data.date,type:data.type,
    days:data.days,category:data.category||'有給',memo:data.memo||'',
    status:'申請中',approver:'',approvedAt:'',rejectedReason:'',createdAt:ts};
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
      `園長画面から承認・却下をお願いします。\n\n──\nUQ checker`);
  } catch(e) { Logger.log('メール送信エラー: '+e.message); }
}

function sendMailToStaff(req, result) {
  try {
    const staff = getStaffById(req.staffId);
    if (!staff || !isMail(staff.email)) return;
    GmailApp.sendEmail(staff.email,
      `【UQ checker】申請${result}のお知らせ - ${req.date}`,
      `${req.name} さん\n\n${req.date}の有給申請が【${result}】されました。\n\n` +
      `■ 取得希望日：${req.date}\n■ 種別：${req.type}\n■ 承認者：${req.approver}\n` +
      (req.rejectedReason?`■ 却下理由：${req.rejectedReason}\n`:'') +
      `\n──\nUQ checker`);
  } catch(e) { Logger.log('メール送信エラー: '+e.message); }
}
