import { createHash } from "node:crypto";

export type PublicTrustStatus = {
  profileId: string;
  score: number | null;
  status: string | null;
  verifiedOnArc: boolean;
  lastCheckedAt: string | null;
  profileUrl: string;
};

export function trustStatusEtag(status: PublicTrustStatus) {
  return `"${createHash("sha256")
    .update(JSON.stringify(status))
    .digest("base64url")
    .slice(0, 32)}"`;
}

export function publicTrustCacheHeaders(status: PublicTrustStatus) {
  return {
    "Cache-Control": "public, max-age=0, must-revalidate",
    ETag: trustStatusEtag(status),
    ...(status.lastCheckedAt
      ? { "Last-Modified": new Date(status.lastCheckedAt).toUTCString() }
      : {}),
  };
}

export function statusLabel(status: string | null) {
  const labels: Record<string, string> = {
    strong_signals: "Strong signals",
    review_recommended: "Review recommended",
    high_attention: "High attention",
    limited_data: "Limited data",
  };
  return status ? labels[status] ?? status.replaceAll("_", " ") : "Awaiting check";
}

export function freshnessLabel(lastCheckedAt: string | null, now = Date.now()) {
  if (!lastCheckedAt) return "not checked";
  const days = Math.max(
    0,
    Math.floor((now - Date.parse(lastCheckedAt)) / (24 * 60 * 60 * 1_000)),
  );
  if (days === 0) return "checked today";
  if (days === 1) return "checked 1d ago";
  return `checked ${days}d ago`;
}
