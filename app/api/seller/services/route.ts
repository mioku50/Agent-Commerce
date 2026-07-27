import { revalidatePath } from "next/cache.js";
import { NextRequest, NextResponse } from "next/server.js";
import { requireOwnerSession, byoaErrorResponse } from "../../../../lib/byoa/http.ts";
import {
  createSellerService,
  listSellerServices,
  type SellerServiceInput,
} from "../../../../lib/seller/marketplace.ts";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const session = requireOwnerSession(request);
    return NextResponse.json(
      { services: await listSellerServices(session.wallet) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return byoaErrorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = requireOwnerSession(request);
    const body = await request.json() as SellerServiceInput;
    const service = await createSellerService(session.wallet, body);
    revalidatePath("/");
    revalidatePath("/agent-runner");
    revalidatePath("/console/seller");
    return NextResponse.json({ service }, {
      status: 201,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to create seller service.";
    if (/session|required/i.test(message)) return byoaErrorResponse(error);
    return NextResponse.json({ error: message }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }
}
