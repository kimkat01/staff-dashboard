/* ============================================================
   しおどめグループ 園マスタ（全ツール共通・この1ファイルだけで管理）
   置き場所：kimkat01/staff-dashboard リポジトリの一番上（gardens.js）
   読み込み：<script src="https://kimkat01.github.io/staff-dashboard/gardens.js"></script>

   ・URLには英字の「園キー」を使う。例）?garden=tsukuba
   ・name は職員マスタ（UQchecker）のQ列「園名」と一字一句同じにすること。
   ・園を増やす・名前が変わるときは、この一覧だけ直せば全ツールに反映される。
   ・古いURL（?garden=しおどめ保育園つくば のような日本語）もそのまま使える。
   ・insta は各園の公式インスタのアカウント名（@のあと）。「となりの保育室」の
     「各園のインスタを見る」ボタンに使う。空欄の園はボタンが出ない。
     アカウントができたら、ここに書き足すだけで全園の画面に出る。
   ============================================================ */
var GARDEN_MASTER = [
  // 学校法人柴学園
  { code:'S01', key:'shiodome_no_mori',   name:'認定こども園しおどめの森', insta:'shiodomenomori_yashio' },
  { code:'S02', key:'yashio_ekikita',     name:'しおどめ保育園八潮駅北', insta:'' },
  { code:'S03', key:'keikyu_kamata',      name:'しおどめ保育園京急蒲田駅前', insta:'shiodome.keikyukamata' },
  { code:'S04', key:'shokibo_ninka',      name:'しおどめ保育園小規模認可', insta:'shiodome_shokibo' },
  { code:'S05', key:'edogawa_chuo',       name:'しおどめ保育園江戸川中央', insta:'shiodome.edogawa' },
  { code:'S06', key:'kasukabe',           name:'しおどめ保育園春日部', insta:'shiodome_kasukabe' },
  { code:'S07', key:'koshigaya',          name:'しおどめ保育園越谷', insta:'shiodome.koshigaya' },
  { code:'S08', key:'yashio_akanemachi',  name:'しおどめ保育園八潮茜町', insta:'yashioakane' },
  { code:'S09', key:'fureai_shiodome',    name:'ふれあいしおどめ保育園', insta:'' },
  { code:'S10', key:'tsukuba',            name:'しおどめ保育園つくば', insta:'shiodome_tsukuba' },
  { code:'S11', key:'inagi',              name:'しおどめ保育園稲城', insta:'shiodome_inagi' },
  { code:'S12', key:'kuki',               name:'しおどめ保育園久喜', insta:'shiodome_kuki' },
  { code:'S13', key:'misato_chuo',        name:'しおどめ保育園三郷中央', insta:'shiodome_misatochuo' },
  { code:'S14', key:'fureai_yashio',      name:'ふれあいしおどめ保育園八潮', insta:'shio_domeo' },
  // 社会福祉法人雄雅会
  { code:'Y01', key:'yashio_shiodome',    name:'八潮しおどめ保育園', insta:'yashio_shiodome' },
  { code:'Y02', key:'moriya_shiodome',    name:'守谷しおどめ保育園', insta:'' },
  { code:'Y03', key:'shiodome_nakayoshi', name:'しおどめなかよし保育園', insta:'' }
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
