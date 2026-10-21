/* ============================================================
   しおどめ 利用状況（アクセスログ）送信スクリプト  2026-10
   ------------------------------------------------------------
   置き場所：kimkat01/staff-dashboard リポジトリの一番上（access-log.js）
   読み込み：<script src="https://kimkat01.github.io/staff-dashboard/access-log.js"></script>
   使い方  ：ShiodomeLog.send({ dash:'職員' or '園長', garden, loginId, name, role, tool })   … 開いた（閲覧）
             ShiodomeLog.send({ …同上…, act:'投稿' })                                       … 送信・投稿した
             ShiodomeLog.post('園長', '決裁申請', '園名')   … 別ページ（決裁申請など）から投稿を記録する
               （ダッシュボードで最後に記録した人を覚えておき、その人として記録する）
   ・ツールを開いたときに「誰が・いつ・どのツールを」を GAS「アクセスログ」へ送る
   ・画面の動きを止めないよう、送りっぱなし（結果は待たない）
   ・同じ人が同じツールを続けて開いたときは、短い間は1回だけ記録する
   ・LOG_URL が空のあいだは何もしない
   ・メニューの飾り（「NEW」「製作中」）はツール名から外して記録する
     （付けたり外したりしても同じツールが2行に分かれないように）
   ・2026-10-21：「閲覧」と「投稿」を分けて記録（act）。投稿は間引かない（5秒以内の二度押しだけ1回にする）
   ============================================================ */
(function () {
  var LOG_URL = 'https://script.google.com/macros/s/AKfycbxtFnYXdUs1XW5nIEoLmbJXo7HlGe7z4r-Uftuxv-tZq-CNF1vOk3JKzQXOUC7h-cAMSw/exec';   // ← GAS「アクセスログ」のウェブアプリ /exec のURL
  var THROTTLE_MS = 60 * 1000;          // 同じツールは1分以内なら1回
  var THROTTLE_HOME_MS = 30 * 60 * 1000; // ホームは30分以内なら1回
  var THROTTLE_POST_MS = 5 * 1000;        // 投稿は5秒以内の二度押しだけ1回
  var WHO_KEY = 'shiodome_log_who__';     // 最後に記録した人（ダッシュボードごと）
  var WHO_TTL_MS = 12 * 60 * 60 * 1000;   // 12時間覚えておく

  function throttled(key, ms) {
    try {
      var last = +(sessionStorage.getItem(key) || 0);
      if (Date.now() - last < ms) return true;
      sessionStorage.setItem(key, String(Date.now()));
    } catch (e) {}
    return false;
  }

  // ツール名の後ろに付いた飾り（NEW・製作中）を外す
  function cleanTool(t) {
    t = String(t || '').replace(/\s+/g, ' ').trim();
    var prev;
    do {
      prev = t;
      t = t.replace(/\s*(NEW|製作中)$/i, '').trim();
    } while (t !== prev);
    return t;
  }

  function remember(rec) {
    try {
      localStorage.setItem(WHO_KEY + rec.dash, JSON.stringify({
        garden: rec.garden || '', loginId: String(rec.loginId), name: rec.name || '', role: rec.role || '', at: Date.now()
      }));
    } catch (e) {}
  }
  function forget(dash) { try { localStorage.removeItem(WHO_KEY + dash); } catch (e) {} }

  function send(rec) {
    if (rec) rec.tool = cleanTool(rec.tool);
    if (!LOG_URL || !rec || !rec.tool || !rec.loginId || !rec.dash) return;
    var isPost = rec.act === '投稿';
    if (!isPost) remember(rec);
    var key = 'shiodome_log__' + rec.dash + '|' + rec.loginId + '|' + rec.tool + (isPost ? '|投稿' : '');
    if (throttled(key, isPost ? THROTTLE_POST_MS : (rec.tool === 'ホーム' ? THROTTLE_HOME_MS : THROTTLE_MS))) return;
    var body = JSON.stringify({
      action: 'log',
      dash: rec.dash,
      garden: rec.garden || '',
      loginId: String(rec.loginId),
      name: rec.name || '',
      role: rec.role || '',
      tool: rec.tool,
      act: isPost ? '投稿' : '閲覧'
    });
    try {
      if (navigator.sendBeacon && navigator.sendBeacon(LOG_URL, new Blob([body], { type: 'text/plain;charset=utf-8' }))) return;
    } catch (e) {}
    try {
      fetch(LOG_URL, { method: 'POST', mode: 'no-cors', keepalive: true, headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: body });
    } catch (e) {}
  }

  /* 別ページ（決裁申請・採用計画申請書・給食駐車場の一覧・チャットなど）から「投稿」を記録する。
     ダッシュボードで最後に記録した人として送る。garden を渡したときは、その園の人のときだけ送る */
  function post(dash, tool, garden) {
    var w = null;
    try { w = JSON.parse(localStorage.getItem(WHO_KEY + dash) || 'null'); } catch (e) {}
    if (!w || !w.loginId || Date.now() - (w.at || 0) > WHO_TTL_MS) return;
    if (garden && w.garden && garden !== w.garden) return;
    send({ dash: dash, garden: w.garden, loginId: w.loginId, name: w.name, role: w.role, tool: tool, act: '投稿' });
  }

  window.ShiodomeLog = { send: send, post: post, forget: forget, enabled: !!LOG_URL };
})();
