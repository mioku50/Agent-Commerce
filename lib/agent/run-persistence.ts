import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export type AgentRunStatus = "running" | "completed" | "failed" | "stopped";
export type AgentStepStatus =
  | "discovered"
  | "selected"
  | "payment_required"
  | "paid"
  | "skipped"
  | "failed";

type JsonRecord = Record<string, unknown>;

export type AgentRunInsert = {
  task: string;
  mode: string;
  status: AgentRunStatus;
  base_url: string;
  agent_wallet: string;
  budget_usdc: string;
  spent_usdc?: string;
  summary?: string | null;
  error?: string | null;
  raw?: JsonRecord | null;
};

export type AgentRunUpdate = Partial<{
  status: AgentRunStatus;
  spent_usdc: string;
  summary: string | null;
  error: string | null;
  raw: JsonRecord | null;
}>;

export type AgentRunRow = AgentRunInsert & {
  id: string;
  created_at: string;
  updated_at: string;
  spent_usdc: string;
};

export type AgentStepInsert = {
  run_id: string;
  step_index: number;
  service_id?: string | null;
  service_slug?: string | null;
  service_name?: string | null;
  service_source_type?: string | null;
  endpoint?: string | null;
  method?: string | null;
  price_usdc?: string | null;
  status: AgentStepStatus;
  reasoning?: string | null;
  request_id?: string | null;
  payment_event_id?: string | null;
  response_preview?: unknown;
  error?: string | null;
  raw?: JsonRecord | null;
};

export type AgentStepUpdate = Partial<Omit<AgentStepInsert, "run_id" | "step_index">>;

export type AgentStepRow = AgentStepInsert & {
  id: string;
  created_at: string;
};

let supabase: SupabaseClient | null = null;

function safeErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return String(error);
}

function getServiceSupabase() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    console.warn(
      "[agent-run-persistence] Supabase service role env is missing; timeline persistence disabled.",
    );
    return null;
  }

  supabase ??= createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  return supabase;
}

export async function createAgentRun(input: AgentRunInsert) {
  const client = getServiceSupabase();
  if (!client) return null;

  const { data, error } = await client
    .from("agent_runs")
    .insert(input)
    .select()
    .single();

  if (error) {
    console.warn(`[agent-run-persistence] Failed to create run: ${error.message}`);
    return null;
  }

  return data as AgentRunRow;
}

export async function updateAgentRun(runId: string | null, input: AgentRunUpdate) {
  if (!runId) return false;

  const client = getServiceSupabase();
  if (!client) return false;

  const { error } = await client.from("agent_runs").update(input).eq("id", runId);

  if (error) {
    console.warn(`[agent-run-persistence] Failed to update run: ${error.message}`);
    return false;
  }

  return true;
}

export async function createAgentStep(input: AgentStepInsert) {
  const client = getServiceSupabase();
  if (!client) return null;

  const { data, error } = await client
    .from("agent_purchase_steps")
    .insert(input)
    .select()
    .single();

  if (error) {
    console.warn(`[agent-run-persistence] Failed to create step: ${error.message}`);
    return null;
  }

  return data as AgentStepRow;
}

export async function updateAgentStep(stepId: string | null, input: AgentStepUpdate) {
  if (!stepId) return false;

  const client = getServiceSupabase();
  if (!client) return false;

  const { error } = await client
    .from("agent_purchase_steps")
    .update(input)
    .eq("id", stepId);

  if (error) {
    console.warn(`[agent-run-persistence] Failed to update step: ${error.message}`);
    return false;
  }

  return true;
}

export async function findRecentPaymentEvent(input: {
  endpoint: string;
  payer: string;
  amountUsdc: string;
  since: Date;
}) {
  const client = getServiceSupabase();
  if (!client) return null;

  const { data, error } = await client
    .from("payment_events")
    .select("id")
    .eq("endpoint", input.endpoint)
    .eq("payer", input.payer)
    .eq("amount_usdc", input.amountUsdc)
    .gte("created_at", input.since.toISOString())
    .order("created_at", { ascending: false })
    .limit(1);

  if (error) {
    console.warn(
      `[agent-run-persistence] Failed to match payment event: ${safeErrorMessage(error)}`,
    );
    return null;
  }

  return (data?.[0]?.id as string | undefined) ?? null;
}
