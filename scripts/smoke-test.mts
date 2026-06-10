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
