/* =============================================================
   規約・マニュアル 文書一覧（全園共通の設定ファイル）
   職員ダッシュボード（index.html）と PDF内検索（docs/viewer.html）の
   両方がこのファイルを読みます。一覧を直すときはここだけ直せばOKです。

   PDFの置き場所：
     docs/common/   … 全園共通の資料
     docs/○○/      … 園ごとの資料（○○＝下の GARDEN_FOLDERS のフォルダ名）
   園ごとのフォルダ内のファイル名は全園でそろえる（例：part-shugyo-kisoku.pdf）。

   園を追加するとき：
     ① GARDEN_FOLDERS に「園名：フォルダ名」を1行足す
     ② docs/フォルダ名/ にPDFを置く
     ③ MANUALS に「フォルダ名：一覧」を足す
   ============================================================= */

/* 園名（URLの ?garden= と同じ正式名）→ フォルダ名。
   フォルダ名はシフトデータ（data/○○.json）と同じキーにそろえる。 */
var GARDEN_FOLDERS = {
  "しおどめ保育園つくば":   "tsukuba",
  "ふれあいしおどめ保育園": "fureai_shiodome",
  "しおどめ保育園三郷中央": "misato_chuo",
  "守谷しおどめ保育園":     "moriya_shiodome",
  "しおどめ保育園春日部":   "kasukabe"
};

/* 園のダッシュボードが別のリポジトリにある園だけ、PDF内検索の「Home」の戻り先を書く。
   書いていない園は staff-dashboard（?garden=園名）に戻る。 */
var GARDEN_HOMES = {
  "ふれあいしおどめ保育園": "https://kimkat01.github.io/fureai-moriya-staff-dashboard/"
};

/* 文書一覧。common は全園に表示され、園の一覧の後ろに付く。
   title=表示名／file=PDFファイル名（半角英数字） */
var MANUALS = {
  /* law:"s" のグループは学校法人柴学園の園だけに出す（社会福祉法人雄雅会＝園コードがYの園には出さない）。
     law を書かないグループは全園に出る。 */
  /* enchoOnly:true のグループは、園長ダッシュボード（ナレッジボード）の「規約・マニュアル」にだけ出る。
     職員ダッシュボードには出ない。 */
  common: [
    { label:"法人規程", enchoOnly:true, law:"s", docs:[
      { title:"管理規程（法人）", file:"kanri-kitei.pdf" },
      { title:"経理規程（法人）", file:"keiri-kitei.pdf" }
    ]},
    { label:"参考資料", docs:[
      { title:"こども性暴力防止法の施行について", file:"kodomo-seibouryoku-hou.pdf" }
    ]}
  ],
  fureai_shiodome: [
    { label:"規約・マニュアル", docs:[
      { title:"就業規則（パート職員）", file:"part-shugyo-kisoku.pdf" }
    ]}
  ],
  moriya_shiodome: [
    { label:"規約・マニュアル", docs:[
      { title:"就業規則（正規職員）",   file:"seiki-shugyo-kisoku.pdf" },
      { title:"給与規程（正規職員）",   file:"seiki-kyuyo-kitei.pdf" },
      { title:"就業規則（パート職員）", file:"part-shugyo-kisoku.pdf" },
      { title:"育児介護休業規程",       file:"ikuji-kaigo-kyugyo-kitei.pdf" }
    ]}
  ],
  misato_chuo: [
    { label:"規約・マニュアル", docs:[
      { title:"就業規則（正規職員）",   file:"seiki-shugyo-kisoku.pdf" },
      { title:"就業規則（パート職員）", file:"part-shugyo-kisoku.pdf" },
      { title:"給与規定（正規職員）",   file:"seiki-kyuyo-kitei.pdf" }
    ]},
    { label:"BCP・防災", docs:[
      { title:"業務継続計画（BCP）", file:"bcp.pdf" }
    ]}
  ],
  kasukabe: [
    { label:"規約・マニュアル", docs:[
      { title:"就業規則（正規職員）",   file:"seiki-shugyo-kisoku.pdf" },
      { title:"就業規則（パート職員）", file:"part-shugyo-kisoku.pdf" },
      { title:"給与規程（正規職員）",   file:"seiki-kyuyo-kitei.pdf" }
    ]}
  ],
  tsukuba: [
    { label:"規約・マニュアル", docs:[
      { title:"就業規則（正規職員）",   file:"seiki-shugyo-kisoku.pdf" },
      { title:"就業規則（パート職員）", file:"part-shugyo-kisoku.pdf" },
      { title:"給与規程（正規職員）",   file:"seiki-kyuyo-kitei.pdf" }
    ]},
    { label:"BCP・防災", docs:[
      { title:"防災・防犯マニュアル", file:"bousai-bouhan-manual.pdf" }
    ]}
  ]
};

/* 園名（または園キー）から、表示するグループ一覧を作る（file は docs/ からの相対パスに変換済み）
   opts.encho=true のときは園長向け（enchoOnly のグループも含める）。 */
function manualGroupsFor(garden, opts){
  opts = opts || {};
  var folder = GARDEN_FOLDERS[garden] || (MANUALS[garden] && garden !== "common" ? garden : "");
  if(!folder && typeof findGarden === "function"){       // 園マスタ（gardens.js）があれば、そちらでも探す
    var m = findGarden(garden);
    if(m && MANUALS[m.key]) folder = m.key;
  }
  // 園の法人（園マスタ gardens.js の園コードの頭文字：S＝柴学園／Y＝雄雅会）
  var gm = (typeof findGarden === "function") ? findGarden(garden) : null;
  var law = gm && gm.code ? gm.code.charAt(0).toLowerCase() : "";
  var sets = [];
  if(folder && MANUALS[folder]) sets.push({ dir:folder, groups:MANUALS[folder] });
  sets.push({ dir:"common", groups:MANUALS.common || [] });
  var out = [];
  sets.forEach(function(s){
    s.groups.forEach(function(g){
      if(g.enchoOnly && !opts.encho) return;             // 園長専用は職員には出さない
      if(g.law && law && g.law !== law) return;          // 別法人の規程は出さない
      out.push({ label:g.label, docs:g.docs.map(function(d){
        return { title:d.title, file:s.dir + "/" + d.file };
      })});
    });
  });
  return out;
}
