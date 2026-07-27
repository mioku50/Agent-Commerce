import { revalidatePath } from "next/cache.js";
import { NextRequest, NextResponse } from "next/server.js";
import { requireOwnerSession, byoaErrorResponse } from "../../../../../lib/byoa/http.ts";
import {
  archiveSellerService,
  getOwnedSellerService,
  updateSellerService,
  type SellerServiceInput,
} from "../../../../../lib/seller/marketplace.ts";

type RouteContext = { params: Promise<{ id: string }> };

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, { params }: RouteContext) {
  try {
    const session = requireOwnerSession(request);
    const { id } = await params;
    const service = await getOwnedSellerService(session.wallet, id);
    if (!service) return NextResponse.json({ error: "Service not found" }, { status: 404 });
    return NextResponse.json({ service }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return byoaErrorResponse(error);
  }
}

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  try {
    const session = requireOwnerSession(request);
    const { id } = await params;
    const body = await request.json() as SellerServiceInput;
    const service = await updateSellerService(session.wallet, id, body);
    if (!service) return NextResponse.json({ error: "Service not found" }, { status: 404 });
    revalidatePath("/");
    revalidatePath("/agent-runner");
    revalidatePath("/console/seller");
    return NextResponse.json({ service }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to update seller service.";
    if (/session|required/i.test(message)) return byoaErrorResponse(error);
    return NextResponse.json({ error: message }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }
}

export async function DELETE(request: NextRequest, { params }: RouteContext) {
  try {
    const session = requireOwnerSession(request);
    const { id } = await params;
    if (!await archiveSellerService(session.wallet, id)) {
      return NextResponse.json({ error: "Service not found" }, { status: 404 });
    }
    revalidatePath("/");
    revalidatePath("/agent-runner");
    revalidatePath("/console/seller");
    return NextResponse.json({ archived: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return byoaErrorResponse(error);
  }
}
