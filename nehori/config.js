/* ===== しおどめねほりんぱほりん 共通設定（2026-11-18 試作版） =====
   会場（staff-dashboard/nehori/index.html）と本部の入室状況（honbu-dashboard/nehori-monitor.html）の両方が読み込む。
   設置後に書きかえるのは、下の「設置後に入れる」2つだけ。 */

/* ---- 設置後に入れる ---- */
// Cloudflare Worker「nehori-proxy」のURL（末尾の / なし）。例：https://nehori-proxy.cryk0289.workers.dev
const NEHORI_WORKER_URL = "https://nehori-proxy.cryk0289.workers.dev";
// GAS「しおどめねほりんぱほりん 通信」のウェブアプリURL（…/exec）
const NEHORI_GAS_URL = "https://script.google.com/macros/s/AKfycbzIDEdI-YsP74HOCfHa5orivEtR_sNlcPk8r5pMhPwrmQvduDIlZhSq59MOHrrQZmFt-Q/exec";

/* ---- 開催回 ---- */
// id は記録（スプレッドシート・録音フォルダ）の区別に使う。回を増やすときはここを書きかえる。
// URLに ?ev=test を付けると、本番の回とは別の「テスト回」として試せる（記録も別になる）。
const NEHORI_EVENT = {
  id: "2026-11-25",
  title: "第1回 しおどめねほりんぱほりん",
  theme: "保育についての討論会",
  start: "2026-11-25T20:00:00+09:00",
  end:   "2026-11-25T20:30:00+09:00",
  label: "11月25日（水）20:00〜20:30"
};
// 試作中は時間に関係なく入れる。本番は false にする（開始15分前から終了30分後まで入れる）
const NEHORI_ALWAYS_OPEN = true;
const NEHORI_OPEN_BEFORE_MIN = 15;
const NEHORI_MAX_PARTICIPANTS = 8;  // 先着8名
const NEHORI_MAX_MC = 2;

/* ---- 声の種類（話す人のスマホの中で加工してから送る。加工前の声はスマホの外に出ない） ----
   ratio：声の高さ（1より大きいと高く、小さいと低く）。robot：ロボット声の揺れ（0でなし） */
const NEHORI_VOICES = {
  hi1:  { ratio: 1.28, robot: 0,  label: "高めの声" },
  hi2:  { ratio: 1.45, robot: 0,  label: "かなり高い声" },
  lo1:  { ratio: 0.80, robot: 0,  label: "低めの声" },
  lo2:  { ratio: 0.70, robot: 0,  label: "かなり低い声" },
  robo: { ratio: 0.92, robot: 55, label: "ロボットの声" }
};

/* ---- アバター（オリジナル。参加者8種・MC2種） ---- */
const NEHORI_AVATARS = [
  { id: "neko",    name: "ねこ",   fur: "#f2c48d", ear: "cone",   inner: "#f4b6c2", muz: "#fff6ea", nose: "#e98a9a", voice: "hi2" },
  { id: "inu",     name: "いぬ",   fur: "#c98f5a", ear: "floppy", earC: "#8a5a35",  muz: "#f3dcc0", nose: "#3a2a22", voice: "lo1" },
  { id: "usagi",   name: "うさぎ", fur: "#f6f3ee", ear: "long",   inner: "#f4b6c2", muz: "#ffffff", nose: "#e98a9a", voice: "hi1", line: "#d6d0c6" },
  { id: "kuma",    name: "くま",   fur: "#8b5e3c", ear: "round",  inner: "#c79a72", muz: "#dcb58e", nose: "#2b1d14", voice: "lo2" },
  { id: "panda",   name: "ぱんだ", fur: "#f7f7f2", ear: "round",  earC: "#262626",  patch: "#262626", muz: "#ffffff", nose: "#262626", voice: "robo", line: "#d6d6d0" },
  { id: "hiyoko",  name: "ひよこ", fur: "#ffd84d", ear: "none",   beak: "#f39a2b",  tuft: true, voice: "hi2" },
  { id: "kitsune", name: "きつね", fur: "#e8873a", ear: "cone",   inner: "#fff6ea", muz: "#fff6ea", nose: "#2b1d14", voice: "hi1" },
  { id: "koala",   name: "こあら", fur: "#a3a9b1", ear: "big",    inner: "#e6e8eb", nose: "#2f3236", bigNose: true, voice: "lo1" }
];
const NEHORI_MC_AVATARS = [
  { id: "fukurou", name: "ふくろう", fur: "#9b7653", ear: "owl", eyeRing: "#fff3dc", beak: "#e0a030", voice: "lo1", mc: true },
  { id: "pengin",  name: "ぺんぎん", fur: "#3a4a63", ear: "none", face: "#ffffff", beak: "#f39a2b", voice: "hi1", mc: true }
];
function nehoriFindAvatar(id) {
  return NEHORI_AVATARS.concat(NEHORI_MC_AVATARS).find(function (a) { return a.id === id; }) || null;
}

