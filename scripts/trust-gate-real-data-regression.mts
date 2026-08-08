import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const currentFile = fileURLToPath(import.meta.url);
const scriptsDir = path.dirname(currentFile);
const repositoryRoot = path.resolve(scriptsDir, "..");
const acceptancePath = path.join(scriptsDir, "trust-gate-live-acceptance.mts");
const reputationAcceptancePath = path.join(scriptsDir, "reputation-live-acceptance.mts");
const adapterPath = path.join(repositoryRoot, "lib/reputation/erc8183-adapter.ts");
const ingestPath = path.join(repositoryRoot, "lib/reputation/ingest.ts");

const acceptance = fs.readFileSync(acceptancePath, "utf8");
const reputationAcceptance = fs.readFileSync(reputationAcceptancePath, "utf8");
const adapter = fs.readFileSync(adapterPath, "utf8");
const ingest = fs.readFileSync(ingestPath, "utf8");

const forbidden: Array<{ label: string; pattern: RegExp }> = [
  { label: "assumed blocked-path zero", pattern: /assumed\s+0/i },
  { label: "mock clearance counter", pattern: /consumedClearances\s*:\s*0/ },
  { label: "requested value reused as evidence", pattern: /evidenceEconomicValue\s*=\s*requestedUsdc/ },
  { label: "requested value renamed as settlement", pattern: /actualSettledValueUsdc\s*=\s*requestedUsdc/ },
  { label: "settled amount sourced from request", pattern: /settled\s+amount[^\n]*requestedUsdc/i },
  { label: "fabricated registration transaction", pattern: /registration_tx["']?\s*:\s*["']0x0{64}/i },
  { label: "fabricated Arc proof transaction", pattern: /arcProofTx["']?\s*:\s*["']0x0{64}/i },
  { label: "repeated-byte placeholder hash", pattern: /0x([0-9a-f])\1{63}/i },
  { label: "memory-store production override", pattern: /REPUTATION_ALLOW_MEMORY_STORE\s*=\s*["']true["']/ },
];

for (const [fileName, source] of [
  [path.basename(acceptancePath), acceptance],
  [path.basename(reputationAcceptancePath), reputationAcceptance],
] as const) {
  for (const rule of forbidden) {
    assert.equal(
      rule.pattern.test(source),
      false,
      `Anti-cheat V3: ${rule.label} in ${fileName}`,
    );
  }
}

const metricRules = [
  {
    metric: "DB Job Delta",
    query: "countHostedJobsForBuyer",
    assertion: "assert.equal(blocked.dbJobDelta, 0",
    output: 'console.log("DB Job Delta = 0")',
  },
  {
    metric: "DB Payment Delta",
    query: "countPaymentEvents",
    assertion: "assert.equal(blocked.dbPaymentDelta, 0",
    output: 'console.log("DB Payment Delta = 0")',
  },
  {
    metric: "x402 Settlement Delta",
    query: "countX402Settlements",
    assertion: "assert.equal(blocked.x402SettlementDelta, 0",
    output: 'console.log("x402 Settlement Delta = 0")',
  },
  {
    metric: "ERC-8183 JobCreated Delta",
    query: "queryMatchingJobCreatedEvents",
    assertion: "assert.equal(blocked.jobCreatedDelta, 0",
    output: 'console.log("ERC-8183 JobCreated Delta = 0")',
  },
  {
    metric: "Clearance Consumption Delta",
    query: "readClearanceConsumption",
    assertion: "assert.equal(blocked.clearanceConsumptionDelta, 0",
    output: 'console.log("Clearance Consumption Delta = 0")',
  },
] as const;

for (const rule of metricRules) {
  const queryIndex = acceptance.indexOf(rule.query);
  const assertionIndex = acceptance.indexOf(rule.assertion);
  const outputIndex = acceptance.indexOf(rule.output);
  assert.ok(queryIndex >= 0, `Anti-cheat V3: ${rule.metric} has no real query`);
  assert.ok(assertionIndex > queryIndex, `Anti-cheat V3: ${rule.metric} has no post-query assertion`);
  assert.ok(outputIndex > assertionIndex, `Anti-cheat V3: ${rule.metric} is printed before its assertion`);
}

assert.match(
  acceptance,
  /actualSettledValueUsdc\s*=\s*deriveSettledErc8183ValueUsdc\s*\(/,
  "Anti-cheat V3: actual settlement must come from the canonical ERC-8183 adapter",
);
assert.match(
  acceptance,
  /economicValueUsdc:\s*actualSettledValueUsdc/,
  "Anti-cheat V3: reputation evidence must receive actual settlement value",
);
assert.match(
  acceptance,
  /deriveReputationScoreFromEvaluation\(evaluation\)/,
  "Anti-cheat V3: live acceptance must consume the canonical evaluation score",
);
assert.match(adapter, /status === "completed" && evaluation\.decision === "complete"/);
assert.match(adapter, /status === "rejected" && evaluation\.decision === "reject"/);
assert.doesNotMatch(
  ingest,
  /verdictPassed\s*\?\s*100\s*:\s*0/,
  "Anti-cheat V3: score policy must not fall back inside generic ingestion",
);

console.log("trust-gate real-data regression: PASS (Anti-cheat V3)");
