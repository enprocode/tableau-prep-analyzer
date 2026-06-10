# `.tfl` / `.tflx` 形式リファレンス

TPFA が解析対象とする Tableau Prep フローファイルの構造と、TPFA の解析方針をまとめます。

> ⚠️ 注意: Tableau の内部フォーマットは公式に完全公開されていないため、本書は
> 観測・サンプルに基づく実用的な要約です。**バージョンによりキー名や階層が変化します。**
> したがって TPFA は「正確なキー名」ではなく **ヒューリスティックな探索** で読み取ります。

---

## 1. 2 つの形式

| 拡張子 | 中身 | TPFA の扱い |
| --- | --- | --- |
| `.tfl` | フロー定義の **生 JSON** | そのまま `JSON.parse` |
| `.tflx` | **ZIP** パッケージ | 解凍し、内部のフロー定義 JSON を抽出 |

### `.tflx`（ZIP）の中身

- `flow` … 拡張子なしのファイル。中身はフロー定義 JSON（最重要）。
- `*.hyper` / 抽出データ … 解析には不要。TPFA は無視する。

**抽出の優先順位**（`extractFlowJsonFromZip`）:
1. 名前が `flow` のエントリ
2. `*.tfl`
3. `*.json`
4. それでも無ければ「中身が `{` で始まる最初のテキストファイル」

ZIP 判定はマジックナンバー `PK\x03\x04`（`50 4B 03 04`）でも行うため、拡張子が
`.tflx` でなくても ZIP なら解凍を試みます。

---

## 2. フロー定義 JSON の骨格

おおむね以下の構造です（バージョンで前後します）。

```jsonc
{
  "parameters": { /* フローパラメータ */ },
  "initialNodes": ["<起点ノードID>", ...],
  "nodes": {
    "<nodeId>": {
      "nodeType": ".v2018_2_3.LoadExcel",   // バージョン接頭辞付き
      "name": "Orders",
      "id": "<nodeId>",
      "baseType": "input",                   // input | superNode | output | transform
      "nextNodes": [                          // ← エッジはここから導出
        { "namespace": "Default", "nextNodeId": "<次のID>", "nextNamespace": "Default" }
      ],
      "connectionId": "<connId>",            // connections への参照
      "connectionAttributes": { "class": "excel-direct", "filename": "..." },
      "relation": { "table": "Orders$" },
      "fields": [ { "name": "Sales", "type": "real" }, ... ],
      "loomContainer": { /* Clean ステップの内部パイプライン（後述） */ }
    }
  },
  "connections": {
    "<connId>": {
      "connectionType": "excel-direct",
      "name": "Sample - Superstore.xlsx",
      "connectionAttributes": { "filename": "..." }
    }
  }
}
```

### エッジ（コネクション）の導出

TPFA は各ノードの `nextNodes[].nextNodeId` を辿って `FlowConnection { source, target }`
を作ります。古い/別形式に備え、トップレベルの `connections/edges/links` 配列からの
フォールバックも持ちます。

---

## 3. 代表的な `nodeType`

`nodeType` はバージョン接頭辞（`.v1.` / `.v2018_2_3.` / `.v2019_1_4.` …）付きの文字列です。
TPFA は **部分一致** で正規化タイプに分類します（`classifyNodeType`）。

| 含まれる語（小文字） | 正規化タイプ | 例 |
| --- | --- | --- |
| `load`, `input`, baseType=`input` | `Input` | `.v1.LoadCsv`, `.v2018_2_3.LoadExcel`, `.v1.LoadSql` |
| `writeto`, `publishextract`, `output`, baseType=`output` | `Output` | `.v2019_1_4.WriteToHyper`, `.v1.WriteToCsv` |
| `join` | `Join` | `.v2018_2_3.SuperJoin` |
| `union` | `Union` | `.v1.Union` |
| `aggregate`, `groupby` | `Aggregate` | `.v1.Aggregate` |
| `pivot` | `Pivot` | `.v1.Pivot` |
| `script`, `python`, `rserve` | `Script` | `.v1.Script` |
| `container`, `supertransform`, baseType=`superNode/transform` | `Clean` | `.v1.Container` |
| 上記以外で actions/loomContainer を持つ | `Clean` | — |
| それ以外 | `Other` | — |

---

## 4. Clean ステップの内部（`loomContainer`）

クレンジングステップは内部に **マイクロ変換のパイプライン**を持ち、しばしば
`loomContainer.nodes` に入れ子で格納されます。代表的な操作:

| 操作の nodeType（部分一致） | 意味 | 主なキー |
| --- | --- | --- |
| `AddColumn` / `ChangeColumnCalc` | 計算フィールド | `columnName`, `expression` |
| `FilterOperation` / `*filter*` | フィルタ | `filterExpression`, `expression` |
| `RemoveColumns` / `DropColumn` | 列削除 | `columnNames` |
| `RenameColumn` | 列名変更 | `columnName`, `newColumnName` |
| `ChangeColumnType` | 型変更 | `columnName`, `type` |

TPFA はこれらを階層に依存せず `deepCollect` でノード配下から拾い、`FlowActionItem` に正規化します。

### 結合 (Join) の詳細

```jsonc
{
  "nodeType": ".v2018_2_3.SuperJoin",
  "joinType": "inner",            // inner | left | right | fullouter
  "conditions": [
    { "leftExpression": "[Order ID]", "rightExpression": "[Order ID]", "comparator": "==" }
  ]
}
```

`joinType` と `conditions` は `extractJoinInfo` が `joinConditions`（`左 比較 右` の文字列配列）
に整形します。

---

## 5. TPFA が抽出する正規化データ

| 抽出元 | 格納先 |
| --- | --- |
| `connectionAttributes` / `connections[connId]` / `relation` | `metaData.connectionType / connectionName / filePath` |
| 出力ノードの出力先 | `metaData.outputPath / outputType` |
| `fields[]` | `metaData.fields[{name,type}]` |
| Join 情報 | `metaData.joinType / joinConditions` |
| 計算フィールド/フィルタ/列操作 | `actions[]`（`FlowActionItem`） |

---

## 6. 実サンプル

`public/samples/superstore_v1.tfl` / `superstore_v2.tfl` が、上記構造を網羅した
最小サンプルです（入力 2 / Clean / Join / フィルタ / 出力）。v1→v2 では計算式・結合タイプ・
出力先・空ステップ追加などの差分があり、リンターと差分機能の確認に使えます。

---

## 7. 解析を壊さないための原則（再掲）

1. キー名は **複数候補 + 大文字小文字無視**（`getField`）で取得する。
2. 入れ子の深さを前提にしない。**ツリー全体を `deepCollect`** で探索する。
3. 取得できない値は黙って欠落させ、例外で全体を止めない（防御的）。
4. 性能のため探索には上限を設ける。
