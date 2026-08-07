/**
 * Copyright 2026 Circle Internet Group, Inc. All rights reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from "node:assert/strict";
import { createWalletClient, http, parseAbi } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { arcTestnet } from "viem/chains";
import {
  ARC_ERC8004_IDENTITY_REGISTRY,
  fetchAgentIdentityOnchain,
  getArcPublicClient,
  recoverAgentIdFromLogs,
} from "../lib/erc8004/client.ts";
import { getByoaClient } from "../lib/byoa/service.ts";

async function main() {
  console.log("🔥 Running Veyra ERC-8004 Identity Registration & Recovery...\n");

  const privateKey = process.env.VEYRA_EVALUATOR_RELAYER_PRIVATE_KEY || process.env.VEYRA_EVALUATOR_ATTESTER_PRIVATE_KEY;
  if (!privateKey || !privateKey.startsWith("0x")) {
    console.error("❌ Missing valid private key for registration (VEYRA_EVALUATOR_RELAYER_PRIVATE_KEY)");
    process.exit(1);
  }

  const account = privateKeyToAccount(privateKey as `0x${string}`);
  const ownerAddress = account.address;
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://agent-commerce-six.vercel.app";
  const metadataUri = `${baseUrl}/.well-known/veyra-agent.json`;
  const registryAddress = (process.env.ERC8004_IDENTITY_REGISTRY || ARC_ERC8004_IDENTITY_REGISTRY) as `0x${string}`;

  console.log("Registry Address:", registryAddress);
  console.log("Owner Address:", ownerAddress);
  console.log("Metadata URI:", metadataUri);

  const publicClient = getArcPublicClient();
  const walletClient = createWalletClient({
    account,
    chain: arcTestnet,
    transport: http(process.env.ARC_TESTNET_RPC_URL || "https://rpc.testnet.arc.network"),
  });

  // Check if identity already registered for this owner
  let agentId = await recoverAgentIdFromLogs(ownerAddress, registryAddress, publicClient);
  let txHash = "0x0000000000000000000000000000000000000000000000000000000000000000";

  if (agentId) {
    console.log(`ℹ️ Agent ID already registered for owner ${ownerAddress}: #${agentId}`);
  } else {
    console.log("⚡ Submitting IdentityRegistry.register(metadataURI)...");
    const abi = parseAbi(["function register(string metadataURI) returns (uint256 tokenId)"]);
    txHash = await walletClient.writeContract({
      address: registryAddress,
      abi,
      functionName: "register",
      args: [metadataUri],
    });

    console.log(`Transaction submitted: ${txHash}`);
    console.log("Waiting for block confirmation on Arc Testnet...");
    const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash, timeout: 30_000 });
    assert.equal(receipt.status, "success", "Identity registration transaction reverted");

    // Recover minted agentId from Transfer event
    agentId = await recoverAgentIdFromLogs(ownerAddress, registryAddress, publicClient);
    assert.ok(agentId, "Failed to recover minted agentId from Transfer events");
    console.log(`🎉 Successfully minted ERC-8004 Agent ID #${agentId}`);
  }

  // Verify ownerOf and tokenURI onchain
  console.log(`🔍 Verifying ownerOf(#${agentId}) and tokenURI(#${agentId})...`);
  const onchainData = await fetchAgentIdentityOnchain(BigInt(agentId), registryAddress, publicClient);
  assert.equal(
    onchainData.owner.toLowerCase(),
    ownerAddress.toLowerCase(),
    "Onchain ownerOf does not match registration account"
  );
  console.log("✅ Onchain ownerOf verified:", onchainData.owner);
  console.log("✅ Onchain tokenURI verified:", onchainData.tokenURI);

  // Save to Supabase database
  try {
    const supabase = getByoaClient();
    const { error } = await supabase.from("erc8004_agent_identity").upsert(
      {
        agent_id: agentId,
        registry_address: registryAddress,
        chain_id: 5042002,
        owner_address: ownerAddress,
        metadata_uri: metadataUri,
        registration_tx: txHash,
        created_at: new Date().toISOString(),
      },
      { onConflict: "agent_id" }
    );

    if (error) {
      console.warn("⚠️ Supabase record upsert warning:", error.message);
    } else {
      console.log("✅ Database record updated in erc8004_agent_identity");
    }
  } catch (err) {
    console.warn("⚠️ DB record save skipped:", err);
  }

  console.log("\n=======================================================");
  console.log(`ERC-8004 Agent ID: ${agentId}`);
  console.log(`Identity Registry: ${registryAddress}`);
  console.log(`Owner Address: ${ownerAddress}`);
  console.log(`Metadata URI: ${metadataUri}`);
  console.log(`Registration TX: ${txHash}`);
  console.log(`Arcscan Link: https://testnet.arcscan.app/tx/${txHash}`);
  console.log("=======================================================\n");
}

main().catch((err) => {
  console.error("❌ Identity Registration & Recovery failed:", err);
  process.exit(1);
});
