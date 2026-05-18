import { NextResponse } from "next/server";
import {
  createDynamicStoreService,
  listDynamicStoreServiceRows,
  rowToSellerService,
} from "@/lib/services/store-service-persistence";
import { parseSellerServiceRequest } from "@/app/api/seller/services/validation";

export async function GET() {
  const { services, warning } = await listDynamicStoreServiceRows();

  return NextResponse.json({
    services: services.map(rowToSellerService),
    ...(warning ? { warning } : {}),
  });
}

export async function POST(request: Request) {
  const parsed = await parseSellerServiceRequest(request);
  if ("error" in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: parsed.status });
  }

  try {
    const service = await createDynamicStoreService(parsed.input);
    return NextResponse.json({ service }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
