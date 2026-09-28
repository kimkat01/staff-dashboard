/* ============================================================
   しおどめグループ 園マスタ（全ツール共通・この1ファイルだけで管理）
   置き場所：kimkat01/staff-dashboard リポジトリの一番上（gardens.js）
   読み込み：<script src="https://kimkat01.github.io/staff-dashboard/gardens.js"></script>

   ・URLには英字の「園キー」を使う。例）?garden=tsukuba
   ・name は職員マスタ（UQchecker）のQ列「園名」と一字一句同じにすること。
   ・園を増やす・名前が変わるときは、この一覧だけ直せば全ツールに反映される。
   ・古いURL（?garden=しおどめ保育園つくば のような日本語）もそのまま使える。
   ============================================================ */
var GARDEN_MASTER = [
  // 学校法人柴学園
  { code:'S01', key:'shiodome_no_mori',   name:'認定こども園しおどめの森' },
  { code:'S02', key:'yashio_ekikita',     name:'しおどめ保育園八潮駅北' },
  { code:'S03', key:'keikyu_kamata',      name:'しおどめ保育園京急蒲田駅前' },
  { code:'S04', key:'shokibo_ninka',      name:'しおどめ保育園小規模認可' },
  { code:'S05', key:'edogawa_chuo',       name:'しおどめ保育園江戸川中央' },
  { code:'S06', key:'kasukabe',           name:'しおどめ保育園春日部' },
  { code:'S07', key:'koshigaya',          name:'しおどめ保育園越谷' },
  { code:'S08', key:'yashio_akanemachi',  name:'しおどめ保育園八潮茜町' },
  { code:'S09', key:'fureai_shiodome',    name:'ふれあいしおどめ保育園' },
  { code:'S10', key:'tsukuba',            name:'しおどめ保育園つくば' },
  { code:'S11', key:'inagi',              name:'しおどめ保育園稲城' },
  { code:'S12', key:'kuki',               name:'しおどめ保育園久喜' },
  { code:'S13', key:'misato_chuo',        name:'しおどめ保育園三郷中央' },
  { code:'S14', key:'fureai_yashio',      name:'ふれあいしおどめ保育園八潮' },
  // 社会福祉法人雄雅会
  { code:'Y01', key:'yashio_shiodome',    name:'八潮しおどめ保育園' },
  { code:'Y02', key:'moriya_shiodome',    name:'守谷しおどめ保育園' },
  { code:'Y03', key:'shiodome_nakayoshi', name:'しおどめなかよし保育園' }
];

/* URLの値（園キー or 日本語の園名）から園を探す。見つからなければ null。
   大文字小文字・空白（全角含む）の違いは無視する。 */
function findGarden(value){
  var norm = function(t){ return String(t || '').replace(/[\s　]/g, '').toLowerCase(); };
  var v = norm(value);
  if(!v) return null;
  for(var i = 0; i < GARDEN_MASTER.length; i++){
    var g = GARDEN_MASTER[i];
    if(norm(g.key) === v || norm(g.name) === v || norm(g.code) === v) return g;
  }
  return null;
}

/* 今のページのURL（?garden=...）から園を探す */
function gardenFromUrl(){
  try { return findGarden(new URLSearchParams(location.search).get('garden')); }
  catch(e){ return null; }
}
