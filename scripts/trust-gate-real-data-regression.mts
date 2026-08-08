import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const targetFile = path.join(__dirname, "trust-gate-live-acceptance.mts");
const content = fs.readFileSync(targetFile, "utf-8");

const patterns = [
  /trustScore:\s*100/,
  /coverage:\s*1/,
  /confidence:\s*["']High["']/,
  /riskSignals:\s*\[\]/,
  /REPUTATION_ALLOW_MEMORY_STORE\s*=\s*["']true["']/,
  /0x0000000000000000000000000000000000000000000000000000000000000001/,
  /0x0000000000000000000000000000000000000000000000000000000000000000/,
  /decisionSnapshot/
];

let failed = false;
for (const pattern of patterns) {
  if (pattern.test(content)) {
    console.error(`❌ Cheat pattern detected in trust-gate-live-acceptance.mts: ${pattern}`);
    failed = true;
  }
}

if (failed) {
  process.exit(1);
} else {
  console.log("✅ No cheat patterns detected.");
}
