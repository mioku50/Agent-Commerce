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

const AGENT_STEP_STATUS_RANK: Record<AgentStepStatus, number> = {
  discovered: 0,
  selected: 1,
  payment_required: 2,
  skipped: 3,
  failed: 4,
  paid: 5,
};

let supabase: SupabaseClient | null = null;

function safeErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    const cause = (error as Error & { cause?: unknown }).cause;
    const causeMessage = cause ? `; cause: ${safeErrorMessage(cause)}` : "";
    return `${error.name}: ${error.message}${causeMessage}`;
  }

  if (error && typeof error === "object") {
    const record = error as Record<string, unknown>;
    const parts = [
      record.name ? `name=${String(record.name)}` : null,
      record.code ? `code=${String(record.code)}` : null,
      record.status ? `status=${String(record.status)}` : null,
      record.message ? `message=${String(record.message)}` : null,
      record.details ? `details=${String(record.details)}` : null,
      record.hint ? `hint=${String(record.hint)}` : null,
      record.cause ? `cause=${safeErrorMessage(record.cause)}` : null,
    ].filter(Boolean);

    if (parts.length > 0) return parts.join("; ");

    try {
      return JSON.stringify(error);
    } catch {
      return "Unknown object error";
    }
  }

  return String(error);
}

function getErrorTokens(error: unknown, tokens: string[] = []): string[] {
  if (!error || tokens.length > 20) return tokens;

  if (error instanceof Error) {
    tokens.push(error.name, error.message);
    const cause = (error as Error & { cause?: unknown }).cause;
    if (cause) getErrorTokens(cause, tokens);
  } else if (typeof error === "object") {
    const record = error as Record<string, unknown>;
    for (const key of ["name", "code", "status", "message", "details"]) {
      if (record[key]) tokens.push(String(record[key]));
    }
    if (record.cause) getErrorTokens(record.cause, tokens);
  } else {
    tokens.push(String(error));
  }

  return tokens;
}

