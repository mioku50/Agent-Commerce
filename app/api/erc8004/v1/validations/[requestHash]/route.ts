/**
 * Copyright 2026 Circle Internet Group, Inc. All rights reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { NextResponse } from "next/server";
import { getByoaClient } from "@/lib/byoa/service.ts";
import { fetchValidationStatusOnchain } from "@/lib/erc8004/client.ts";
import type { Erc8004ValidationLinkRecord } from "@/lib/erc8004/types.ts";

export const revalidate = 15;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ requestHash: string }> }
) {
  const { requestHash } = await params;
  if (!requestHash || !requestHash.startsWith("0x")) {
    return NextResponse.json({ error: "Invalid requestHash format" }, { status: 400 });
  }

  let dbRecord: Erc8004ValidationLinkRecord | null = null;
  try {
    const supabase = getByoaClient();
    const { data } = await supabase
      .from("erc8004_validation_links")
      .select("*")
      .eq("request_hash", requestHash)
      .maybeSingle();

    if (data) {
      dbRecord = data as Erc8004ValidationLinkRecord;
    }
  } catch (err) {
    console.error("Failed to fetch validation link from DB:", err);
  }

  let onchainStatus = null;
  try {
    onchainStatus = await fetchValidationStatusOnchain(requestHash as `0x${string}`);
  } catch (err) {
    console.warn(`Validation request ${requestHash} not found onchain yet:`, err);
  }

  if (!dbRecord && !onchainStatus) {
    return NextResponse.json({ error: "Validation request not found" }, { status: 404 });
  }

  return NextResponse.json(
    {
      requestHash,
      record: dbRecord,
      onchain: onchainStatus
        ? {
            validatorAddress: onchainStatus.validatorAddress,
            agentId: onchainStatus.agentId.toString(),
            response: onchainStatus.response,
            responseHash: onchainStatus.responseHash,
            tag: onchainStatus.tag,
            lastUpdate: onchainStatus.lastUpdate.toString(),
          }
        : null,
    },
    { headers: { "Cache-Control": "public, max-age=15, s-maxage=15" } }
  );
}
