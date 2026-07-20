import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import {
  createDynamicStoreService,
  listDynamicStoreServiceRows,
  rowToSellerService,
} from "@/lib/services/store-service-persistence";
import {
  getErrorMessage,
  parseSellerServiceRequest,
  type ValidationContext,
} from "@/app/api/seller/services/validation";
import { requireSellerAuth } from "@/lib/seller/session";

function logValidationError(
  action: string,
  context: ValidationContext,
  error: unknown,
) {
  console.warn(
    "[seller-services] Validation failed",
    JSON.stringify({
      action,
      slug: context.slug,
      normalizedStatus: context.normalizedStatus,
      normalizedSourceType: context.normalizedSourceType,
      normalizedMethod: context.normalizedMethod,
      price: context.price,
      error: getErrorMessage(error),
    }),
  );
}

export async function GET() {
  const { services, warning } = await listDynamicStoreServiceRows();

  return NextResponse.json({
    services: services.map(rowToSellerService),
    ...(warning ? { warning } : {}),
  });
}

export async function POST(request: Request) {
  const authReject = requireSellerAuth(request);
  if (authReject) return authReject;

  const parsed = await parseSellerServiceRequest(request, { isCreation: true });
  if ("error" in parsed) {
    logValidationError("create", parsed.context, parsed.error);
    return NextResponse.json({ error: parsed.error }, { status: parsed.status });
  }

  try {
    const service = await createDynamicStoreService(parsed.input);
    revalidatePath("/store");
    revalidatePath(`/store/${service.slug}`);
    revalidatePath("/api/store/services");
    return NextResponse.json({ service }, { status: 201 });
  } catch (error) {
    const message = getErrorMessage(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
