import { NextRequest, NextResponse } from "next/server";
import { isProviderError } from "@/lib/providers/errors";
import { getPythMarketPrice } from "@/lib/providers/pyth";
import { withGateway } from "@/lib/x402";

const PRICE_USDC = "0.001";

const handler = async (req: NextRequest) => {
  const body = (await req.json().catch(() => ({}))) as { symbol?: unknown };

  try {
    const result = await getPythMarketPrice(body.symbol);
    return NextResponse.json({
      ...result,
      paidAmountUsdc: PRICE_USDC,
      billing: {
        chargedBy: "Arc Agent Commerce",
        protocol: "x402",
        network: "Arc Testnet",
      },
      attribution:
        "Underlying market data is sourced from Pyth Network. The x402 payment is made to Arc Agent Commerce, not to Pyth Network.",
    });
  } catch (error) {
    if (!isProviderError(error)) throw error;
    console.warn(
      `[provider:pyth] request failed code=${error.code} upstreamStatus=${error.upstreamStatus ?? "none"} retryable=${error.retryable ? "yes" : "no"} upstreamMessage=${JSON.stringify(error.upstreamMessage ?? "none")}`,
    );
    return NextResponse.json(
      {
        error: error.message,
        code: error.code,
        provider: "Pyth Network",
        sourceStatus: "unavailable",
        retryable: error.retryable,
      },
      { status: error.httpStatus },
    );
  }
};

export const POST = withGateway(
  handler,
  `$${PRICE_USDC}`,
  "/api/provider/pyth/price",
);
