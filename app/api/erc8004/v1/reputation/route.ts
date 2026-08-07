/**
 * Copyright 2026 Circle Internet Group, Inc. All rights reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { NextResponse } from "next/server";
import { getVeyraAgentIdentityRecord } from "@/lib/erc8004/client.ts";
import type { Erc8004ReputationSummary } from "@/lib/erc8004/types.ts";

export const revalidate = 30;

export async function GET() {
  const identityRecord = await getVeyraAgentIdentityRecord();
  const agentId = identityRecord?.agent_id || "unregistered";

  const reputationSummary: Erc8004ReputationSummary = {
    agentId,
    totalFeedbackCount: 0,
    independentReviewersCount: 0,
    evidenceLinkedCount: 0,
    unlinkedCount: 0,
    recentFeedback: [],
  };

  return NextResponse.json(reputationSummary, {
    headers: { "Cache-Control": "public, max-age=30, s-maxage=30" },
  });
}
