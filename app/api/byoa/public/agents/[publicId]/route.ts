import { NextResponse } from "next/server";
import { byoaErrorResponse } from "@/lib/byoa/http";
import { getPublicAgentPassport } from "@/lib/byoa/service";

type Context = { params: Promise<{ publicId: string }> };
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: Context) {
  try {
    const { publicId } = await params;
    return NextResponse.json(await getPublicAgentPassport(publicId), {
      headers: { "Cache-Control": "public, max-age=30" },
    });
  } catch (error) {
    return byoaErrorResponse(error);
  }
}
