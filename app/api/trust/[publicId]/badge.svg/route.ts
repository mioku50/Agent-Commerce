import { NextResponse } from "next/server";
import { BRAND } from "@/lib/brand";
import { getPublicTrustStatus, TrustMonitoringError } from "@/lib/monitoring/service";
import {
  freshnessLabel,
  publicTrustCacheHeaders,
  statusLabel,
  trustStatusEtag,
} from "@/lib/monitoring/public-status";

type Context = { params: Promise<{ publicId: string }> };
type BadgeVariant = "score" | "status" | "arc";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function escapeXml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function variant(value: string | null): BadgeVariant {
  return value === "status" || value === "arc" ? value : "score";
}

function color(input: {
  variant: BadgeVariant;
  status: string | null;
  verifiedOnArc: boolean;
}) {
  if (input.variant === "arc") return input.verifiedOnArc ? "#16845b" : "#6b7280";
  if (input.status === "strong_signals") return "#16845b";
  if (input.status === "high_attention") return "#b42318";
  if (input.status === "review_recommended") return "#b7791f";
  return "#5b6472";
}

function badgeSvg(input: {
  variant: BadgeVariant;
  score: number | null;
  status: string | null;
  verifiedOnArc: boolean;
  lastCheckedAt: string | null;
}) {
  const left =
    input.variant === "score" ? `${BRAND.name} Trust` : BRAND.name;
  const main =
    input.variant === "score"
      ? String(input.score ?? "—")
      : input.variant === "status"
        ? statusLabel(input.status)
        : input.verifiedOnArc
          ? "Arc verified"
          : "Arc pending";
  const freshness = freshnessLabel(input.lastCheckedAt);
  const leftWidth = Math.max(76, left.length * 7 + 20);
  const mainWidth = Math.max(42, main.length * 7 + 20);
  const freshWidth = Math.max(78, freshness.length * 6 + 18);
  const width = leftWidth + mainWidth + freshWidth;
  const leftCenter = leftWidth / 2;
  const mainCenter = leftWidth + mainWidth / 2;
  const freshCenter = leftWidth + mainWidth + freshWidth / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="20" role="img" aria-label="${escapeXml(`${left}: ${main}, ${freshness}`)}">
  <title>${escapeXml(`${left}: ${main}, ${freshness}`)}</title>
  <linearGradient id="s" x2="0" y2="100%"><stop offset="0" stop-color="#fff" stop-opacity=".14"/><stop offset="1" stop-opacity=".08"/></linearGradient>
  <clipPath id="r"><rect width="${width}" height="20" rx="4"/></clipPath>
  <g clip-path="url(#r)">
    <rect width="${leftWidth}" height="20" fill="#171a21"/>
    <rect x="${leftWidth}" width="${mainWidth}" height="20" fill="${color(input)}"/>
    <rect x="${leftWidth + mainWidth}" width="${freshWidth}" height="20" fill="#343a46"/>
    <rect width="${width}" height="20" fill="url(#s)"/>
  </g>
  <g fill="#fff" text-anchor="middle" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" font-size="11">
    <text x="${leftCenter}" y="14">${escapeXml(left)}</text>
    <text x="${mainCenter}" y="14" font-weight="600">${escapeXml(main)}</text>
    <text x="${freshCenter}" y="14">${escapeXml(freshness)}</text>
  </g>
</svg>`;
}

export async function GET(request: Request, { params }: Context) {
  try {
    const { publicId } = await params;
    const status = await getPublicTrustStatus(publicId);
    const selected = variant(new URL(request.url).searchParams.get("variant"));
    const etag = `"${trustStatusEtag(status).slice(1, -1)}-${selected}"`;
    const headers = {
      ...publicTrustCacheHeaders(status),
      ETag: etag,
      "Content-Type": "image/svg+xml; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'",
    };
    if (request.headers.get("if-none-match") === etag) {
      return new NextResponse(null, { status: 304, headers });
    }
    return new NextResponse(badgeSvg({ ...status, variant: selected }), {
      status: 200,
      headers,
    });
  } catch (error) {
    if (error instanceof TrustMonitoringError && error.status === 404) {
      return NextResponse.json(
        {
          error: {
            code: "watchlist_not_found",
            message: "Trust profile not found.",
            retryable: false,
          },
        },
        { status: 404, headers: { "Cache-Control": "no-store" } },
      );
    }
    return NextResponse.json(
      {
        error: {
          code: "monitoring_unavailable",
          message: "Trust profile is temporarily unavailable.",
          retryable: true,
        },
      },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