/* アバターの顔（SVG文字列）。口は <g class="mouth"> にまとめ、話している間は会場側のCSSで動かす */
function nehoriAvatarSVG(id) {
  const a = nehoriFindAvatar(id) || NEHORI_AVATARS[0];
  const ln = a.line ? ' stroke="' + a.line + '" stroke-width="1.6"' : "";
  let s = '<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">';
  // 耳（頭の後ろ）
  if (a.ear === "cone") {
    s += '<path d="M22 46 L26 12 L48 30 Z" fill="' + a.fur + '"/><path d="M78 46 L74 12 L52 30 Z" fill="' + a.fur + '"/>';
    s += '<path d="M28 38 L30 20 L41 30 Z" fill="' + a.inner + '"/><path d="M72 38 L70 20 L59 30 Z" fill="' + a.inner + '"/>';
  } else if (a.ear === "long") {
    s += '<ellipse cx="37" cy="20" rx="9" ry="21" fill="' + a.fur + '"' + ln + '/><ellipse cx="63" cy="20" rx="9" ry="21" fill="' + a.fur + '"' + ln + '/>';
    s += '<ellipse cx="37" cy="22" rx="4" ry="14" fill="' + a.inner + '"/><ellipse cx="63" cy="22" rx="4" ry="14" fill="' + a.inner + '"/>';
  } else if (a.ear === "round") {
    const c = a.earC || a.fur;
    s += '<circle cx="26" cy="31" r="11" fill="' + c + '"/><circle cx="74" cy="31" r="11" fill="' + c + '"/>';
    if (a.inner) s += '<circle cx="26" cy="31" r="5.5" fill="' + a.inner + '"/><circle cx="74" cy="31" r="5.5" fill="' + a.inner + '"/>';
  } else if (a.ear === "big") {
    s += '<circle cx="21" cy="40" r="15" fill="' + a.fur + '"/><circle cx="79" cy="40" r="15" fill="' + a.fur + '"/>';
    s += '<circle cx="21" cy="40" r="8.5" fill="' + a.inner + '"/><circle cx="79" cy="40" r="8.5" fill="' + a.inner + '"/>';
  } else if (a.ear === "owl") {
    s += '<path d="M26 34 L24 14 L40 28 Z" fill="' + a.fur + '"/><path d="M74 34 L76 14 L60 28 Z" fill="' + a.fur + '"/>';
  }
  // 頭
  s += '<circle cx="50" cy="56" r="31" fill="' + a.fur + '"' + ln + '/>';
  if (a.ear === "floppy") {
    s += '<ellipse cx="20" cy="54" rx="9" ry="19" transform="rotate(14 20 54)" fill="' + a.earC + '"/>';
    s += '<ellipse cx="80" cy="54" rx="9" ry="19" transform="rotate(-14 80 54)" fill="' + a.earC + '"/>';
  }
  if (a.tuft) s += '<path d="M46 26 q4 -10 8 0 q-4 -4 -8 0z" fill="' + a.fur + '"/><path d="M50 27 q2 -12 6 -4" fill="none" stroke="#e6b800" stroke-width="2" stroke-linecap="round"/>';
  if (a.face) s += '<ellipse cx="50" cy="62" rx="24" ry="22" fill="' + a.face + '"/>';
  if (a.patch) s += '<ellipse cx="38" cy="54" rx="8" ry="10" transform="rotate(20 38 54)" fill="' + a.patch + '"/><ellipse cx="62" cy="54" rx="8" ry="10" transform="rotate(-20 62 54)" fill="' + a.patch + '"/>';
  // 目
  if (a.eyeRing) {
    s += '<circle cx="38" cy="52" r="11" fill="' + a.eyeRing + '"/><circle cx="62" cy="52" r="11" fill="' + a.eyeRing + '"/>';
    s += '<circle cx="38" cy="52" r="5" fill="#2b2b2b"/><circle cx="62" cy="52" r="5" fill="#2b2b2b"/>';
    s += '<circle cx="39.5" cy="50.5" r="1.6" fill="#fff"/><circle cx="63.5" cy="50.5" r="1.6" fill="#fff"/>';
  } else {
    const ec = a.patch ? "#ffffff" : "#2b2b2b";
    s += '<circle cx="39" cy="54" r="3.8" fill="' + ec + '"/><circle cx="61" cy="54" r="3.8" fill="' + ec + '"/>';
    if (a.patch) s += '<circle cx="39" cy="54" r="2.2" fill="#262626"/><circle cx="61" cy="54" r="2.2" fill="#262626"/>';
  }
  // ほっぺ
  s += '<ellipse cx="29" cy="65" rx="5" ry="3" fill="#f6a5b0" opacity=".75"/><ellipse cx="71" cy="65" rx="5" ry="3" fill="#f6a5b0" opacity=".75"/>';
  // 口まわり・鼻・くちばし
  if (a.muz) s += '<ellipse cx="50" cy="66" rx="12" ry="8.5" fill="' + a.muz + '"/>';
  if (a.bigNose) s += '<ellipse cx="50" cy="62" rx="6.5" ry="7.5" fill="' + a.nose + '"/>';
  else if (a.nose) s += '<ellipse cx="50" cy="61.5" rx="3.6" ry="2.6" fill="' + a.nose + '"/>';
  if (a.beak) s += '<path d="M43 62 L57 62 L50 70 Z" fill="' + a.beak + '"/>';
  // 口（話している間だけ開く）
  s += '<g class="mouth"><ellipse cx="50" cy="' + (a.beak ? 73 : 71) + '" rx="4.2" ry="2.6" fill="#8a3a46"/></g>';
  s += "</svg>";
  return s;
}
