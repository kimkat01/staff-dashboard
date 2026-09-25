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
  "ふれあいしおどめ保育園": "fureai_shiodome"
};

/* 文書一覧。common は全園に表示され、園の一覧の後ろに付く。
   title=表示名／file=PDFファイル名（半角英数字） */
var MANUALS = {
  common: [
    { label:"参考資料", docs:[
      { title:"こども性暴力防止法の施行について", file:"kodomo-seibouryoku-hou.pdf" }
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

/* 園名から、表示するグループ一覧を作る（file は docs/ からの相対パスに変換済み） */
function manualGroupsFor(garden){
  var folder = GARDEN_FOLDERS[garden] || "";
  var sets = [];
  if(folder && MANUALS[folder]) sets.push({ dir:folder, groups:MANUALS[folder] });
  sets.push({ dir:"common", groups:MANUALS.common || [] });
  var out = [];
  sets.forEach(function(s){
    s.groups.forEach(function(g){
      out.push({ label:g.label, docs:g.docs.map(function(d){
        return { title:d.title, file:s.dir + "/" + d.file };
      })});
    });
  });
  return out;
}
