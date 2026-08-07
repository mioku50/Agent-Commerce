/**
 * Copyright 2026 Circle Internet Group, Inc. All rights reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { NextResponse, type NextRequest } from "next/server";
import { getArcPublicClient, getCanonicalVeyraAgentIdentity } from "@/lib/erc8004/client.ts";
import { fetchLatestReputationSnapshot, fetchReputationEvidenceForAgent } from "@/lib/reputation/db.ts";
import { computeAgentReputation, createReputationSnapshot } from "@/lib/reputation/engine.ts";

export const revalidate = 30;

export async function GET(req: NextRequest, context: { params: Promise<{ agentId: string }> }) {
  const { agentId } = await context.params;
  const publicClient = getArcPublicClient();
  const canonicalIdentity = await getCanonicalVeyraAgentIdentity(publicClient);

  const identity = {
    agentId,
    chainId: 5042002 as const,
    identityRegistry: canonicalIdentity?.registry_address || "0x8004A818BFB912233c491871b3d84c89A494BD9e",
    owner: canonicalIdentity?.owner_address || process.env.VEYRA_EVALUATOR_ATTESTER_ADDRESS || "0x0d2c04580e081e222bbe5bf9818af337e2633eb7",
    metadataUri: canonicalIdentity?.metadata_uri || "https://agent-commerce-six.vercel.app/.well-known/veyra-agent.json",
    verifiedOnchain: Boolean(canonicalIdentity?.agent_id),
  };

  const evidenceList = await fetchReputationEvidenceForAgent(agentId);
  const explanation = computeAgentReputation(identity, evidenceList);
  const snapshot = (await fetchLatestReputationSnapshot(agentId)) || createReputationSnapshot(identity, evidenceList, explanation);

  return NextResponse.json({
    standard: "ERC-8004",
    network: "arc-testnet",
    chainId: 5042002,
    agentId,
    identity,
    trustScore: explanation.trustScore,
    confidence: explanation.confidence,
    coverage: explanation.coverage,
    statusLabel: explanation.statusLabel,
    dimensions: explanation.dimensions,
    topPositiveEvidence: explanation.topPositiveEvidence,
    riskSignals: explanation.riskSignals,
    canonicalHash: snapshot.canonicalHash,
    arcProofTx: snapshot.arcProofTx || null,
    createdAt: snapshot.createdAt,
  }, {
    headers: { "Cache-Control": "public, max-age=30, s-maxage=30" },
  });
}
