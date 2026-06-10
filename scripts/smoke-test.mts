import { readFileSync } from "node:fs";
import { parseFlowDocument } from "../utils/tflParser.ts";
import { lintFlow, summarizeAlerts } from "../utils/tflLinter.ts";
import { diffFlows, diffWords } from "../utils/tflDiff.ts";

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
