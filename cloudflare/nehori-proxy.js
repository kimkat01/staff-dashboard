/* ===== Cloudflare Worker「nehori-proxy」（しおどめねほりんぱほりん 音声通話の中継）2026-11-18 =====
   会場ページ（kimkat01.github.io/staff-dashboard/nehori/）から Cloudflare Realtime（SFU）を使うための窓口。
   Realtime の秘密の鍵（App Secret）はページに置けないため、この Worker が代わりに持って送る。

   【Worker の設定（Settings → Variables and Secrets）】
     CALLS_APP_ID      … Realtime の SFU アプリの App ID（種類：Text）
     CALLS_APP_SECRET  … 同じアプリの App Secret / API Token（種類：Secret）
     （任意）TURN_KEY_ID / TURN_KEY_TOKEN … Realtime の TURN キー。会社や園のWi-Fiでつながりにくいときだけ設定（種類：Secret）

   【このWorkerができること（これ以外は断る）】
     POST /calls/sessions/new
     POST /calls/sessions/<id>/tracks/new
     PUT  /calls/sessions/<id>/renegotiate
     PUT  /calls/sessions/<id>/tracks/close
     GET  /ice   … 接続用のサーバー情報（TURNキーがあればTURNも返す）
   呼び出せるのは https://kimkat01.github.io のページからだけ。 */

const ALLOWED_ORIGINS = ["https://kimkat01.github.io"];
const CALLS_BASE = "https://rtc.live.cloudflare.com/v1";

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const okOrigin = ALLOWED_ORIGINS.includes(origin);
    const cors = {
      "Access-Control-Allow-Origin": okOrigin ? origin : ALLOWED_ORIGINS[0],
      "Access-Control-Allow-Methods": "GET, POST, PUT, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "86400",
      "Vary": "Origin"
    };
    const json = (obj, status) =>
      new Response(JSON.stringify(obj), { status: status || 200, headers: { ...cors, "Content-Type": "application/json" } });

    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    if (!okOrigin) return json({ errorCode: "forbidden", errorDescription: "origin not allowed" }, 403);
    if (!env.CALLS_APP_ID || !env.CALLS_APP_SECRET) return json({ errorCode: "not_configured", errorDescription: "CALLS_APP_ID / CALLS_APP_SECRET が未設定です" }, 500);

    const url = new URL(request.url);

    // 接続用のサーバー情報
    if (url.pathname === "/ice" && request.method === "GET") {
      const ice = [{ urls: "stun:stun.cloudflare.com:3478" }];
      if (env.TURN_KEY_ID && env.TURN_KEY_TOKEN) {
        try {
          const r = await fetch(CALLS_BASE + "/turn/keys/" + env.TURN_KEY_ID + "/credentials/generate-ice-servers", {
            method: "POST",
            headers: { Authorization: "Bearer " + env.TURN_KEY_TOKEN, "Content-Type": "application/json" },
            body: JSON.stringify({ ttl: 7200 })
          });
          if (r.ok) {
            const d = await r.json();
            if (d && Array.isArray(d.iceServers)) return json({ iceServers: d.iceServers });
          }
        } catch (e) { /* TURNが取れなくても STUN だけで続ける */ }
      }
      return json({ iceServers: ice });
    }

    // Realtime SFU の中継
    if (url.pathname.startsWith("/calls/")) {
      const rest = url.pathname.slice("/calls/".length);
      const allowed =
        (request.method === "POST" && /^sessions\/new$/.test(rest)) ||
        (request.method === "POST" && /^sessions\/[A-Za-z0-9_-]+\/tracks\/new$/.test(rest)) ||
        (request.method === "PUT"  && /^sessions\/[A-Za-z0-9_-]+\/renegotiate$/.test(rest)) ||
        (request.method === "PUT"  && /^sessions\/[A-Za-z0-9_-]+\/tracks\/close$/.test(rest));
      if (!allowed) return json({ errorCode: "not_found" }, 404);

      const body = await request.text();
      const r = await fetch(CALLS_BASE + "/apps/" + env.CALLS_APP_ID + "/" + rest, {
        method: request.method,
        headers: { Authorization: "Bearer " + env.CALLS_APP_SECRET, "Content-Type": "application/json" },
        body: body ? body : undefined
      });
      return new Response(await r.text(), { status: r.status, headers: { ...cors, "Content-Type": "application/json" } });
    }

    return json({ ok: true, name: "nehori-proxy" });
  }
};
