import { evaluateTrustDecision } from "../lib/trust-gate/decision.ts";
import { signTrustClearance } from "../lib/trust-gate/sign.ts";
import { verifyTrustClearanceOffchain, verifyTrustClearanceOnchain } from "../lib/trust-gate/verify.ts";
import { getTrustGateEip712Domain } from "../lib/trust-gate/sign.ts";
import assert from "node:assert";

process.env.VEYRA_TRUST_ATTESTER_PRIVATE_KEY = "0x0123456789012345678901234567890123456789012345678901234567890123";
process.env.NEXT_PUBLIC_VEYRA_ERC8183_EVALUATOR_ADDRESS = "0x1cD66BCd4FCB73a079c05635840Fde029Ce6BEbB";

async function runTests() {
  console.log("Running Trust Gate API / Service Tests...");

  // 1. Evaluate Trust Decision directly
  const decision = await evaluateTrustDecision({
    subjectAgentId: "test-agent-123",
    action: "erc8183_job",
    requestedValueUsdc: 0.1
  }, null);
  
  assert(decision, "Should return a decision");
  assert(decision.decisionId, "Decision should have an ID");
  
  let clearanceMessage;
  let signature;

  if (["ALLOW", "ALLOW_WITH_LIMITS", "REQUIRE_EVALUATOR"].includes(decision.decision)) {
    const privateKey = process.env.VEYRA_TRUST_ATTESTER_PRIVATE_KEY;
    const chainId = 5042002;
    const contractAddr = process.env.NEXT_PUBLIC_VEYRA_ERC8183_EVALUATOR_ADDRESS as `0x${string}`;

    if (privateKey && contractAddr) {
      const signed = await signTrustClearance(
        decision, 
        chainId, 
        contractAddr, 
        privateKey as `0x${string}`
      );
      clearanceMessage = signed.clearanceMessage;
      signature = signed.signature;
    }
  } else {
      console.warn("Decision is", decision.decision, "No clearance signed");
  }

  // 2. verify flow
  if (clearanceMessage && signature) {
    const chainId = 5042002;
    const contractAddr = process.env.NEXT_PUBLIC_VEYRA_ERC8183_EVALUATOR_ADDRESS as `0x${string}`;
    const domain = getTrustGateEip712Domain(chainId, contractAddr);

    const offchainResult = await verifyTrustClearanceOffchain(clearanceMessage, signature, domain);
    assert.strictEqual(offchainResult.valid, true, "Signature should be valid offchain");
  } else {
    console.warn("Skipping verify test: no clearance/signature returned for decision.");
  }

  console.log("All Trust Gate Service tests passed!");
}

runTests().catch(err => {
  console.error("Test failed:", err);
  process.exit(1);
});
