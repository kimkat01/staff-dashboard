/* ============================================================
   しおどめ 利用状況（アクセスログ）送信スクリプト  2026-10
   ------------------------------------------------------------
   置き場所：kimkat01/staff-dashboard リポジトリの一番上（access-log.js）
   読み込み：<script src="https://kimkat01.github.io/staff-dashboard/access-log.js"></script>
   使い方  ：ShiodomeLog.send({ dash:'職員' or '園長', garden, loginId, name, role, tool })
   ・ツールを開いたときに「誰が・いつ・どのツールを」を GAS「アクセスログ」へ送る
   ・画面の動きを止めないよう、送りっぱなし（結果は待たない）
   ・同じ人が同じツールを続けて開いたときは、短い間は1回だけ記録する
   ・LOG_URL が空のあいだは何もしない
   ============================================================ */
(function () {
  var LOG_URL = '';   // ← GAS「アクセスログ」のウェブアプリ /exec のURL
  var THROTTLE_MS = 60 * 1000;          // 同じツールは1分以内なら1回
  var THROTTLE_HOME_MS = 30 * 60 * 1000; // ホームは30分以内なら1回

  function throttled(key, ms) {
    try {
      var last = +(sessionStorage.getItem(key) || 0);
      if (Date.now() - last < ms) return true;
      sessionStorage.setItem(key, String(Date.now()));
    } catch (e) {}
    return false;
  }

  function send(rec) {
    if (!LOG_URL || !rec || !rec.tool || !rec.loginId || !rec.dash) return;
    var key = 'shiodome_log__' + rec.dash + '|' + rec.loginId + '|' + rec.tool;
    if (throttled(key, rec.tool === 'ホーム' ? THROTTLE_HOME_MS : THROTTLE_MS)) return;
    var body = JSON.stringify({
      action: 'log',
      dash: rec.dash,
      garden: rec.garden || '',
      loginId: String(rec.loginId),
      name: rec.name || '',
      role: rec.role || '',
      tool: rec.tool
    });
    try {
      if (navigator.sendBeacon && navigator.sendBeacon(LOG_URL, new Blob([body], { type: 'text/plain;charset=utf-8' }))) return;
    } catch (e) {}
    try {
      fetch(LOG_URL, { method: 'POST', mode: 'no-cors', keepalive: true, headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: body });
    } catch (e) {}
  }

  window.ShiodomeLog = { send: send, enabled: !!LOG_URL };
})();
