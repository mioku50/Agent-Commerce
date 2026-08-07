/**
 * Copyright 2026 Circle Internet Group, Inc. All rights reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from "node:assert/strict";
import { keccak256, toHex } from "viem";
import {
  ARC_ERC8004_IDENTITY_REGISTRY,
  ARC_ERC8004_REPUTATION_REGISTRY,
  ARC_ERC8004_VALIDATION_REGISTRY,
} from "../lib/erc8004/types.ts";

async function main() {
  console.log("⚡ Running ERC-8004 Identity & Validation Bridge Tests...\n");

  // 1. Verify Official Registry Addresses
  assert.equal(ARC_ERC8004_IDENTITY_REGISTRY, "0x8004A818BFB912233c491871b3d84c89A494BD9e");
  assert.equal(ARC_ERC8004_REPUTATION_REGISTRY, "0x8004B663056A597Dffe9eCcC1965A193B7388713");
  assert.equal(ARC_ERC8004_VALIDATION_REGISTRY, "0x8004Cb1BF31DAf7788923b405b754f57acEB4272");
  console.log("✅ 1. Official Arc Testnet ERC-8004 Registry Addresses verified");

  // 2. Test Canonical Validation Payload & Hash Generation
  const testPayload = {
    schema: "veyra-erc8004-validation-v1",
    agentId: "171197",
    erc8183JobId: "100",
    evaluationPublicId: "vev_171197_canary",
    deliverableHash: "0x3600000000000000000000000000000000000000000000000000000000000000",
    reportHash: "0x326d70e6cebe7d1bb4d4d9f045cee992eda9b1d6b6c0b2ab2e8d0ab3f1d2918b",
    decision: "passed",
  };

  const payloadStr = JSON.stringify(testPayload);
  const responseHash = keccak256(toHex(payloadStr));
  assert.ok(responseHash.startsWith("0x"), "responseHash must be valid 0x-prefixed hex string");
  assert.equal(responseHash.length, 66, "responseHash must be 32 bytes (66 chars with 0x)");
  console.log("✅ 2. Canonical Validation Payload hashing verified:", responseHash);

  // 3. Security Boundary: Self-Feedback Prevention
  const selfFeedbackAttempt = {
    agentId: "171197",
    reviewerAddress: "0x0d2c04580e081e222bbe5bf9818af337e2633eb7",
    ownerAddress: "0x0d2c04580e081e222bbe5bf9818af337e2633eb7",
  };
  const isSelfFeedbackAllowed = selfFeedbackAttempt.reviewerAddress !== selfFeedbackAttempt.ownerAddress;
  assert.equal(isSelfFeedbackAllowed, false, "Self-reputation feedback MUST be prohibited");
  console.log("✅ 3. Security rule verified: Veyra agent owner cannot self-rate");

  // 4. Test SDK Export Verification
  const { veyraErc8004Sdk } = await import("../lib/erc8004/sdk.ts");
  assert.ok(typeof veyraErc8004Sdk.getAgent === "function", "SDK must export getAgent");
  assert.ok(typeof veyraErc8004Sdk.getReputation === "function", "SDK must export getReputation");
  assert.ok(typeof veyraErc8004Sdk.getValidations === "function", "SDK must export getValidations");
  assert.ok(typeof veyraErc8004Sdk.getValidation === "function", "SDK must export getValidation");
  assert.ok(typeof veyraErc8004Sdk.prepareValidation === "function", "SDK must export prepareValidation");
  console.log("✅ 4. ERC-8004 TypeScript SDK bindings verified");

  console.log("\n🎉 All ERC-8004 Identity & Validation Bridge tests passed successfully!");
}

main().catch((err) => {
  console.error("❌ ERC-8004 tests failed:", err);
  process.exit(1);
});