function isTransientPersistenceError(error: unknown) {
  const haystack = getErrorTokens(error).join(" ").toLowerCase();
  return [
    "etimedout",
    "econnreset",
    "terminated",
    "fetch failed",
    "socket hang up",
    "headers timeout",
    "body timeout",
    "timed out",
    "timeout",
    "aborted",
    "502",
    "503",
    "504",
  ].some((token) => haystack.includes(token));
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function retryDelay(attempt: number) {
  return 1_000 * 2 ** attempt;
}

async function supabaseFetchWithRetry(
  input: RequestInfo | URL,
  init?: RequestInit,
) {
  const retries = 3;
  const timeoutMs = 30_000;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      controller.abort(new Error(`Supabase request timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    try {
      const response = await fetch(input, {
        ...init,
        signal: controller.signal,
      });

      if ([502, 503, 504].includes(response.status)) {
        await response.body?.cancel();
        throw new Error(`HTTP ${response.status} ${response.statusText}`);
      }

      return response;
    } catch (error) {
      const canRetry = attempt < retries && isTransientPersistenceError(error);
      if (!canRetry) throw error;

      const delayMs = retryDelay(attempt);
      console.warn(
        `[agent-run-persistence] Supabase request failed on attempt ${attempt + 1}/${retries + 1}: ${safeErrorMessage(error)}. Retrying in ${delayMs}ms...`,
      );
      await sleep(delayMs);
    } finally {
      clearTimeout(timeout);
    }
  }

  throw new Error(`Supabase request failed after ${retries + 1} attempts`);
}

function contextSuffix(context: Record<string, string | null | undefined>) {
  const rendered = Object.entries(context)
    .filter(([, value]) => value)
    .map(([key, value]) => `${key}=${value}`)
    .join(" ");

  return rendered ? ` (${rendered})` : "";
}

function isJsonRecord(value: unknown): value is JsonRecord {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function mergeJsonRecord(
  previous: JsonRecord | null | undefined,
  next: JsonRecord | null | undefined,
) {
  if (isJsonRecord(previous) && isJsonRecord(next)) {
    return { ...previous, ...next };
  }

  return next ?? previous ?? null;
}

function keepExistingWhenEmpty<T>(next: T | null | undefined, previous: T | null | undefined) {
  return next ?? previous ?? null;
}

function chooseMostAdvancedStatus(next: AgentStepStatus, previous: AgentStepStatus) {
  return AGENT_STEP_STATUS_RANK[next] >= AGENT_STEP_STATUS_RANK[previous]
    ? next
    : previous;
}

function mergeAgentStepInput(input: AgentStepInsert, existing: AgentStepRow): AgentStepInsert {
  return {
    run_id: input.run_id,
    step_index: input.step_index,
    service_id: keepExistingWhenEmpty(input.service_id, existing.service_id),
    service_slug: keepExistingWhenEmpty(input.service_slug, existing.service_slug),
    service_name: keepExistingWhenEmpty(input.service_name, existing.service_name),
    service_source_type: keepExistingWhenEmpty(
      input.service_source_type,
      existing.service_source_type,
    ),
    endpoint: keepExistingWhenEmpty(input.endpoint, existing.endpoint),
    method: keepExistingWhenEmpty(input.method, existing.method),
    price_usdc: keepExistingWhenEmpty(input.price_usdc, existing.price_usdc),
    status: chooseMostAdvancedStatus(input.status, existing.status),
    reasoning: keepExistingWhenEmpty(input.reasoning, existing.reasoning),
    request_id: keepExistingWhenEmpty(input.request_id, existing.request_id),
    payment_event_id: keepExistingWhenEmpty(
      input.payment_event_id,
      existing.payment_event_id,
    ),
    response_preview: input.response_preview ?? existing.response_preview ?? null,
    error: keepExistingWhenEmpty(input.error, existing.error),
    raw: mergeJsonRecord(existing.raw, input.raw),
  };
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
    global: {
      fetch: supabaseFetchWithRetry,
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

  const { data: existing, error: lookupError } = await client
    .from("agent_purchase_steps")
    .select("*")
    .eq("run_id", input.run_id)
    .eq("step_index", input.step_index)
    .maybeSingle();

  if (lookupError) {
    console.warn(
      `[agent-run-persistence] Failed to check existing step before upsert: ${lookupError.message}`,
    );
  }

  const payload = existing
    ? mergeAgentStepInput(input, existing as AgentStepRow)
    : input;

  const { data, error } = await client
    .from("agent_purchase_steps")
    .upsert(payload, { onConflict: "run_id,step_index" })
    .select()
    .single();

  if (error) {
    console.warn(`[agent-run-persistence] Failed to upsert step: ${error.message}`);
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
  requestId?: string | null;
}) {
  const client = getServiceSupabase();
  if (!client) return null;
  const context = {
    endpoint: input.endpoint,
    payer: input.payer,
    amount: input.amountUsdc,
    requestId: input.requestId ?? null,
  };

  const { data, error } = await client
    .from("payment_events")
    .select("id,amount_usdc")
    .eq("endpoint", input.endpoint)
    .ilike("payer", input.payer)
    .gte("created_at", input.since.toISOString())
    .order("created_at", { ascending: false })
    .limit(10);

  if (error) {
    console.warn(
      `[agent-run-persistence] Failed to match payment event${contextSuffix(context)}: ${safeErrorMessage(error)}`,
    );
    return null;
  }

  const expectedAmount = Number(input.amountUsdc);
  const matched = data?.find((event) => {
    const actualAmount = Number(event.amount_usdc);
    return (
      Number.isFinite(expectedAmount) &&
      Number.isFinite(actualAmount) &&
      Math.abs(actualAmount - expectedAmount) < 0.000001
    );
  });

  return (matched?.id as string | undefined) ?? null;
}
