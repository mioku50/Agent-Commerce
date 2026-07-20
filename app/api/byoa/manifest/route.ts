import { NextRequest, NextResponse } from "next/server";
import { byoaManifest, safeByoaError } from "@/lib/byoa/service";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    return NextResponse.json(byoaManifest(request.nextUrl.origin), {
      headers: { "Cache-Control": "public, max-age=60" },
    });
  } catch (error) {
    return NextResponse.json({ error: safeByoaError(error) }, { status: 503 });
  }
}
