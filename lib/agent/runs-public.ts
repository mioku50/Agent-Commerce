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
  response_preview: unknown;
  error: string | null;
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

  return {
    run: counted,
    steps: typedSteps,
  };
}
