/**
 * Copyright 2026 Circle Internet Group, Inc. All rights reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { NextResponse } from "next/server";
import { createWalletClient, http, parseAbi } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { arcTestnet } from "viem/chains";
import { ARC_ERC8004_VALIDATION_REGISTRY, getArcPublicClient } from "@/lib/erc8004/client.ts";
import { getByoaClient } from "@/lib/byoa/service.ts";

export async function POST(request: Request) {
  const authHeader = request.headers.get("authorization");
  const expectedSecret = process.env.BYOA_MANAGEMENT_SESSION_SECRET || process.env.VEYRA_RELAYER_KEY;

  // Verify authentication header
  if (expectedSecret && authHeader !== `Bearer ${expectedSecret}`) {
    return NextResponse.json({ error: "Unauthorized submission context" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { requestHash, response: responseScore, responseURI, responseHash, tag, evaluationPublicId, agentId } = body;

    if (!requestHash || !responseHash || responseScore === undefined) {
      return NextResponse.json({ error: "Missing required validation payload parameters" }, { status: 400 });
    }

    const privateKey = process.env.VEYRA_EVALUATOR_RELAYER_PRIVATE_KEY || process.env.VEYRA_EVALUATOR_ATTESTER_PRIVATE_KEY;
    if (!privateKey || !privateKey.startsWith("0x")) {
      return NextResponse.json({ error: "Relayer private key not configured on server" }, { status: 500 });
    }

    const account = privateKeyToAccount(privateKey as `0x${string}`);
    const walletClient = createWalletClient({
      account,
      chain: arcTestnet,
      transport: http(process.env.ARC_TESTNET_RPC_URL || "https://rpc.testnet.arc.network"),
    });

    const registryAddress = (process.env.ERC8004_VALIDATION_REGISTRY || ARC_ERC8004_VALIDATION_REGISTRY) as `0x${string}`;
    const abi = parseAbi([
      "function validationResponse(bytes32 requestHash, uint8 response, string responseURI, bytes32 responseHash, string tag)"
    ]);

    const txHash = await walletClient.writeContract({
      address: registryAddress,
      abi,
      functionName: "validationResponse",
      args: [requestHash as `0x${string}`, responseScore, responseURI || "", responseHash as `0x${string}`, tag || "veyra_erc8183_deliverable_passed"],
    });

    const publicClient = getArcPublicClient();
    const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash, timeout: 25_000 });

    // Store link in database
    try {
      const supabase = getByoaClient();
      await supabase.from("erc8004_validation_links").upsert({
        request_hash: requestHash,
        agent_id: agentId || "unspecified",
        evaluation_public_id: evaluationPublicId || null,
        canonical_report_hash: responseHash,
        response: responseScore,
        response_hash: responseHash,
        response_tx: txHash,
        tag: tag || "veyra_erc8183_deliverable_passed",
        status: receipt.status === "success" ? "confirmed" : "failed",
        created_at: new Date().toISOString(),
        confirmed_at: new Date().toISOString(),
      }, { onConflict: "request_hash" });
    } catch (dbErr) {
      console.warn("Failed to update erc8004_validation_links in DB:", dbErr);
    }

    return NextResponse.json({
      success: receipt.status === "success",
      requestHash,
      responseScore,
      responseHash,
      txHash,
      blockNumber: receipt.blockNumber.toString(),
      arcscanUrl: `https://testnet.arcscan.app/tx/${txHash}`,
    });
  } catch (err: any) {
    console.error("Validation response submission failed:", err);
    return NextResponse.json(
      { error: err.message || "Failed to submit validationResponse onchain" },
      { status: 500 }
    );
  }
}
