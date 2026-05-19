import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export type PublicAgentRun = {
  id: string;
  created_at: string;
  updated_at: string;
  task: string;
  mode: string;
  status: string;
  base_url: string | null;
  agent_wallet: string | null;
  budget_usdc: string;
  spent_usdc: string;
  summary: string | null;
  error: string | null;
  step_count?: number;
  paid_count?: number;
  skipped_count?: number;
  failed_count?: number;
};

export type PublicAgentStep = {
  id: string;
  created_at: string;
  run_id: string;
  step_index: number;
  service_id: string | null;
  service_slug: string | null;
  service_name: string | null;
  service_source_type: string | null;
  endpoint: string | null;
  method: string | null;
  price_usdc: string | null;
  status: string;
  reasoning: string | null;
  request_id: string | null;
  payment_event_id: string | null;
  matched_payment_event_id?: string | null;
  matched_gateway_tx?: string | null;
  response_preview: unknown;
  error: string | null;
};

type PublicPaymentEvent = {
  id: string;
  created_at: string;
  endpoint: string;
  payer: string;
  amount_usdc: string;
  gateway_tx: string | null;
};

const runColumns = [
  "id",
  "created_at",
  "updated_at",
  "task",
  "mode",
  "status",
  "base_url",
  "agent_wallet",
  "budget_usdc",
  "spent_usdc",
  "summary",
  "error",
].join(",");

const stepColumns = [
  "id",
  "created_at",
  "run_id",
  "step_index",
  "service_id",
  "service_slug",
  "service_name",
  "service_source_type",
  "endpoint",
  "method",
  "price_usdc",
  "status",
  "reasoning",
  "request_id",
  "payment_event_id",
  "response_preview",
  "error",
].join(",");

const paymentEventColumns = [
  "id",
  "created_at",
  "endpoint",
  "payer",
  "amount_usdc",
  "gateway_tx",
].join(",");

let supabase: SupabaseClient | null = null;

export function createPublicSupabase() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!supabaseUrl || !publishableKey) {
    throw new Error("Supabase public env vars are required to read agent runs.");
  }

  supabase ??= createClient(supabaseUrl, publishableKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  return supabase;
}

function attachCounts(
  runs: PublicAgentRun[],
  steps: Array<{ run_id: string; status: string }>,
) {
  const counts = new Map<
    string,
    { step_count: number; paid_count: number; skipped_count: number; failed_count: number }
  >();

  for (const step of steps) {
    const current = counts.get(step.run_id) ?? {
      step_count: 0,
      paid_count: 0,
      skipped_count: 0,
      failed_count: 0,
    };
    current.step_count++;
    if (step.status === "paid") current.paid_count++;
    if (step.status === "skipped") current.skipped_count++;
    if (step.status === "failed") current.failed_count++;
    counts.set(step.run_id, current);
  }

  return runs.map((run) => ({
    ...run,
    ...(counts.get(run.id) ?? {
      step_count: 0,
      paid_count: 0,
      skipped_count: 0,
      failed_count: 0,
    }),
  }));
}

function toNumber(value: string | null | undefined) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizedAmount(value: string | null | undefined) {
  return Math.round(toNumber(value) * 1_000_000) / 1_000_000;
}

function matchPaymentEventsToSteps(run: PublicAgentRun, steps: PublicAgentStep[], events: PublicPaymentEvent[]) {
  if (!run.agent_wallet || events.length === 0) return steps;

  const usedEventIds = new Set<string>();

  return steps.map((step) => {
    if (step.status !== "paid" || step.payment_event_id || !step.endpoint) {
      return step;
    }

    const expectedAmount = normalizedAmount(step.price_usdc);
    const matchedEvent = events.find((event) => {
      if (usedEventIds.has(event.id)) return false;

      return (
        event.endpoint === step.endpoint &&
        event.payer.toLowerCase() === run.agent_wallet?.toLowerCase() &&
        Math.abs(normalizedAmount(event.amount_usdc) - expectedAmount) < 0.000001
      );
    });

    if (!matchedEvent) return step;

    usedEventIds.add(matchedEvent.id);

    return {
      ...step,
      matched_payment_event_id: matchedEvent.id,
      matched_gateway_tx: matchedEvent.gateway_tx,
    };
  });
}

export async function fetchRecentAgentRuns(limit = 20) {
  const supabaseClient = createPublicSupabase();
  const safeLimit = Math.min(Math.max(limit, 1), 100);

  const { data: runs, error } = await supabaseClient
    .from("agent_runs")
    .select(runColumns)
    .order("created_at", { ascending: false })
    .limit(safeLimit);

  if (error) throw new Error(error.message);
  if (!runs || runs.length === 0) return [] as PublicAgentRun[];

  const typedRuns = runs as unknown as PublicAgentRun[];
  const runIds = typedRuns.map((run) => run.id);
  const { data: steps, error: stepsError } = await supabaseClient
    .from("agent_purchase_steps")
    .select("run_id,status")
    .in("run_id", runIds);

  if (stepsError) throw new Error(stepsError.message);

  return attachCounts(
    typedRuns,
    (steps ?? []) as Array<{ run_id: string; status: string }>,
  );
}

export async function fetchAgentRunDetail(runId: string) {
  const supabaseClient = createPublicSupabase();

  const { data: run, error } = await supabaseClient
    .from("agent_runs")
    .select(runColumns)
    .eq("id", runId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!run) return null;

  const { data: steps, error: stepsError } = await supabaseClient
    .from("agent_purchase_steps")
    .select(stepColumns)
    .eq("run_id", runId)
    .order("step_index", { ascending: true });

  if (stepsError) throw new Error(stepsError.message);

  const typedSteps = (steps ?? []) as unknown as PublicAgentStep[];
  const counted = attachCounts(
    [run as unknown as PublicAgentRun],
    typedSteps.map((step) => ({
      run_id: step.run_id,
      status: step.status,
    })),
  )[0];

  const paidEndpoints = Array.from(
    new Set(
      typedSteps
        .filter((step) => step.status === "paid" && step.endpoint)
        .map((step) => step.endpoint as string),
    ),
  );
  let enrichedSteps = typedSteps;

  if (counted.agent_wallet && paidEndpoints.length > 0) {
    const from = new Date(new Date(counted.created_at).getTime() - 5 * 60 * 1000);
    const to = new Date(new Date(counted.updated_at).getTime() + 10 * 60 * 1000);
    const { data: paymentEvents, error: paymentEventsError } = await supabaseClient
      .from("payment_events")
      .select(paymentEventColumns)
      .in("endpoint", paidEndpoints)
      .ilike("payer", counted.agent_wallet)
      .gte("created_at", from.toISOString())
      .lte("created_at", to.toISOString())
      .order("created_at", { ascending: true });

    if (!paymentEventsError) {
      enrichedSteps = matchPaymentEventsToSteps(
        counted,
        typedSteps,
        (paymentEvents ?? []) as unknown as PublicPaymentEvent[],
      );
    }
  }

  return {
    run: counted,
    steps: enrichedSteps,
  };
}
