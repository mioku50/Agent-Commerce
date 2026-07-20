import { createHash } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getServerSupabaseConfig } from "../supabase/server-env.ts";

let supabase: SupabaseClient | null = null;

function getClient() {
  const config = getServerSupabaseConfig();
  supabase ??= createClient(config.url, config.key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return supabase;
}

function paymentIdentity(paymentSignature: string) {
  const fingerprint = createHash("sha256").update(paymentSignature).digest("hex");
  let payer = "unknown";
  try {
    const decoded = JSON.parse(Buffer.from(paymentSignature, "base64").toString("utf8")) as {
      payload?: { authorization?: { from?: unknown } };
    };
    if (typeof decoded.payload?.authorization?.from === "string") {
      payer = decoded.payload.authorization.from;
    }
  } catch {
    // The platform payment wrapper already validated the signature. Recovery
    // remains keyed by its hash even if the diagnostic payer cannot be decoded.
  }
  return { fingerprint, payer };
}

export async function issueExternalFulfillmentCredit(input: {
  paymentSignature: string;
  serviceId: string;
  endpoint: string;
  amountUsdc: number;
  reason: string;
}) {
  const { fingerprint, payer } = paymentIdentity(input.paymentSignature);
  let data: { id: string; status: string; amount_usdc: number | string } | null = null;
  let error: { message: string } | null = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const result = await getClient()
      .from("external_fulfillment_credits")
      .upsert({
        payment_fingerprint: fingerprint,
        service_id: input.serviceId,
        endpoint: input.endpoint,
        payer,
        amount_usdc: input.amountUsdc,
        reason: input.reason.slice(0, 500),
        status: "issued",
      }, {
        onConflict: "payment_fingerprint",
        ignoreDuplicates: true,
      })
      .select("id,status,amount_usdc")
      .maybeSingle();
    data = result.data;
    error = result.error;
    if (!error) break;
    if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 250 * 2 ** attempt));
  }
  if (error) throw new Error(`Failed to persist downstream fulfillment credit: ${error.message}`);
  if (data) return data;

  let existing: Awaited<ReturnType<typeof selectExistingCredit>> | null = null;
  async function selectExistingCredit() {
    return getClient()
      .from("external_fulfillment_credits")
      .select("id,status,amount_usdc")
      .eq("payment_fingerprint", fingerprint)
      .single();
  }
  for (let attempt = 0; attempt < 3; attempt += 1) {
    existing = await selectExistingCredit();
    if (!existing.error) break;
    if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 250 * 2 ** attempt));
  }
  if (!existing) throw new Error("Failed to confirm downstream fulfillment credit: no response");
  if (existing.error || !existing.data) {
    throw new Error(`Failed to confirm downstream fulfillment credit: ${existing.error?.message ?? "missing row"}`);
  }
  return existing.data;
}
