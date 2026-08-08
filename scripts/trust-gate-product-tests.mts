import fs from "fs";
import path from "path";
import { feedbackFromErc8183Completion, feedbackFromX402Settlement } from "../lib/trust-gate/feedback.ts";

async function runTests() {
  console.log("Running trust-gate product tests...");
  let passed = true;

  // 1. Page file exists
  const pagePath = path.resolve(process.cwd(), "app/trust-gate/page.tsx");
  if (fs.existsSync(pagePath)) {
    console.log("✅ app/trust-gate/page.tsx exists");
  } else {
    console.error("❌ app/trust-gate/page.tsx does not exist");
    passed = false;
  }

  // Override console.log to intercept for dryRun verification
  const originalLog = console.log;
  let logOutput = "";
  console.log = (...args) => {
    const msg = args.map(a => typeof a === 'object' ? JSON.stringify(a) : a).join(" ");
    logOutput += msg + "\n";
    originalLog(...args);
  };

  // 2. feedbackFromErc8183Completion with self-rating
  logOutput = "";
  await feedbackFromErc8183Completion({
    agentId: "agent-123",
    jobId: "job-123",
    outcome: "completed",
    clientAddress: "0x123",
    providerAddress: "0x123",
    deliverableHash: "0xhash",
    completeTx: "0xtx",
  }, true);
  if (logOutput.includes("Skipping feedbackFromErc8183Completion due to self-rating")) {
    originalLog("✅ feedbackFromErc8183Completion skipped for self-rating");
  } else {
    originalLog("❌ feedbackFromErc8183Completion failed to skip for self-rating");
    passed = false;
  }

  // 3. feedbackFromX402Settlement with self-rating
  logOutput = "";
  await feedbackFromX402Settlement({
    agentId: "agent-123",
    paymentId: "pay-123",
    outcome: "settled",
    payerAddress: "0xabc",
    payeeAddress: "0xabc",
    amountUsdc: 10,
  }, true);
  if (logOutput.includes("Skipping feedbackFromX402Settlement due to self-rating")) {
    originalLog("✅ feedbackFromX402Settlement skipped for self-rating");
  } else {
    originalLog("❌ feedbackFromX402Settlement failed to skip for self-rating");
    passed = false;
  }

  // 4. feedbackFromErc8183Completion with valid params
  logOutput = "";
  await feedbackFromErc8183Completion({
    agentId: "agent-123",
    jobId: "job-456",
    outcome: "completed",
    clientAddress: "0x111",
    providerAddress: "0x222",
    deliverableHash: "0xhash2",
    completeTx: "0xtx2",
    economicValueUsdc: 1,
  }, true);
  if (logOutput.includes("Would ingestErc8183JobOutcomeEvidence")) {
    originalLog("✅ feedbackFromErc8183Completion creates evidence for valid inputs");
  } else {
    originalLog("❌ feedbackFromErc8183Completion failed to create evidence");
    passed = false;
  }

  // 5. feedbackFromX402Settlement with valid params
  logOutput = "";
  await feedbackFromX402Settlement({
    agentId: "agent-123",
    paymentId: "pay-456",
    outcome: "settled",
    payerAddress: "0x333",
    payeeAddress: "0x444",
    amountUsdc: 25,
  }, true);
  if (logOutput.includes("Would ingestX402PaymentEvidence")) {
    originalLog("✅ feedbackFromX402Settlement creates evidence for valid inputs");
  } else {
    originalLog("❌ feedbackFromX402Settlement failed to create evidence");
    passed = false;
  }

  console.log = originalLog;

  if (passed) {
    console.log("All tests passed!");
    process.exit(0);
  } else {
    console.error("Some tests failed.");
    process.exit(1);
  }
}

runTests().catch(e => {
  console.error(e);
  process.exit(1);
});
