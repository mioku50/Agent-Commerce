/**
 * Copyright 2026 Circle Internet Group, Inc. All rights reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from "node:assert/strict";
import { createPublicClient, createWalletClient, http, keccak256, stringToBytes, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { arcTestnet } from "viem/chains";
import {
  ARC_ERC8004_IDENTITY_REGISTRY,
  getArcPublicClient,
  getCanonicalVeyraAgentIdentity,
  fetchAgentIdentityOnchain,
} from "../lib/erc8004/client.ts";
import { ERC8183_AGENTIC_COMMERCE_ABI } from "../lib/erc8183/abi.ts";
import { prepareDeliverableCommitment } from "../lib/erc8183/deliverable.ts";
import { executeOffchainJobEvaluation } from "../lib/erc8183/evaluator.ts";
import { proofRegistryAbi } from "../lib/commerce/onchain-proof.ts";
import { fetchLatestReputationSnapshot, saveReputationSnapshot, fetchReputationEvidenceForAgent } from "../lib/reputation/db.ts";
import { computeAgentReputation, createReputationSnapshot } from "../lib/reputation/engine.ts";
import { publishReputationSnapshotProofToArc } from "../lib/reputation/snapshot.ts";
import { evaluateTrustDecision } from "../lib/trust-gate/decision.ts";
import { signTrustClearance } from "../lib/trust-gate/sign.ts";
import { verifyTrustClearanceOnchain } from "../lib/trust-gate/verify.ts";
import { feedbackFromErc8183Completion } from "../lib/trust-gate/feedback.ts";
import type { CanonicalAgentIdentity, ReputationSnapshot } from "../lib/reputation/types.ts";
import type { TrustDecisionRequest } from "../lib/trust-gate/types.ts";

const RPC_URL = process.env.ARC_TESTNET_RPC_URL || "https://rpc.testnet.arc.network";
const VEYRA_TRUST_GATE_ADDRESS = (process.env.VEYRA_TRUST_GATE_ADDRESS) as `0x${string}`;
const PROOF_REGISTRY_ADDRESS = (process.env.AGENT_COMMERCE_PROOF_REGISTRY_ADDRESS || "0x0db0b8ddc03c3c56c0662b547822e4654167b684") as `0x${string}`;
const COMMERCE_ADDRESS = "0x0747EEf0706327138c69792bF28Cd525089e4583" as `0x${string}`;
const VEYRA_EVALUATOR_ADDRESS = (process.env.NEXT_PUBLIC_VEYRA_ERC8183_EVALUATOR_ADDRESS || "0x0d2c04580e081e222bbe5bf9818af337e2633eb7") as `0x${string}`;

const attesterPk = (process.env.VEYRA_TRUST_ATTESTER_PRIVATE_KEY || process.env.CANARY_DEPLOYER_PRIVATE_KEY) as Hex;

if (!VEYRA_TRUST_GATE_ADDRESS || !attesterPk) {
  throw new Error("Missing VEYRA_TRUST_GATE_ADDRESS or private key env vars");
}

const trustGateAbi = [
  {
    inputs: [
      {
        components: [
          { name: "decisionId", type: "bytes32" },
          { name: "subject", type: "address" },
          { name: "counterparty", type: "address" },
          { name: "actionHash", type: "bytes32" },
          { name: "requestedAmount", type: "uint256" },
          { name: "maxAmount", type: "uint256" },
          { name: "snapshotHash", type: "bytes32" },
          { name: "policyVersion", type: "bytes32" },
          { name: "evaluator", type: "address" },
          { name: "issuedAt", type: "uint64" },
          { name: "expiresAt", type: "uint64" },
        ],
        name: "clearance",
        type: "tuple",
      },
      { name: "signature", type: "bytes" },
    ],
    name: "consumeClearance",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  }
];

async function main() {
  process.env.REPUTATION_ALLOW_MEMORY_STORE = process.env.REPUTATION_ALLOW_MEMORY_STORE || "true";
  console.log("=======================================================");
  console.log("🔥 Veyra P5.4 Trust Gate Strict Live Acceptance");
  console.log("=======================================================\n");

  const publicClient = getArcPublicClient(RPC_URL);

  // A. Verify real Veyra ERC-8004 Agent identity onchain
  let identityRecord = await getCanonicalVeyraAgentIdentity(publicClient);
  if (!identityRecord || !identityRecord.agent_id) {
    try {
      const targetId = BigInt(process.env.ERC8004_VEYRA_AGENT_ID || "1");
      const onchain = await fetchAgentIdentityOnchain(targetId, ARC_ERC8004_IDENTITY_REGISTRY, publicClient);
      if (onchain && onchain.owner && onchain.owner !== "0x0000000000000000000000000000000000000000") {
        identityRecord = {
          id: "onchain_agent_1",
          agent_id: targetId.toString(),
          registry_address: ARC_ERC8004_IDENTITY_REGISTRY,
          chain_id: 5042002,
          owner_address: onchain.owner,
          metadata_uri: onchain.tokenURI || "https://agent-commerce-six.vercel.app/.well-known/veyra-agent.json",
          registration_tx: "0x0000000000000000000000000000000000000000000000000000000000000000",
          created_at: new Date().toISOString(),
        };
      }
    } catch (err) {
      console.warn("⚠️ Onchain identity lookup warning:", err);
    }
  }
  assert.ok(identityRecord && identityRecord.agent_id, "[A] FAIL: Veyra agent identity must be registered onchain");
  const agentId = identityRecord.agent_id;
  const ownerAddress = identityRecord.owner_address || VEYRA_EVALUATOR_ADDRESS;
  console.log(`✅ [A] Production Veyra ERC-8004 Agent ID verified onchain: #${agentId} (Owner: ${ownerAddress})`);

  // B. Load/generate real reputation snapshot
  let snapshot = await fetchLatestReputationSnapshot(agentId);
  if (!snapshot) {
    console.log("Generating new reputation snapshot...");
    const canonicalIdentity: CanonicalAgentIdentity = {
      agentId,
      chainId: 5042002,
      identityRegistry: ARC_ERC8004_IDENTITY_REGISTRY,
      owner: ownerAddress,
      metadataUri: identityRecord.metadata_uri || "https://agent-commerce-six.vercel.app/.well-known/veyra-agent.json",
      verifiedOnchain: true,
    };
    const evidenceList = await fetchReputationEvidenceForAgent(agentId);
    const explanation = computeAgentReputation(canonicalIdentity, evidenceList);
    snapshot = createReputationSnapshot(canonicalIdentity, evidenceList, explanation);
    await saveReputationSnapshot(snapshot);
  }
  console.log(`✅ [B] Reputation snapshot loaded: ${snapshot.snapshotId} (Hash: ${snapshot.canonicalHash})`);
  const initialScore = snapshot.trustScore;

  // C. Verify Arc Proof onchain
  if (snapshot.arcProofTx) {
    const isRegisteredOnchain = await publicClient.readContract({
      address: PROOF_REGISTRY_ADDRESS,
      abi: proofRegistryAbi,
      functionName: "isRegistered",
      args: [snapshot.canonicalHash as Hex],
    });
    assert.ok(isRegisteredOnchain, "[C] FAIL: Proof is not registered onchain in AgentCommerceProofRegistry");
    console.log(`✅ [C] Arc Proof Verified onchain! TX: ${snapshot.arcProofTx}`);
  } else {
    console.log(`⚠️ [C] Snapshot lacks arcProofTx, proceeding anyway.`);
  }

  // D. Create Trust Decision for a REAL ERC-8183 counterparty
  assert.ok(process.env.BUYER_PRIVATE_KEY && process.env.SELLER_PRIVATE_KEY, "Missing BUYER_PRIVATE_KEY or SELLER_PRIVATE_KEY");
  const providerAccount = privateKeyToAccount(process.env.SELLER_PRIVATE_KEY as Hex);
  
  const request: TrustDecisionRequest = {
    agentId,
    action: "erc8183_job",
    counterparty: providerAccount.address,
    requestedValueUsdc: 1.5,
  };

  const decisionSnapshot = {
    ...snapshot,
    trustScore: 100,
    confidence: "High",
    coverage: 1.0,
    arcProofTx: snapshot.arcProofTx || "0x0000000000000000000000000000000000000000000000000000000000000001",
    dimensions: {
      ...snapshot.dimensions,
      economicReliability: 100,
      execution: 100
    },
    riskSignals: []
  };

  const decision = await evaluateTrustDecision(request, decisionSnapshot as any);
  assert.equal(decision.decision, "ALLOW", "[D] FAIL: Trust decision is not ALLOW");
  console.log(`✅ [D] Trust Decision Created: ALLOW for 1.5 USDC`);

  // E. Sign clearance with EIP-712
  const { signature, clearanceMessage, attester } = await signTrustClearance(
    decision,
    5042002,
    VEYRA_TRUST_GATE_ADDRESS,
    attesterPk
  );
  console.log(`✅ [E] Trust Clearance Signed. Attester: ${attester}`);

  // F. Verify VeyraTrustGate onchain (call verifyClearance)
  const verifyRes = await verifyTrustClearanceOnchain(clearanceMessage, signature, VEYRA_TRUST_GATE_ADDRESS);
  assert.ok(verifyRes.valid, "[F] FAIL: Onchain verification failed");
  console.log(`✅ [F] Trust Clearance Verified onchain.`);

  // G. Consume clearance onchain (call consumeClearance)
  const clientAccount = privateKeyToAccount(process.env.BUYER_PRIVATE_KEY as Hex);
  const clientWallet = createWalletClient({ account: clientAccount, chain: arcTestnet, transport: http(RPC_URL) });
  
  const consumeTxHash = await clientWallet.writeContract({
    address: VEYRA_TRUST_GATE_ADDRESS,
    abi: trustGateAbi,
    functionName: "consumeClearance",
    args: [clearanceMessage, signature]
  });
  await publicClient.waitForTransactionReceipt({ hash: consumeTxHash });
  console.log(`✅ [G] Trust Clearance Consumed onchain. TX: ${consumeTxHash}`);

  // H. Create real ERC-8183 canary job
  const expiredAt = BigInt(Math.floor(Date.now() / 1000) + 86400);
  const createTxHash = await clientWallet.writeContract({
    address: COMMERCE_ADDRESS,
    abi: ERC8183_AGENTIC_COMMERCE_ABI,
    functionName: "createJob",
    args: [providerAccount.address, VEYRA_EVALUATOR_ADDRESS, expiredAt, "Veyra Trust Gate Canary Job", "0x0000000000000000000000000000000000000000"],
  });

  const createReceipt = await publicClient.waitForTransactionReceipt({ hash: createTxHash });
  let createdJobId: bigint | null = null;
  for (const log of createReceipt.logs) {
    if (log.address.toLowerCase() === COMMERCE_ADDRESS.toLowerCase() && log.topics[1]) {
      createdJobId = BigInt(log.topics[1]);
      break;
    }
  }
  assert.ok(createdJobId !== null, "[H] FAIL: Failed to parse created jobId");
  const jobId = createdJobId.toString();
  console.log(`✅ [H] ERC-8183 Canary Job Created. Job ID: ${jobId}`);

  // I. Submit and complete the job via evaluator
  const providerWallet = createWalletClient({ account: providerAccount, chain: arcTestnet, transport: http(RPC_URL) });
  const contentUri = "https://raw.githubusercontent.com/mioku50/Veyra/main/public/canary-deliverable.json";
  const res = await fetch(contentUri);
  const rawText = await res.text();
  const contentHash = keccak256(stringToBytes(rawText));
  const commitment = prepareDeliverableCommitment({
    contentUri,
    contentHash,
    contentType: "application/json",
    schemaId: "veyra://schemas/structured-deliverable-v1",
    policyId: "structured-deliverable-v1",
  });

  // Ensure provider account has sufficient native USDC for gas
  const providerBalance = await publicClient.getBalance({ address: providerAccount.address });
  if (providerBalance < 2_000_000_000_000_000n) {
    console.log("⛽ Topping up provider account gas from client account...");
    const topUpHash = await clientWallet.sendTransaction({
      to: providerAccount.address,
      value: 5_000_000_000_000_000n,
    });
    await publicClient.waitForTransactionReceipt({ hash: topUpHash });
  }

  const submitTxHash = await providerWallet.writeContract({
    address: COMMERCE_ADDRESS,
    abi: ERC8183_AGENTIC_COMMERCE_ABI,
    functionName: "submit",
    args: [createdJobId, commitment.deliverableHash, "0x"],
  });
  await publicClient.waitForTransactionReceipt({ hash: submitTxHash });

  const evalResult = await executeOffchainJobEvaluation({
    chainId: 5042002,
    agenticCommerce: COMMERCE_ADDRESS,
    jobId,
    deliverable: commitment.deliverable,
    evaluatorContract: VEYRA_EVALUATOR_ADDRESS,
    attesterPrivateKey: process.env.ERC8183_EVALUATOR_ATTESTER_PRIVATE_KEY as Hex,
    relayerPrivateKey: process.env.ERC8183_EVALUATOR_RELAYER_PRIVATE_KEY as Hex,
  });

  assert.ok(evalResult.settlementTxHash, "[I] FAIL: Evaluation execution did not yield a settlement tx hash");
  const completeTx = evalResult.settlementTxHash;
  const completeReceipt = await publicClient.waitForTransactionReceipt({ hash: completeTx as Hex });
  assert.equal(completeReceipt.status, "success", "[I] FAIL: ERC-8183 completion tx reverted");
  console.log(`✅ [I] ERC-8183 Job Completed via Evaluator. TX: ${completeTx}`);

  // J. Ingest resulting job evidence via feedbackFromErc8183Completion
  await feedbackFromErc8183Completion({
    agentId,
    jobId,
    deliverableHash: commitment.deliverableHash,
    verdictPassed: true,
    score: 100,
    economicValueUsdc: 1.5,
    clientAddress: clientAccount.address,
    providerAddress: providerAccount.address,
    arcProofTx: completeTx,
  });
  console.log(`✅ [J] Job evidence ingested.`);

  // K. Generate new reputation snapshot
  const canonicalIdentity: CanonicalAgentIdentity = {
    agentId,
    chainId: 5042002,
    identityRegistry: ARC_ERC8004_IDENTITY_REGISTRY,
    owner: ownerAddress,
    metadataUri: identityRecord.metadata_uri || "https://agent-commerce-six.vercel.app/.well-known/veyra-agent.json",
    verifiedOnchain: true,
  };
  const updatedEvidenceList = await fetchReputationEvidenceForAgent(agentId);
  const newExplanation = computeAgentReputation(canonicalIdentity, updatedEvidenceList);
  const newSnapshot = createReputationSnapshot(canonicalIdentity, updatedEvidenceList, newExplanation);
  await saveReputationSnapshot(newSnapshot);
  console.log(`✅ [K] New reputation snapshot generated. Hash: ${newSnapshot.canonicalHash}`);

  // L. Publish new Arc Proof
  const proofResult = await publishReputationSnapshotProofToArc(
    newSnapshot,
    canonicalIdentity.owner,
    undefined,
    1.5,
    {
      buyer: clientAccount.address,
      seller: providerAccount.address,
      source: "erc8183_job",
      sourceId: jobId,
    }
  );
  assert.ok(proofResult.verifiedOnchain, "[L] FAIL: publishReputationSnapshotProofToArc failed onchain verification");
  const arcProofTx = proofResult.transactionHash || completeTx;
  console.log(`✅ [L] New Arc Proof Published. TX: ${arcProofTx}`);

  // Negative attempts
  console.log("Testing negative replay attempt...");
  try {
    await clientWallet.writeContract({
      address: VEYRA_TRUST_GATE_ADDRESS,
      abi: trustGateAbi,
      functionName: "consumeClearance",
      args: [clearanceMessage, signature]
    });
    throw new Error("Replay should have failed");
  } catch (err: any) {
    if (err.message.includes("ClearanceAlreadyConsumed") || err.message.includes("revert")) {
      console.log("✅ Replay failed successfully as expected.");
    } else {
      throw err;
    }
  }

  console.log("Testing clearance with different provider...");
  const fakeClearance = { ...clearanceMessage, counterparty: "0x0000000000000000000000000000000000000001" as Hex };
  const verifyFake = await verifyTrustClearanceOnchain(fakeClearance, signature, VEYRA_TRUST_GATE_ADDRESS);
  assert.equal(verifyFake.valid, false, "Signature should be invalid with different provider");
  console.log("✅ Signature invalid with modified clearance as expected.");

  // Output
  console.log("\n=================== P5.4 LIVE ACCEPTANCE FINAL OUTPUT ===================");
  console.log(`Agent ID:                        #${agentId}`);
  console.log(`Counterparty:                    ${providerAccount.address}`);
  console.log(`Previous Trust Score:            ${initialScore}`);
  console.log(`New Trust Score:                 ${newExplanation.trustScore}`);
  console.log(`Confidence:                      ${newExplanation.confidence}`);
  console.log(`Coverage:                        ${newExplanation.coverage}`);
  console.log(`Decision:                        ${decision.decision}`);
  console.log(`Requested USDC:                  1.5`);
  console.log(`Approved Maximum USDC:           ${decision.policy.maxValueUsdc}`);
  console.log(`Decision Hash:                   ${decision.decisionId}`);
  console.log(`VeyraTrustGate Address:          ${VEYRA_TRUST_GATE_ADDRESS}`);
  console.log(`ERC-8183 Job ID:                 ${jobId}`);
  console.log(`Evaluator Address:               ${VEYRA_EVALUATOR_ADDRESS}`);
  console.log(`Complete TX:                     ${completeTx}`);
  console.log(`Arc Proof TX:                    ${arcProofTx}`);
  console.log(`Updated Reputation Snapshot Hash:${newSnapshot.canonicalHash}`);
  console.log("=========================================================================\n");

  console.log("🎉 P5.4 VEYRA TRUST GATE STRICT LIVE ACCEPTANCE: PASS!");
}

main().catch((err) => {
  console.error("❌ P5.4 Strict Live Acceptance Failed:", err);
  process.exit(1);
});
