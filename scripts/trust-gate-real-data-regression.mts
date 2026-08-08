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
  /decisionSnapshot/,
  /0x([0-9a-f])\1{63}/i, // repeated-byte hashes like 0x111...
  /registration_tx["']?\s*:\s*["']0x/i, // literal fabricated registration_tx
  /arcProofTx["']?\s*:\s*["']0x/i, // literal fabricated arcProofTx
  /decisionId["']?\s*:\s*["']0x/i, // literal fabricated decisionId
  /owner(Address)?\s*\|\|\s*VEYRA_EVALUATOR_ADDRESS/i, // owner || evaluator fallback
  /score:\s*100/i, // hardcoded score: 100
  /(?!.*\bDelta = 0\b.*)"Confirmed Job Created = false"/s // this last regex might be hard in JS without multiline tricks, maybe better to check logic in acceptance script directly, but let's just add it as a string check.
];

let failed = false;
for (const pattern of patterns) {
  if (pattern.test(content)) {
    // Exception for the "Confirmed Job Created = false" if it has deltas.
    if (pattern.toString().includes("Delta = 0") && content.includes("Delta = 0") && content.includes("Confirmed Job Created = false")) {
      // skip
    } else {
      console.error(`❌ Cheat pattern detected in trust-gate-live-acceptance.mts: ${pattern}`);
      failed = true;
    }
  }
}

if (!content.includes("Delta = 0") && content.includes("Confirmed Job Created = false")) {
  console.error(`❌ Cheat pattern detected: "Confirmed Job Created = false" without preceding delta assertion`);
  failed = true;
}

if (failed) {
  process.exit(1);
} else {
  console.log("✅ No cheat patterns detected.");
}
