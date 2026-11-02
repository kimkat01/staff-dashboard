/* ============================================================
   しおどめ 通知・アイコンの未読数（全ツール共通）  2026-11-01 新規
   置き場所：kimkat01/staff-dashboard リポジトリの一番上（push-client.js）
   読み込み：<script src="https://kimkat01.github.io/staff-dashboard/push-client.js"></script>
   使うページ：ANSHIN KUN（staff-dashboard／fureai-moriya-staff-dashboard）、しおどめポータルサイト（shiodome-knowledge）

   できること
     ・ホーム画面に追加したアイコンに、未読の件数（赤い数字）を出す
     ・新しいお知らせ等が入ったら通知を出す（通知管理GASが5分おきに確認して送る）
     ・ポータルサイトでは左メニューに「お知らせ」ボタン（ANSHIN KUNと同じお知らせを読める）を出す

   対象の園は PUSH_GARDENS だけ（試行中）。広げるときは、ここと通知管理GASの CONFIG.GARDENS に園コードを足し、
   その園の manifest（各リポジトリの manifests/園キー.json）を作る。
   ============================================================ */
(function () {
  var PUSH_GARDENS = ['S07'];   // S07 = しおどめ保育園越谷（試行）
  var NOTIFY_GAS_URL = '';      // ← 通知管理GASの /exec のURL
  var VAPID_PUBLIC = '';        // ← Workerの /setup で作った「公開鍵」（VAPID_PUBLIC と同じもの）
  var NEWS_GAS_URL = 'https://script.google.com/macros/s/AKfycbwvO_eVBaPA31-c93roVoHk8rsyrcQJvAMvGYiyxjvmYBB6niL7dQUDjQG5yjFNpU5d/exec';
  var NEWS_READ_KEY = 'shiodome_news_read';   // ANSHIN KUN のお知らせ既読（端末内）と同じキー

  var cfg = null, badgeTimer = null;

  function enabledFor(garden) { return !!(garden && garden.code && PUSH_GARDENS.indexOf(garden.code) >= 0); }
  function isStandalone() {
    try { return window.navigator.standalone === true || window.matchMedia('(display-mode: standalone)').matches; } catch (e) { return false; }
  }
  function isIOS() { return /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1); }
  function pushSupported() { return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window; }
  function ready() { return !!(NOTIFY_GAS_URL && VAPID_PUBLIC); }
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function user() { var u = (cfg.user && cfg.user()) || {}; return { loginId: String(u.loginId || ''), name: String(u.name || '') }; }
  function b64ToU8(s) {
    s = s.replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '=';
    var bin = atob(s), out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  function newsReadIds() { try { return JSON.parse(lsGet(NEWS_READ_KEY) || '[]') || []; } catch (e) { return []; } }

  function post(body) {
    return fetch(NOTIFY_GAS_URL, { method: 'POST', body: JSON.stringify(body), redirect: 'follow', keepalive: true })
      .then(function (r) { return r.json(); });
  }

  /* ---------- アイコンの数字 ---------- */
  function setBadge(n) {
    n = Number(n) || 0;
    try {
      if (n > 0 && navigator.setAppBadge) navigator.setAppBadge(n).catch(function () {});
      else if (navigator.clearAppBadge) navigator.clearAppBadge().catch(function () {});
    } catch (e) {}
    if (typeof cfg.onCount === 'function') { try { cfg.onCount(lastCount); } catch (e) {} }
  }
  var lastCount = { news: 0, feed: 0, chat: 0, badge: 0 };
  function applyCount(d) {
    if (!d || !d.ok) return;
    lastCount = d;
    setBadge(d.badge);
    var nb = document.getElementById('spNewsBadge');
    if (nb) nb.textContent = d.news > 99 ? '99+' : (d.news || '');
  }
  function refreshBadge() {
    if (!ready()) return;
    var u = user(); if (!u.loginId) return;
    fetch(NOTIFY_GAS_URL + '?action=count&app=' + cfg.app + '&garden=' + encodeURIComponent(cfg.garden.code) +
      '&loginId=' + encodeURIComponent(u.loginId) + '&t=' + Date.now(), { redirect: 'follow' })
      .then(function (r) { return r.json(); }).then(applyCount).catch(function () {});
  }

  /* ---------- 既読の報告 ---------- */
  function reportNewsRead(ids) {
    if (!ready() || !cfg) return;
    var u = user(); if (!u.loginId) return;
    post({ action: 'read', app: cfg.app, garden: cfg.garden.code, loginId: u.loginId, name: u.name, kind: 'news', ids: ids || newsReadIds() })
      .then(applyCount).catch(function () {});
  }
  function reportFeedSeen() {
    if (!ready() || !cfg) return;
    var u = user(); if (!u.loginId) return;
    post({ action: 'read', app: cfg.app, garden: cfg.garden.code, loginId: u.loginId, name: u.name, kind: 'feed', ts: Date.now() })
      .then(applyCount).catch(function () {});
  }

  /* ---------- 通知の登録 ---------- */
  function registerSW() {
    return navigator.serviceWorker.register(cfg.swUrl || 'sw.js', { scope: './' });
  }
  function subscribe(reg) {
    return reg.pushManager.getSubscription().then(function (s) {
      return s || reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToU8(VAPID_PUBLIC) });
    }).then(function (s) {
      var u = user();
      return post({
        action: 'subscribe', app: cfg.app, garden: cfg.garden.code, gardenName: cfg.garden.name,
        loginId: u.loginId, name: u.name, sub: s.toJSON(), url: location.href.split('#')[0], newsRead: cfg.app === 'anshin' ? newsReadIds() : []
      });
    }).then(function (d) {
      if (d && d.ok) { lsSet('sp_sub_at__' + cfg.app + '__' + cfg.garden.code, String(Date.now())); applyCount(d); }
      return d;
    });
  }
  function turnOn() {
    var btn = document.getElementById('spOnBtn');
    if (btn) { btn.disabled = true; btn.textContent = '設定しています…'; }
    Notification.requestPermission().then(function (perm) {
      if (perm !== 'granted') {
        hideBanner();
        showBanner('通知が「許可しない」になりました。あとで変える場合は、iPhoneの「設定」→「通知」からこのアプリを選んでください。', null, true);
        return;
      }
      return registerSW().then(function () { return navigator.serviceWorker.ready; }).then(subscribe).then(function (d) {
        hideBanner();
        if (!d || !d.ok) showBanner('登録できませんでした：' + ((d && d.message) || '通信エラー'), null, true);
      });
    }).catch(function (e) {
      hideBanner();
      showBanner('登録できませんでした：' + (e && e.message || e), null, true);
    });
  }

  /* ---------- 画面下の案内 ---------- */
  function injectCss() {
    if (document.getElementById('spCss')) return;
    var s = document.createElement('style'); s.id = 'spCss';
    s.textContent =
      '#spBanner{position:fixed;left:12px;right:12px;bottom:calc(12px + env(safe-area-inset-bottom));z-index:99990;max-width:520px;margin:0 auto;' +
      'background:#fff;color:#2b2a28;border-radius:16px;box-shadow:0 10px 32px rgba(30,30,70,.22);padding:14px 16px;font-size:14px;line-height:1.6;' +
      'font-family:"Hiragino Kaku Gothic ProN","Noto Sans JP","Yu Gothic",sans-serif}' +
      '#spBanner .sp-row{display:flex;gap:8px;justify-content:flex-end;margin-top:10px}' +
      '#spBanner button{font:inherit;font-weight:700;border-radius:999px;padding:9px 16px;cursor:pointer;border:none}' +
      '#spBanner .sp-on{background:#4169e1;color:#fff}' +
      '#spBanner .sp-later{background:#eef0f6;color:#555}' +
      '#spNews{position:fixed;inset:0;z-index:99995;background:rgba(20,22,40,.42);display:none;align-items:center;justify-content:center;padding:16px}' +
      '#spNews.show{display:flex}' +
      '#spNews .sp-card{background:#fff;border-radius:16px;width:640px;max-width:100%;max-height:86vh;display:flex;flex-direction:column;box-shadow:0 10px 40px rgba(40,30,90,.2);color:#242042;' +
      'font-family:"Hiragino Kaku Gothic ProN","Noto Sans JP","Yu Gothic",sans-serif}' +
      '#spNews .sp-head{display:flex;align-items:center;justify-content:space-between;padding:16px 20px;border-bottom:1px solid #ebe9f6;font-weight:800;font-size:18px}' +
      '#spNews .sp-x{border:none;background:#f1f0f8;border-radius:999px;width:34px;height:34px;font-size:18px;cursor:pointer}' +
      '#spNews .sp-list{overflow:auto;padding:8px 12px 16px}' +
      '#spNews .sp-item{border-radius:12px;padding:12px 14px;margin:6px 0;cursor:pointer;border:1px solid #ebe9f6}' +
      '#spNews .sp-item.unread{border-color:#c9d6fb;background:#f5f8ff}' +
      '#spNews .sp-item .sp-date{font-size:12px;color:#8a89a6}' +
      '#spNews .sp-item .sp-title{font-weight:700;font-size:15px;margin-top:2px}' +
      '#spNews .sp-item .sp-dot{display:inline-block;width:8px;height:8px;border-radius:50%;background:#e0322c;margin-right:6px;vertical-align:middle}' +
      '#spNews .sp-item .sp-body{display:none;white-space:pre-wrap;font-size:14px;line-height:1.75;margin-top:8px;color:#3a3852}' +
      '#spNews .sp-item.open .sp-body{display:block}' +
      '#spNews .sp-item .sp-body img{max-width:100%;border-radius:8px;margin-top:8px;display:block}';
    document.head.appendChild(s);
  }
  function hideBanner() { var b = document.getElementById('spBanner'); if (b) b.remove(); }
  function showBanner(text, onOk, okOnly) {
    hideBanner(); injectCss();
    var b = document.createElement('div'); b.id = 'spBanner';
    b.innerHTML = '<div>' + text + '</div><div class="sp-row">' +
      (okOnly ? '<button class="sp-later" type="button">閉じる</button>' :
        '<button class="sp-later" type="button">あとで</button><button class="sp-on" id="spOnBtn" type="button">🔔 オンにする</button>') +
      '</div>';
    document.body.appendChild(b);
    b.querySelector('.sp-later').onclick = function () { hideBanner(); if (!okOnly) lsSet('sp_later__' + cfg.app, String(Date.now())); };
    var on = b.querySelector('.sp-on'); if (on && onOk) on.onclick = onOk;
  }
  function laterRecently(key, days) { var t = Number(lsGet(key) || 0); return t && Date.now() - t < days * 86400000; }

  /* ---------- ポータル用：お知らせの一覧（ANSHIN KUNと同じお知らせ） ---------- */
  var newsCache = [];
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (m) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]; }); }
  function fmtDate(iso) { var m = String(iso || '').match(/(\d{4})-(\d{2})-(\d{2})/); return m ? m[1] + '年' + (+m[2]) + '月' + (+m[3]) + '日' : esc(iso); }
  function openNews() {
    injectCss();
    var ov = document.getElementById('spNews');
    if (!ov) {
      ov = document.createElement('div'); ov.id = 'spNews';
      ov.innerHTML = '<div class="sp-card"><div class="sp-head">📰 お知らせ<button class="sp-x" type="button" aria-label="閉じる">×</button></div><div class="sp-list" id="spNewsList">読み込み中…</div></div>';
      document.body.appendChild(ov);
      ov.addEventListener('click', function (e) { if (e.target === ov || e.target.closest('.sp-x')) ov.classList.remove('show'); });
      ov.querySelector('#spNewsList').addEventListener('click', function (e) {
        var it = e.target.closest('.sp-item'); if (!it) return;
        it.classList.toggle('open');
        if (it.classList.contains('unread')) {
          it.classList.remove('unread');
          var dot = it.querySelector('.sp-dot'); if (dot) dot.remove();
          var read = newsReadIds(); if (read.indexOf(it.dataset.id) < 0) { read.push(it.dataset.id); lsSet(NEWS_READ_KEY, JSON.stringify(read)); }
          reportNewsRead([it.dataset.id]);
        }
      });
    }
    ov.classList.add('show');
    var u = user();
    fetch(NEWS_GAS_URL + '?u=' + encodeURIComponent(cfg.garden.name + '|' + u.loginId), { redirect: 'follow' })
      .then(function (r) { return r.json(); }).then(function (d) {
        newsCache = (d && Array.isArray(d.news)) ? d.news : [];
        renderNews();
      }).catch(function () { document.getElementById('spNewsList').textContent = 'お知らせを読み込めませんでした。時間をおいて開き直してください。'; });
  }
  function renderNews() {
    var read = {}; newsReadIds().forEach(function (x) { read[x] = 1; });
    var list = newsCache.slice().sort(function (a, b) {
      if (!!a.important !== !!b.important) return a.important ? -1 : 1;
      return a.date < b.date ? 1 : (a.date > b.date ? -1 : 0);
    });
    var box = document.getElementById('spNewsList');
    if (!list.length) { box.textContent = '現在お知らせはありません'; return; }
    box.innerHTML = list.map(function (n) {
      var unread = !read[n.id];
      var imgs = (n.images || []).map(function (u) { return '<img src="' + esc(u) + '" alt="" loading="lazy">'; }).join('');
      var link = (n.link && n.link.url) ? '<div style="margin-top:8px"><a href="' + esc(n.link.url) + '" target="_blank" rel="noopener">' + esc(n.link.title || n.link.url) + '</a></div>' : '';
      return '<div class="sp-item' + (unread ? ' unread' : '') + '" data-id="' + esc(n.id) + '">' +
        '<div class="sp-date">' + fmtDate(n.date) + (n.important ? '　📌 重要' : '') + '</div>' +
        '<div class="sp-title">' + (unread ? '<span class="sp-dot"></span>' : '') + esc(n.title) + '</div>' +
        '<div class="sp-body">' + esc(n.body) + imgs + link + '</div></div>';
    }).join('');
  }

  /* ---------- はじめに ---------- */
  function start() {
    if (!ready()) return;
    var u = user();
    if (!u.loginId) { setTimeout(start, 3000); return; }   // ログイン待ち

    refreshBadge();
    document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') { refreshBadge(); if (cfg.app === 'portal') reportFeedSeen(); } });
    if (badgeTimer) clearInterval(badgeTimer);
    badgeTimer = setInterval(function () { if (document.visibilityState === 'visible') refreshBadge(); }, 60000);
    if (cfg.app === 'portal') reportFeedSeen();   // ポータルを開いた＝フィードを見た

    // ANSHIN KUN：お知らせを開いたら既読を報告
    if (cfg.app === 'anshin' && typeof window.nsMarkRead === 'function' && !window.nsMarkRead._sp) {
      var orig = window.nsMarkRead;
      window.nsMarkRead = function (id) {
        var before = newsReadIds().indexOf(id) >= 0;
        var r = orig.apply(this, arguments);
        if (!before) reportNewsRead([id]);
        return r;
      };
      window.nsMarkRead._sp = true;
    }

    if (!pushSupported()) {
      if (isIOS() && !isStandalone() && !laterRecently('sp_later__' + cfg.app, 7)) {
        showBanner('🔔 新しいお知らせを<b>アイコンの数字と通知</b>でお知らせできるようになりました。<br>' +
          '受け取るには、Safariの下にある <b>共有ボタン（□に↑）→「ホーム画面に追加」</b> で追加し直してください。' +
          '<br><span style="font-size:12px;color:#777">※iOS 16.4以降。前からあるアイコンは削除してかまいません。追加し直したあと、もう一度ログインが必要です。</span>', null, true);
      }
      return;
    }
    if (Notification.permission === 'granted') {
      // 登録の更新（1日1回）
      registerSW().then(function () { return navigator.serviceWorker.ready; }).then(function (reg) {
        var key = 'sp_sub_at__' + cfg.app + '__' + cfg.garden.code;
        var last = Number(lsGet(key) || 0);
        if (Date.now() - last > 86400000) return subscribe(reg);
      }).catch(function () {});
      return;
    }
    if (Notification.permission === 'default' && !laterRecently('sp_later__' + cfg.app, 3)) {
      if (isIOS() && !isStandalone()) return;   // iPhoneはホーム画面から開いたときだけ許可を出せる
      showBanner('🔔 <b>新しいお知らせ' + (cfg.app === 'portal' ? '・フィード・本部からのチャット' : '') + '</b>が入ったら、通知とアイコンの数字でお知らせします。' +
        '', turnOn);
    }
  }

  window.ShiodomePush = {
    enabledFor: enabledFor,
    /* <head> の中で呼ぶ：対象の園だけ manifest を付ける（ホーム画面に追加したときアプリとして開く） */
    head: function (garden, manifestDir) {
      if (!enabledFor(garden) || !garden.key) return;
      document.write('<link rel="manifest" href="' + (manifestDir || 'manifests/') + garden.key + '.json">' +
        '<meta name="apple-mobile-web-app-capable" content="yes"><meta name="mobile-web-app-capable" content="yes">');
    },
    /* ShiodomePush.init({ app:'anshin'|'portal', garden:{code,key,name}, user:function(){return{loginId,name}}, swUrl:'sw.js', onCount:function(c){} }) */
    init: function (options) {
      if (cfg || !options || !enabledFor(options.garden)) return false;
      cfg = options;
      if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
      return true;
    },
    openNews: openNews,
    refresh: refreshBadge,
    reportNewsRead: reportNewsRead,
    reportFeedSeen: reportFeedSeen
  };
})();
