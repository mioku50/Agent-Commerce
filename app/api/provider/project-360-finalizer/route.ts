import { NextRequest, NextResponse } from "next/server";
import { BRAND } from "@/lib/brand";
import {
  computeProject360ReportHash,
  project360CanonicalPayload,
  validateProject360ReportPayload,
} from "@/lib/project-360/report";
import { PROJECT_360_FINALIZER_PRICE_USDC } from "@/lib/services/constants";
import { sellerAddress, withGateway } from "@/lib/x402";

const PRICE_USDC = PROJECT_360_FINALIZER_PRICE_USDC;
const ENDPOINT = "/api/provider/project-360-finalizer";

const handler = async (request: NextRequest) => {
  const body = (await request.json().catch(() => ({}))) as { report?: unknown };
  if (!validateProject360ReportPayload(body.report)) {
    return NextResponse.json(
      {
        error: "Invalid Project 360 canonical report payload.",
        code: "invalid_report_payload",
      },
      { status: 400 },
    );
  }
  const canonicalHash = computeProject360ReportHash(body.report);
  return NextResponse.json(
    {
      report: project360CanonicalPayload(body.report),
      canonicalHash,
      canonicalizationVersion: "veyra-canonical-v1",
      paidAmountUsdc: PRICE_USDC,
      billing: {
        chargedBy: BRAND.name,
        protocol: "x402",
        network: "Arc Testnet",
        purpose: "project_360_aggregate_hash_attestation",
      },
    },
    { headers: { "X-Veyra-Canonical-Response-Hash": canonicalHash } },
  );
};

export const POST = withGateway(handler, `$${PRICE_USDC}`, ENDPOINT, sellerAddress, {
  requiredPayer: process.env.HOSTED_AGENT_ADDRESS ?? "hosted-payer-not-configured",
  allowCanonicalResponseHash: true,
});
