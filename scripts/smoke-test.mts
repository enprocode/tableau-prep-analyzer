import { readFileSync, statSync } from "node:fs";
import {
  assertUploadSizeAllowed,
  formatByteSize,
  FLOW_FILE_LIMITS,
  parseFlowDocument,
  parseFlowFile,
} from "../utils/tflParser.ts";
import { lintFlow, summarizeAlerts } from "../utils/tflLinter.ts";
import { diffFlows, diffWords } from "../utils/tflDiff.ts";

console.log("=== FILE SIZE LIMITS ===");
console.log("limits", {
  maxUpload: formatByteSize(FLOW_FILE_LIMITS.maxUploadBytes),
  maxFlowJson: formatByteSize(FLOW_FILE_LIMITS.maxFlowJsonBytes),
  maxZipEntries: FLOW_FILE_LIMITS.maxZipEntries,
});
assertUploadSizeAllowed(1024);
try {
  assertUploadSizeAllowed(FLOW_FILE_LIMITS.maxUploadBytes + 1);
  throw new Error("FAIL: 上限超過を検知できませんでした");
} catch (e) {
  if ((e as Error).message.includes("FAIL:")) throw e;
  console.log("OK: アップロード上限超過を拒否:", (e as Error).message);
}

// サンプル .tfl が現実的なサイズで読めること
const samplePath = "public/samples/superstore_v1.tfl";
const sampleStat = statSync(samplePath);
const sampleFile = new File([readFileSync(samplePath)], "superstore_v1.tfl", {
  type: "application/json",
});
const sampleParsed = await parseFlowFile(sampleFile);
if (Object.keys(sampleParsed.nodes).length === 0) {
  throw new Error("FAIL: サンプルのパースに失敗しました");
}
console.log(
  "OK: サンプルを parseFlowFile で読込",
  sampleStat.size,
  "bytes,",
  Object.keys(sampleParsed.nodes).length,
  "nodes"
);

// 巨大な偽 File はサイズチェックで即拒否（中身は読まない）
const huge = new File([new Uint8Array(0)], "huge.tfl", {
  type: "application/json",
});
Object.defineProperty(huge, "size", {
  value: FLOW_FILE_LIMITS.maxUploadBytes + 10,
});
try {
  await parseFlowFile(huge);
  throw new Error("FAIL: 巨大ファイルを拒否できませんでした");
} catch (e) {
  if ((e as Error).message.includes("FAIL:")) throw e;
  console.log("OK: 巨大 File を拒否:", (e as Error).message);
}

const v1 = parseFlowDocument(
  JSON.parse(readFileSync("public/samples/superstore_v1.tfl", "utf8"))
);
v1.fileName = "superstore_v1.tfl";
const v2 = parseFlowDocument(
  JSON.parse(readFileSync("public/samples/superstore_v2.tfl", "utf8"))
);
v2.fileName = "superstore_v2.tfl";

console.log("=== LINT v1 ===");
const alerts = lintFlow(v1);
console.log("summary", summarizeAlerts(alerts));
for (const a of alerts) console.log(`- [${a.severity}] ${a.message}`);

console.log("\n=== LINT v2 ===");
const alerts2 = lintFlow(v2);
console.log("summary", summarizeAlerts(alerts2));
for (const a of alerts2) console.log(`- [${a.severity}] ${a.message}`);

console.log("\n=== DIFF v1 -> v2 ===");
const diff = diffFlows(v1, v2);
console.log("summary", diff.summary);
for (const s of diff.steps) {
  if (s.status === "unchanged") continue;
  console.log(`- [${s.status}] ${s.name}`);
  for (const c of s.changes) {
    console.log(`    * ${c.label}: ${c.before ?? "∅"} => ${c.after ?? "∅"}`);
  }
}

console.log("\n=== WORD DIFF ===");
console.log(diffWords("[Profit] / [Sales]", "([Profit] / [Sales]) * 100"));

console.log("\n=== TOPOLOGY-ONLY DIFF (same IDs, rewired edges) ===");
// v1 を複製し、ノードの中身は一切変えずに接続だけを張り替える
const rewired = parseFlowDocument(
  JSON.parse(readFileSync("public/samples/superstore_v1.tfl", "utf8"))
);
rewired.fileName = "superstore_v1_rewired.tfl";
// Clean Orders -> Join だったものを Clean Orders -> 出力直前ステップ へ張り替え
const edge = rewired.connections.find(
  (c) => c.source === "n-clean-orders" && c.target === "n-join"
)!;
edge.target = "n-clean-after-join";
edge.id = "n-clean-orders->n-clean-after-join";

const topoDiff = diffFlows(v1, rewired);
console.log("summary", topoDiff.summary);
console.log(
  "connection changes:",
  topoDiff.connections.map((c) => `${c.kind} ${c.sourceName} -> ${c.targetName}`)
);
const modifiedSteps = topoDiff.steps
  .filter((s) => s.status === "modified")
  .map((s) => `${s.name}: ${s.changes.map((c) => c.label).join(", ")}`);
console.log("modified steps:", modifiedSteps);
if (topoDiff.connections.length === 0) {
  throw new Error("FAIL: トポロジー変更が検知されませんでした");
}
console.log("OK: トポロジー変更を検知しました");
