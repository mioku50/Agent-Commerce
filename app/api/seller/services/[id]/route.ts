import { NextResponse } from "next/server";
import {
  getDynamicStoreServiceRowById,
  rowToSellerService,
  updateDynamicStoreService,
} from "@/lib/services/store-service-persistence";
import { parseSellerServiceRequest } from "@/app/api/seller/services/validation";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function GET(_request: Request, { params }: RouteContext) {
  const { id } = await params;
  const row = await getDynamicStoreServiceRowById(id);

  if (!row) {
    return NextResponse.json({ error: "Service not found" }, { status: 404 });
  }

  return NextResponse.json({ service: rowToSellerService(row) });
}

export async function PATCH(request: Request, { params }: RouteContext) {
  const { id } = await params;
  const parsed = await parseSellerServiceRequest(request);

  if ("error" in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: parsed.status });
  }

  try {
    const service = await updateDynamicStoreService(id, parsed.input);
    return NextResponse.json({ service });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
