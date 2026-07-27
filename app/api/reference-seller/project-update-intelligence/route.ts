import { NextRequest, NextResponse } from "next/server";
import { sellerAddress, withGateway } from "@/lib/x402";

const ENDPOINT = "/api/reference-seller/project-update-intelligence";
const REFERENCE_SELLER_WALLET = process.env.REFERENCE_SELLER_WALLET?.trim() || sellerAddress;

function compactSentence(value: string) {
  return value.trim().replace(/\s+/g, " ").slice(0, 400);
}

function sentences(value: string) {
  return value
    .split(/(?<=[.!?])\s+|\n+/)
    .map(compactSentence)
    .filter((sentence) => sentence.length >= 4)
    .slice(0, 30);
}

function select(items: string[], pattern: RegExp, limit: number) {
  return items.filter((item) => pattern.test(item)).slice(0, limit);
}

async function projectUpdateHandler(request: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const projectName = typeof body.projectName === "string" ? body.projectName.trim() : "";
  const updateText = typeof body.updateText === "string" ? body.updateText.trim() : "";
  if (projectName.length < 2 || projectName.length > 120 || updateText.length < 20 || updateText.length > 4_500) {
    return NextResponse.json({ error: "invalid_project_update" }, { status: 400 });
  }

  const items = sentences(updateText);
  const shippingHighlights = select(
    items,
    /\b(ship(?:ped|ping)?|release(?:d)?|launch(?:ed)?|deploy(?:ed)?|deliver(?:ed)?|complete(?:d)?|merge(?:d)?)\b/i,
    5,
  );
  const risks = select(
    items,
    /\b(risk|block(?:ed|er)?|delay(?:ed)?|incident|issue|regression|concern|dependency|uncertain)\b/i,
    5,
  );
  const nextMilestones = select(
    items,
    /\b(next|milestone|plan(?:ned)?|upcoming|will|target|todo|follow[- ]?up)\b/i,
    5,
  );
  const summarySource = items.slice(0, 3).join(" ") || updateText;
  const summary = `${projectName}: ${summarySource}`.slice(0, 900);

  return NextResponse.json({
    summary,
    shippingHighlights,
    risks,
    nextMilestones,
    confidence: items.length >= 3 ? "high" : "medium",
  }, {
    headers: {
      "Cache-Control": "no-store",
      "X-Reference-Seller": "project-update-intelligence",
    },
  });
}

export const POST = withGateway(
  projectUpdateHandler,
  "$0.002",
  ENDPOINT,
  REFERENCE_SELLER_WALLET,
);
