import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import {
  getDynamicStoreServiceRowById,
  rowToSellerService,
  updateDynamicStoreService,
} from "@/lib/services/store-service-persistence";
import {
  getErrorMessage,
  parseSellerServiceRequest,
  type ValidationContext,
} from "@/app/api/seller/services/validation";
import { requireSellerAuth } from "@/lib/seller/session";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

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

export async function GET(request: Request, { params }: RouteContext) {
  const authReject = requireSellerAuth(request);
  if (authReject) return authReject;

  const { id } = await params;
  const row = await getDynamicStoreServiceRowById(id);

  if (!row) {
    return NextResponse.json({ error: "Service not found" }, { status: 404 });
  }

  return NextResponse.json({ service: rowToSellerService(row) });
}

export async function PATCH(request: Request, { params }: RouteContext) {
  const authReject = requireSellerAuth(request);
  if (authReject) return authReject;

  const { id } = await params;
  const parsed = await parseSellerServiceRequest(request, { isUpdate: true });

  if ("error" in parsed) {
    logValidationError("update", parsed.context, parsed.error);
    return NextResponse.json({ error: parsed.error }, { status: parsed.status });
  }

  try {
    const service = await updateDynamicStoreService(id, parsed.input);
    revalidatePath("/store");
    revalidatePath(`/store/${service.slug}`);
    revalidatePath("/api/store/services");
    return NextResponse.json({ service });
  } catch (error) {
    const message = getErrorMessage(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
