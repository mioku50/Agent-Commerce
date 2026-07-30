/**
 * Copyright 2026 Circle Internet Group, Inc. All rights reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { BRAND } from "@/lib/brand";
import { sellerAddress, withGateway } from "@/lib/x402";

const PRICE_USDC = "0.0020";
const ENDPOINT = "/api/provider/api-quality-finalizer";

function validPendingReport(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const report = value as Record<string, unknown>;
  if (
    report.kind === "api_quality_report" ||
    report.kind === "paid_api_quality" ||
    report.workflow === "paid_api_quality"
  ) {
    return true;
  }
  if (Array.isArray(report.targetServices) || typeof report.reportId === "string") {
    return true;
  }
  return false;
}

const handler = async (request: NextRequest) => {
  const body = (await request.json().catch(() => ({}))) as {
    report?: unknown;
    targetServices?: string[];
  };

  const report = body.report ?? body;

  if (!validPendingReport(report)) {
    return NextResponse.json(
      {
        error: "A valid API Quality Report payload or target services list is required.",
        code: "invalid_api_quality_report",
      },
      { status: 400 },
    );
  }

  const canonicalString = JSON.stringify(report);
  const reportHash = "0x" + createHash("sha256").update(canonicalString).digest("hex");

  return NextResponse.json(
    {
      report,
      paidAmountUsdc: PRICE_USDC,
      billing: {
        chargedBy: BRAND.name,
        protocol: "x402",
        network: "Arc Testnet",
        purpose: "api_quality_canonical_hash_attestation",
      },
    },
    {
      headers: {
        "X-Veyra-Canonical-Response-Hash": reportHash,
      },
    },
  );
};

export const POST = withGateway(
  handler,
  `$${PRICE_USDC}`,
  ENDPOINT,
  sellerAddress,
  {
    requiredPayer:
      process.env.HOSTED_AGENT_ADDRESS ?? "hosted-payer-not-configured",
    allowCanonicalResponseHash: true,
  },
);
