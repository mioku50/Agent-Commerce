/**
 * Copyright 2026 Circle Internet Group, Inc.  All rights reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { getAddress, parseUnits, verifyMessage } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import type { HostedPlannerSnapshot } from "../lib/agent/hosted-workflows.ts";
import {
  getHostedWorkflowCheckoutConfig,
  priceHostedWorkflow,
} from "../lib/agent/workflow-pricing.ts";
import {
  sponsoredWorkflowAuthorizationMessage,
  validateHostedWorkflowPaymentEvidence,
} from "../lib/commerce/workflow-checkout.ts";
import { ARC_TESTNET_CHAIN_ID } from "../lib/wallet/arc.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function expectFailure(action: () => unknown, pattern: RegExp, label: string) {
  try {
    action();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    assert(pattern.test(message), `${label} returned an unexpected error: ${message}`);
    return;
  }
  throw new Error(`${label} unexpectedly succeeded.`);
}

const requester = getAddress("0x1111111111111111111111111111111111111111");
const treasury = getAddress("0x2222222222222222222222222222222222222222");

const plan: HostedPlannerSnapshot = {
  version: 3,
  workflowType: "market_context",
  workflowLabel: "Market Context Brief",
  effectiveTask: "Analyze current ETH market context from paid APIs.",
  selectedServices: [],
  skippedServices: [],
  estimatedSpendUsdc: 0.0013,
  remainingBudgetUsdc: 0.0037,
  maxPaidCalls: 3,
  budgetCapUsdc: 0.005,
  aggregationMode: "deterministic_execution_optional_llm",
  aggregationLabel: "Deterministic paid execution with optional FreeModel synthesis",
  inputPreview: "A sufficiently long workflow checkout test input.",
  inputSha256: "a".repeat(64),
  marketSymbol: "ETH/USD",
  warnings: [],
};

async function main() {
  const config = getHostedWorkflowCheckoutConfig({
    SELLER_ADDRESS: treasury,
    HOSTED_WORKFLOW_PLATFORM_FEE_USDC: "0.0007",
    HOSTED_WORKFLOW_MAX_PRICE_USDC: "0.005",
    HOSTED_WORKFLOW_SPONSORED_QUOTA: "2",
    HOSTED_WORKFLOW_QUOTE_EXPIRY_SECONDS: "600",
  });
  const pricing = priceHostedWorkflow(plan, config);
  assert(pricing.estimatedProviderCostUsdc === 0.0013, "Provider cost changed during pricing.");
  assert(pricing.platformFeeUsdc === 0.0007, "Platform fee is incorrect.");
  assert(pricing.listPriceUsdc === 0.002, "Workflow list price is not 0.002 USDC.");
  assert(config.sponsoredQuota === 2, "Sponsored quota configuration is incorrect.");
  assert(config.chainId === ARC_TESTNET_CHAIN_ID, "Checkout is not restricted to Arc Testnet.");

  expectFailure(
    () => priceHostedWorkflow({ ...plan, estimatedSpendUsdc: 0.0044 }, config),
    /exceeds the .* checkout cap/i,
    "Workflow price cap",
  );
  expectFailure(
    () => getHostedWorkflowCheckoutConfig({ SELLER_ADDRESS: treasury, HOSTED_WORKFLOW_SPONSORED_QUOTA: "4" }),
    /integer from 1 to 3/i,
    "Sponsored quota cap",
  );

  const quote = {
    amount_due_usdc: "0.002000",
    requester_wallet: requester,
    treasury_address: treasury,
    created_at: "2026-07-20T11:59:00.000Z",
    expires_at: "2026-07-20T12:10:00.000Z",
  };
  const validTransaction = {
    chainId: ARC_TESTNET_CHAIN_ID,
    from: requester,
    to: treasury,
    value: parseUnits("0.002000", 18),
    input: "0x",
  };
  validateHostedWorkflowPaymentEvidence({
    quote,
    transaction: validTransaction,
    receiptStatus: "success",
    settledAt: "2026-07-20T12:00:00.000Z",
  });
  expectFailure(
    () => validateHostedWorkflowPaymentEvidence({ quote, transaction: { ...validTransaction, value: parseUnits("0.001999", 18) }, receiptStatus: "success", settledAt: "2026-07-20T12:00:00.000Z" }),
    /does not match/i,
    "Underpayment",
  );
  expectFailure(
    () => validateHostedWorkflowPaymentEvidence({ quote, transaction: { ...validTransaction, chainId: 1 }, receiptStatus: "success", settledAt: "2026-07-20T12:00:00.000Z" }),
    /does not match/i,
    "Wrong chain",
  );
  expectFailure(
    () => validateHostedWorkflowPaymentEvidence({ quote, transaction: { ...validTransaction, to: requester }, receiptStatus: "success", settledAt: "2026-07-20T12:00:00.000Z" }),
    /does not match/i,
    "Wrong treasury",
  );
  expectFailure(
    () => validateHostedWorkflowPaymentEvidence({ quote, transaction: { ...validTransaction, input: "0x01" }, receiptStatus: "success", settledAt: "2026-07-20T12:00:00.000Z" }),
    /does not match/i,
    "Unexpected calldata",
  );
  expectFailure(
    () => validateHostedWorkflowPaymentEvidence({ quote, transaction: validTransaction, receiptStatus: "reverted", settledAt: "2026-07-20T12:00:00.000Z" }),
    /reverted/i,
    "Reverted payment",
  );
  expectFailure(
    () => validateHostedWorkflowPaymentEvidence({ quote, transaction: validTransaction, receiptStatus: "success", settledAt: "2026-07-20T11:00:00.000Z" }),
    /does not match/i,
    "Pre-quote payment replay",
  );

  const account = privateKeyToAccount(generatePrivateKey());
  const sponsoredQuote = {
    id: "11111111-2222-4333-8444-555555555555",
    requesterWallet: account.address,
    inputSha256: "b".repeat(64),
    expiresAt: "2026-07-20T12:00:00.000Z",
  };
  const message = sponsoredWorkflowAuthorizationMessage(sponsoredQuote);
  assert(message.includes("No USDC payment is authorized"), "Sponsored signature is not payment-safe.");
  const signature = await account.signMessage({ message });
  assert(
    await verifyMessage({ address: account.address, message, signature }),
    "Sponsored requester signature could not be verified.",
  );
  assert(
    !(await verifyMessage({ address: account.address, message: `${message}\nchanged`, signature })),
    "Sponsored signature was not bound to the immutable authorization message.",
  );

  console.log(
    "[hosted-checkout-test] passed: exact server pricing, budget/quota caps, Arc payment evidence, calldata rejection, and sponsored signature binding",
  );
}

main().catch((error) => {
  console.error(
    `[hosted-checkout-test] failed: ${error instanceof Error ? error.message : "Unknown error"}`,
  );
  process.exitCode = 1;
});
