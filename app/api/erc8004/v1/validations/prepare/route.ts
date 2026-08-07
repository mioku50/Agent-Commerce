/**
 * Copyright 2026 Circle Internet Group, Inc. All rights reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { NextResponse } from "next/server";
import { keccak256, toHex } from "viem";
import { getByoaClient } from "@/lib/byoa/service.ts";
import type { Erc8183EvaluationRecord } from "@/lib/erc8183/types.ts";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { evaluationPublicId, agentId, requestHash } = body;

    if (!evaluationPublicId || !requestHash || !requestHash.startsWith("0x")) {
      return NextResponse.json(
        { error: "Invalid evaluationPublicId or requestHash parameters" },
        { status: 400 }
      );
    }

    const supabase = getByoaClient();
    const { data: record } = await supabase
      .from("erc8183_evaluations")
      .select("*")
      .eq("public_id", evaluationPublicId)
      .maybeSingle();

    if (!record) {
      return NextResponse.json({ error: "ERC-8183 Evaluation record not found" }, { status: 404 });
    }

    const evaluation = record as Erc8183EvaluationRecord;
    const isPassed = evaluation.decision === "complete" || evaluation.status === "completed";
    const responseScore = isPassed ? 100 : 0;
    const tag = isPassed ? "veyra_erc8183_deliverable_passed" : "veyra_erc8183_deliverable_failed";

    const canonicalPayload = {
      schema: "veyra-erc8004-validation-v1",
      agentId: agentId || "unspecified",
      erc8183JobId: evaluation.job_id,
      evaluationPublicId: evaluation.public_id,
      deliverableHash: evaluation.deliverable_hash,
      reportHash: evaluation.report_hash || "0x0000000000000000000000000000000000000000000000000000000000000000",
      decision: isPassed ? "passed" : "failed",
    };

    const payloadJsonStr = JSON.stringify(canonicalPayload);
    const responseHash = keccak256(toHex(payloadJsonStr));
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://agent-commerce-six.vercel.app";
    const responseURI = `${baseUrl}/evaluations/${evaluation.public_id}`;

    return NextResponse.json({
      requestHash,
      agentId: canonicalPayload.agentId,
      evaluationPublicId: evaluation.public_id,
      response: responseScore,
      responseHash,
      responseURI,
      tag,
      canonicalPayload,
    });
  } catch (err: any) {
    console.error("Failed to prepare ERC-8004 validation response:", err);
    return NextResponse.json(
      { error: err.message || "Failed to prepare validation response" },
      { status: 500 }
    );
  }
}
