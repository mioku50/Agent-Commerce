/**
 * Copyright 2026 Circle Internet Group, Inc. All rights reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { createPublicClient, createWalletClient, http, isAddress, getAddress, keccak256, toBytes, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { arcTestnet } from "viem/chains";
import { proofRegistryAbi } from "../commerce/onchain-proof.ts";
import { fetchReputationEvidenceForAgent, saveReputationSnapshot } from "./db.ts";
import { computeAgentReputation, createReputationSnapshot } from "./engine.ts";
import type { CanonicalAgentIdentity, ReputationSnapshot } from "./types.ts";

const PROOF_REGISTRY_ADDRESS = (process.env.AGENT_COMMERCE_PROOF_REGISTRY_ADDRESS || "0x0db0b8ddc03c3c56c0662b547822e4654167b684") as `0x${string}`;

export async function generateAndSaveReputationSnapshot(
  identity: CanonicalAgentIdentity,
  arcProofTx?: string
): Promise<ReputationSnapshot> {
  const evidenceList = await fetchReputationEvidenceForAgent(identity.agentId);
  const explanation = computeAgentReputation(identity, evidenceList);
  const snapshot = createReputationSnapshot(identity, evidenceList, explanation, arcProofTx);

  await saveReputationSnapshot(snapshot);
  return snapshot;
}

export async function publishReputationSnapshotProofToArc(
  snapshot: ReputationSnapshot,
  identityOwner?: string,
  attesterKeyOverride?: string
): Promise<{ transactionHash: string; blockNumber: number; verifiedOnchain: boolean }> {
  const rpcUrl = process.env.ARC_TESTNET_RPC_URL || "https://rpc.testnet.arc.network";
  const publicClient = createPublicClient({
    chain: arcTestnet,
    transport: http(rpcUrl),
  });

  const receiptId = snapshot.canonicalHash as Hex;
  const serviceHash = keccak256(toBytes("veyra.reputation.snapshot.v1"));
  const buyer = (identityOwner && isAddress(identityOwner) ? getAddress(identityOwner) : getAddress("0x0d2c04580e081e222bbe5bf9818af337e2633eb7")) as `0x${string}`;
  const seller = getAddress("0x0d2c04580e081e222bbe5bf9818af337e2633eb7") as `0x${string}`;
  const amount = BigInt(15000000); // 15 USDC in 6-decimal atomic units
  const requestHash = keccak256(toBytes(snapshot.agentId));
  const responseHash = snapshot.canonicalHash as Hex;

  // 1. Check if proof is already registered onchain
  try {
    const isRegistered = await publicClient.readContract({
      address: PROOF_REGISTRY_ADDRESS,
      abi: proofRegistryAbi,
      functionName: "isRegistered",
      args: [receiptId],
    });

    if (isRegistered) {
      const [, , , , , respHash] = await publicClient.readContract({
        address: PROOF_REGISTRY_ADDRESS,
        abi: proofRegistryAbi,
        functionName: "getProof",
        args: [receiptId],
      });

      let logs: any[] = [];
      try {
        const currentBlock = await publicClient.getBlockNumber();
        const fromBlock = currentBlock > BigInt(9000) ? currentBlock - BigInt(9000) : BigInt(0);
        logs = await publicClient.getLogs({
          address: PROOF_REGISTRY_ADDRESS,
          event: proofRegistryAbi[3],
          args: { receiptId },
          fromBlock,
          toBlock: "latest",
        });
      } catch {
        logs = [];
      }

      const txHash = logs.at(-1)?.transactionHash || snapshot.arcProofTx || receiptId;
      const blockNum = logs.at(-1)?.blockNumber ? Number(logs.at(-1)!.blockNumber) : 0;

      snapshot.arcProofTx = txHash;
      await saveReputationSnapshot(snapshot);

      return {
        transactionHash: txHash,
        blockNumber: blockNum,
        verifiedOnchain: respHash.toLowerCase() === snapshot.canonicalHash.toLowerCase(),
      };
    }
  } catch (err) {
    console.warn("[reputation-proof] Read contract check warning:", err);
  }

  // 2. Register proof onchain if not yet registered
  const privateKey = (
    attesterKeyOverride ||
    process.env.AGENT_COMMERCE_PROOF_ATTESTER_PRIVATE_KEY ||
    process.env.AGENT_COMMERCE_PROOF_OPERATOR_PRIVATE_KEY ||
    process.env.CANARY_DEPLOYER_PRIVATE_KEY ||
    process.env.VEYRA_EVALUATOR_ATTESTER_PRIVATE_KEY ||
    process.env.ERC8183_EVALUATOR_ATTESTER_PRIVATE_KEY ||
    process.env.BUYER_PRIVATE_KEY
  )?.trim() as `0x${string}`;

  if (!privateKey || !/^0x[0-9a-fA-F]{64}$/.test(privateKey)) {
    throw new Error("Missing valid attester private key to register Arc Proof");
  }

  const account = privateKeyToAccount(privateKey);
  const walletClient = createWalletClient({
    account,
    chain: arcTestnet,
    transport: http(rpcUrl),
  });

  try {
    const txHash = await walletClient.writeContract({
      address: PROOF_REGISTRY_ADDRESS,
      abi: proofRegistryAbi,
      functionName: "registerProof",
      args: [receiptId, serviceHash, buyer, seller, amount, requestHash, responseHash],
    });

    const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
    if (receipt.status !== "success") {
      throw new Error(`Proof registration transaction reverted: ${txHash}`);
    }

    snapshot.arcProofTx = txHash;
    await saveReputationSnapshot(snapshot);

    return {
      transactionHash: txHash,
      blockNumber: Number(receipt.blockNumber),
      verifiedOnchain: true,
    };
  } catch (err: any) {
    if (err?.message?.includes("0xa53006da") || err?.message?.includes("DuplicateReceipt")) {
      snapshot.arcProofTx = snapshot.arcProofTx || receiptId;
      await saveReputationSnapshot(snapshot);
      return {
        transactionHash: snapshot.arcProofTx,
        blockNumber: 0,
        verifiedOnchain: true,
      };
    }
    throw err;
  }
}
