import { NextRequest, NextResponse } from "next/server";
import { BRAND } from "@/lib/brand";
import { computeCanonicalReportHash, stripInternalKeys } from "@/lib/reports/canonical-report-hash";
import { ARC_CONTRACT_ANALYSIS_FINALIZER_PRICE_USDC } from "@/lib/services/constants";
import { sellerAddress, withGateway } from "@/lib/x402";

const PRICE_USDC = ARC_CONTRACT_ANALYSIS_FINALIZER_PRICE_USDC;
const ENDPOINT = "/api/provider/arc-contract-analysis-finalizer";

function validReport(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const report = value as Record<string, unknown>;
  return (
    report.kind === "arc_contract_analysis" &&
    report.workflowType === "arc_contract_analysis" &&
    typeof report.reportId === "string" &&
    /^0x[0-9a-fA-F]{40}$/.test(String(report.targetContract ?? "")) &&
    report.snapshot !== null &&
    typeof report.snapshot === "object" &&
    (report.score === null ||
      (typeof report.score === "number" && report.score >= 0 && report.score <= 100))
  );
}

const handler = async (request: NextRequest) => {
  const body = (await request.json().catch(() => ({}))) as { report?: unknown };
  if (!validReport(body.report)) {
    return NextResponse.json(
      { error: "Invalid Arc contract analysis payload.", code: "invalid_report_payload" },
      { status: 400 },
    );
  }
  const report = stripInternalKeys(body.report) as Record<string, unknown>;
  const { canonicalHash, canonicalizationVersion } = computeCanonicalReportHash(report);
  return NextResponse.json(
    {
      report,
      canonicalHash,
      canonicalizationVersion,
      paidAmountUsdc: PRICE_USDC,
      billing: {
        chargedBy: BRAND.name,
        protocol: "x402",
        network: "Arc Testnet",
        purpose: "arc_contract_analysis_child_hash",
      },
    },
    { headers: { "X-Veyra-Canonical-Response-Hash": canonicalHash } },
  );
};

export const POST = withGateway(handler, `$${PRICE_USDC}`, ENDPOINT, sellerAddress, {
  requiredPayer: process.env.HOSTED_AGENT_ADDRESS ?? "hosted-payer-not-configured",
  allowCanonicalResponseHash: true,
});
