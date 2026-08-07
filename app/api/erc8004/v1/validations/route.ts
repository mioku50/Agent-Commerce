/**
 * Copyright 2026 Circle Internet Group, Inc. All rights reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { NextResponse } from "next/server";
import { getByoaClient } from "@/lib/byoa/service.ts";
import type { Erc8004ValidationLinkRecord } from "@/lib/erc8004/types.ts";

export const revalidate = 15;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");
  const limit = Math.min(100, parseInt(searchParams.get("limit") || "20", 10));

  let validations: Erc8004ValidationLinkRecord[] = [];

  try {
    const supabase = getByoaClient();
    let query = supabase.from("erc8004_validation_links").select("*");
    if (status) {
      query = query.eq("status", status);
    }
    const { data } = await query.order("created_at", { ascending: false }).limit(limit);

    if (data) {
      validations = data as Erc8004ValidationLinkRecord[];
    }
  } catch (err) {
    console.error("Failed to query erc8004_validation_links:", err);
  }

  return NextResponse.json(
    { count: validations.length, validations },
    { headers: { "Cache-Control": "public, max-age=15, s-maxage=15" } }
  );
}
