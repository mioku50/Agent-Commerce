import { NextResponse } from "next/server";
import { BRAND } from "@/lib/brand";

type Context = { params: Promise<{ mode: string }> };

export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: Context) {
  const { mode } = await params;
  if (mode !== "success" && mode !== "retry") {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  const eventType = request.headers.get("veyra-event-type");
  const eventId = request.headers.get("veyra-event-id");
  const timestamp = request.headers.get("veyra-timestamp");
  const signature = request.headers.get("veyra-signature");
  const userAgent = request.headers.get("user-agent");
  const body = (await request.json().catch(() => null)) as {
    id?: string;
    type?: string;
    data?: { message?: string };
  } | null;
  const validEnvelope =
    eventType === "test" &&
    eventId?.startsWith("evt_test_") &&
    eventId === body?.id &&
    body?.type === "test" &&
    body.data?.message === `${BRAND.name} webhook connection verified.` &&
    /^\d{10}$/.test(timestamp ?? "") &&
    /^v1=[0-9a-f]{64}(,v1=[0-9a-f]{64})?$/.test(signature ?? "") &&
    userAgent === `${BRAND.name}-Webhooks/1.0`;
  if (!validEnvelope) {
    return NextResponse.json({ error: "Invalid webhook envelope." }, { status: 400 });
  }
  return mode === "success"
    ? new NextResponse(null, { status: 204 })
    : NextResponse.json({ accepted: false }, { status: 503 });
}
