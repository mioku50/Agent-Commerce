import { ImageResponse } from "next/og";
import { BRAND } from "@/lib/brand";
import { notFound } from "next/navigation";
import { getPublicTrustProfile, TrustMonitoringError } from "@/lib/monitoring/service";

export const alt = `${BRAND.name} Trust Profile`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function TrustProfileOpenGraphImage({
  params,
}: {
  params: Promise<{ publicId: string }>;
}) {
  const { publicId } = await params;
  let data: Awaited<ReturnType<typeof getPublicTrustProfile>>;
  try {
    data = await getPublicTrustProfile(publicId);
  } catch (error) {
    if (error instanceof TrustMonitoringError && error.status === 404) notFound();
    throw error;
  }
  const verifiedDate = data.profile.lastVerifiedOnArcAt
    ? new Intl.DateTimeFormat("en", {
        month: "short",
        day: "numeric",
        year: "numeric",
      }).format(new Date(data.profile.lastVerifiedOnArcAt))
    : "Pending";
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#070b12",
          color: "#f8fafc",
          padding: "68px",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "18px", fontSize: 34, fontWeight: 700 }}>
            <div style={{ display: "flex", width: 54, height: 54, borderRadius: 14, background: "#3974ff", alignItems: "center", justifyContent: "center" }}>V</div>
            Veyra Trust Profile
          </div>
          <div
            style={{
              display: "flex",
              color: data.profile.lastVerifiedOnArcAt ? "#5eead4" : "#94a3b8",
              fontSize: 24,
            }}
          >
            {data.profile.lastVerifiedOnArcAt
              ? "● Arc Testnet verified"
              : "○ Arc verification pending"}
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
          <div style={{ display: "flex", fontSize: 55, fontWeight: 750, maxWidth: 980 }}>
            {data.profile.name}
          </div>
          <div style={{ display: "flex", alignItems: "flex-end", gap: "28px" }}>
            <div style={{ display: "flex", fontSize: 118, lineHeight: 1, fontWeight: 800 }}>
              {data.profile.currentScore ?? "—"}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "10px", paddingBottom: "8px" }}>
              <div style={{ display: "flex", fontSize: 30 }}>Trust Score</div>
              <div style={{ display: "flex", fontSize: 24, color: "#94a3b8", textTransform: "capitalize" }}>
                {data.profile.trustStatus?.replaceAll("_", " ") ?? "Awaiting baseline"}
              </div>
            </div>
          </div>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", color: "#94a3b8", fontSize: 23 }}>
          <div style={{ display: "flex" }}>Last verified on Arc: {verifiedDate}</div>
          <div style={{ display: "flex", fontFamily: "monospace" }}>{data.profile.id}</div>
        </div>
      </div>
    ),
    size,
  );
}
