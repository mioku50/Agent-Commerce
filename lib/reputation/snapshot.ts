/**
 * Copyright 2026 Circle Internet Group, Inc. All rights reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { fetchReputationEvidenceForAgent, saveReputationSnapshot } from "./db.ts";
import { computeAgentReputation, createReputationSnapshot } from "./engine.ts";
import type { CanonicalAgentIdentity, ReputationSnapshot } from "./types.ts";

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
