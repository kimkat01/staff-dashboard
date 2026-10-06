// ============================================================
// 【追記用】園長が「職員の残日数一覧」から職員マスタを変更する機能（2026-10-06）
//
// 使い方（既存のコードは消さずに、2か所に追記するだけ）
//  ① doGet の中、「const callback = e.parameter.callback;」の行のすぐ下に、
//     下の【A】の5行を貼り付ける
//  ② ファイルの一番下に、下の【B】をまるごと貼り付ける
//  ③ 保存 → デプロイ → デプロイを管理 → 鉛筆（編集）→ バージョン「新バージョン」→ デプロイ
//     ※「新しいデプロイ」ではなく「デプロイを管理」から更新すること（URLが変わらない）
// ============================================================

// ---------- 【A】doGet の中に貼る ----------
    if (action === 'updateStaff') {
      const result = updateStaffFields(e.parameter.id, e.parameter.garden, e.parameter.editor,
                                       JSON.parse(e.parameter.data || '{}'));
      return response(result, callback);
    }

// ---------- 【B】ファイルの一番下に貼る ----------
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
      const before = rows[r][def.col - 1];
      const b = (before instanceof Date) ? Utilities.formatDate(before, 'Asia/Tokyo', 'yyyy-MM-dd') : String(before);
      const a = (v instanceof Date) ? Utilities.formatDate(v, 'Asia/Tokyo', 'yyyy-MM-dd') : String(v);
      if (b === a) return;                       // 変わっていない項目は書かない
      sheet.getRange(r + 1, def.col).setValue(v);
      logs.push([new Date(), garden, staffId, rows[r][1], def.label, b, a, editor || '園長']);
    });

    // 変更履歴シートに記録（無ければ自動で作る）
    if (logs.length) {
      let logSheet = SS.getSheetByName('変更履歴');
      if (!logSheet) {
        logSheet = SS.insertSheet('変更履歴');
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
