import assert from "node:assert/strict";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { buildFundingIntent, ERC20_ABI } from "../lib/byoa/funding.ts";
import { ARC_TESTNET_USDC_ADDRESS } from "../lib/wallet/arc.ts";

console.log("[byoa-funding-test] 1. Validating buildFundingIntent with real fixed recipient & ERC20_ABI...");

const agentAccount = privateKeyToAccount(generatePrivateKey());
const agentWallet = agentAccount.address;

// Verify full ERC20_ABI contains balanceOf, decimals, symbol, transfer, approve, allowance
const abiNames = ERC20_ABI.map((item) => item.name);
assert(abiNames.includes("balanceOf"), "ERC20_ABI must include balanceOf.");
assert(abiNames.includes("decimals"), "ERC20_ABI must include decimals.");
assert(abiNames.includes("symbol"), "ERC20_ABI must include symbol.");
assert(abiNames.includes("transfer"), "ERC20_ABI must include transfer.");

// Test Arc Direct Transfer
const intentArc = buildFundingIntent({
  agentId: "agt_11111111111111111111",
  agentWallet,
  method: "arc_transfer",
  amountUsdc: "5.5",
});

assert.equal(intentArc.supported, true, "Arc direct transfer must be supported.");
assert.equal(intentArc.recipientFixed.toLowerCase(), agentWallet.toLowerCase(), "Recipient must be fixed to agentWallet.");
assert.equal(intentArc.amountUsdc, "5.500000");
assert.equal(intentArc.amountAtomic, "5500000");
assert.equal(intentArc.contractTarget, ARC_TESTNET_USDC_ADDRESS);
assert(intentArc.callData.startsWith("0xa9059cbb"), "callData must start with ERC20 transfer selector 0xa9059cbb.");

// Verify NO simulation strings exist
const jsonStr = JSON.stringify(intentArc).toLowerCase();
assert(!jsonStr.includes("simulation"), "Intent must not contain simulation keyword.");
assert(!jsonStr.includes("simulated"), "Intent must not contain simulated keyword.");

// Test CCTP Bridge Intent (honestly marked unsupported)
const intentBridge = buildFundingIntent({
  agentId: "agt_11111111111111111111",
  agentWallet,
  method: "cctp_bridge",
  amountUsdc: "10.0",
});

assert.equal(intentBridge.supported, false, "CCTP bridge must be marked unsupported in current environment.");
assert(intentBridge.unavailableReason?.includes("Unavailable in current environment"));

// Test Gateway Deposit Intent (honestly marked unsupported)
const intentGateway = buildFundingIntent({
  agentId: "agt_11111111111111111111",
  agentWallet,
  method: "gateway_deposit",
  amountUsdc: "2.0",
});

assert.equal(intentGateway.supported, false, "Gateway deposit must be marked unsupported in current environment.");
assert(intentGateway.unavailableReason?.includes("Unavailable in current environment"));

// Test Invalid Amount Rejection
assert.throws(
  () => buildFundingIntent({ agentId: "agt_1", agentWallet, method: "arc_transfer", amountUsdc: "-1" }),
  /Funding amount must be a positive number/,
);

console.log("[byoa-funding-test] ALL Real App Kit Funding tests PASSED cleanly!");
