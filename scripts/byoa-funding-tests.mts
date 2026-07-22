import assert from "node:assert/strict";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { buildFundingIntent, type FundingIntent } from "../lib/byoa/funding.ts";
import { ARC_TESTNET_USDC_ADDRESS } from "../lib/wallet/arc.ts";

console.log("[byoa-funding-test] 1. Validating buildFundingIntent with fixed recipient...");

const agentAccount = privateKeyToAccount(generatePrivateKey());
const agentWallet = agentAccount.address;

// Test Arc Direct Transfer
const intentArc = buildFundingIntent({
  agentId: "agt_11111111111111111111",
  agentWallet,
  method: "arc_transfer",
  amountUsdc: "5.5",
});

assert.equal(intentArc.recipientFixed.toLowerCase(), agentWallet.toLowerCase(), "Recipient must be fixed to agentWallet.");
assert.equal(intentArc.amountUsdc, "5.500000");
assert.equal(intentArc.amountAtomic, "5500000");
assert.equal(intentArc.contractTarget, ARC_TESTNET_USDC_ADDRESS);
assert(intentArc.callData.startsWith("0xa9059cbb"), "callData must start with ERC20 transfer selector 0xa9059cbb.");

// Test CCTP Bridge Intent
const intentBridge = buildFundingIntent({
  agentId: "agt_11111111111111111111",
  agentWallet,
  method: "cctp_bridge",
  amountUsdc: "10.0",
});

assert.equal(intentBridge.recipientFixed.toLowerCase(), agentWallet.toLowerCase());
assert.equal(intentBridge.destinationChain, "Arc Testnet (Domain 26)");

// Test Gateway Deposit Intent
const intentGateway = buildFundingIntent({
  agentId: "agt_11111111111111111111",
  agentWallet,
  method: "gateway_deposit",
  amountUsdc: "2.0",
});

assert.equal(intentGateway.recipientFixed.toLowerCase(), agentWallet.toLowerCase());
assert.equal(intentGateway.destinationChain, "Gateway Nanopayments Pool");

// Test Invalid Amount Rejection
assert.throws(
  () => buildFundingIntent({ agentId: "agt_1", agentWallet, method: "arc_transfer", amountUsdc: "-1" }),
  /Funding amount must be a positive number/,
);

assert.throws(
  () => buildFundingIntent({ agentId: "agt_1", agentWallet, method: "arc_transfer", amountUsdc: "invalid" }),
  /Funding amount must be a positive number/,
);

console.log("[byoa-funding-test] ALL Funding Service tests PASSED cleanly!");
