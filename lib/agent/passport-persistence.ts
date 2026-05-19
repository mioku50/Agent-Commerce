import { createClient, type SupabaseClient } from "@supabase/supabase-js";

type JsonRecord = Record<string, unknown>;

export type PublicAgentProfile = {
  wallet: string;
  created_at: string;
  updated_at: string;
  first_seen_at: string | null;
  last_run_at: string | null;
  total_runs: number;
  completed_runs: number;
  failed_runs: number;
  stopped_runs: number;
  budget_respected_runs: number;
  paid_requests: number;
  skipped_requests: number;
  failed_requests: number;
  total_usdc_spent: string;
  seller_created_services_used: number;
  official_services_used: number;
  trust_score: number;
  raw: JsonRecord | null;
};

export type PublicAgentReputationEvent = {
  id: string;
  created_at: string;
  wallet: string;
  run_id: string | null;
  event_type: string;
  title: string;
  description: string | null;
  score_delta: number;
  raw: JsonRecord | null;
};

export type AgentPassportRun = {
  id: string;
  created_at: string;
  task: string;
  status: string;
  budget_usdc: string;
  spent_usdc: string;
  summary: string | null;
};

type AgentRunStatsRow = AgentPassportRun & {
  updated_at: string;
};

type AgentStepStatsRow = {
  run_id: string;
  service_slug: string | null;
  service_source_type: string | null;
  status: string;
  price_usdc: string | null;
};

type ReputationEventInput = {
  wallet: string;
  runId?: string | null;
  eventType: string;
  title: string;
  description?: string | null;
  scoreDelta?: number;
  raw?: JsonRecord | null;
};

export type AgentPassportDetail = {
  profile: PublicAgentProfile;
  recentRuns: AgentPassportRun[];
  recentEvents: PublicAgentReputationEvent[];
};

const profileColumns = [
  "wallet",
  "created_at",
  "updated_at",
  "first_seen_at",
  "last_run_at",
  "total_runs",
  "completed_runs",
  "failed_runs",
  "stopped_runs",
  "budget_respected_runs",
  "paid_requests",
  "skipped_requests",
  "failed_requests",
  "total_usdc_spent",
  "seller_created_services_used",
  "official_services_used",
  "trust_score",
  "raw",
].join(",");

const eventColumns = [
  "id",
  "created_at",
  "wallet",
  "run_id",
  "event_type",
  "title",
  "description",
  "score_delta",
  "raw",
].join(",");

const runColumns = [
  "id",
  "created_at",
  "updated_at",
  "task",
  "status",
  "budget_usdc",
  "spent_usdc",
  "summary",
].join(",");

let serviceSupabase: SupabaseClient | null = null;
let publicSupabase: SupabaseClient | null = null;

function safeErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return String(error);
}

function isMissingPassportTableError(message: string) {
  return (
    message.includes("agent_profiles") ||
    message.includes("agent_reputation_events")
  );
}

function getServiceSupabase() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    console.warn(
      "[agent-passport] Supabase service role env is missing; passport persistence disabled.",
    );
    return null;
  }

  serviceSupabase ??= createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  return serviceSupabase;
}

function getPublicSupabase() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!supabaseUrl || !publishableKey) {
    throw new Error("Supabase public env vars are required to read agent profiles.");
  }

  publicSupabase ??= createClient(supabaseUrl, publishableKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  return publicSupabase;
}

export function normalizeAgentWallet(wallet: string) {
  return wallet.trim().toLowerCase();
}

function roundUsdc(value: number) {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function formatUsdc(value: number) {
  const formatted = roundUsdc(value).toFixed(6).replace(/\.?0+$/, "");
  return formatted === "" ? "0" : formatted;
}

function toNumber(value: string | null | undefined) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function clampTrustScore(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function isBudgetRespected(run: AgentRunStatsRow) {
  return (
    run.status === "completed" &&
    toNumber(run.spent_usdc) <= toNumber(run.budget_usdc) + 0.000001
  );
}

function calculateTrustScore(input: {
  completedRuns: number;
  failedRuns: number;
  budgetRespectedRuns: number;
  paidRequests: number;
  failedRequests: number;
  sellerCreatedServicesUsed: number;
}) {
  return clampTrustScore(
    20 +
      input.completedRuns * 8 +
      input.paidRequests * 4 +
      input.sellerCreatedServicesUsed * 6 +
      input.budgetRespectedRuns * 3 -
      input.failedRequests * 6 -
      input.failedRuns * 10,
  );
}

async function fetchRunStatsForWallet(client: SupabaseClient, wallet: string) {
  const { data, error } = await client
    .from("agent_runs")
    .select(runColumns)
    .ilike("agent_wallet", wallet)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as unknown as AgentRunStatsRow[];
}

async function fetchStepStatsForRuns(client: SupabaseClient, runIds: string[]) {
  if (runIds.length === 0) return [] as AgentStepStatsRow[];

  const { data, error } = await client
    .from("agent_purchase_steps")
    .select("run_id,service_slug,service_source_type,status,price_usdc")
    .in("run_id", runIds);

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as unknown as AgentStepStatsRow[];
}

function profilePayloadFromStats(
  wallet: string,
  runs: AgentRunStatsRow[],
  steps: AgentStepStatsRow[],
) {
  const paidSteps = steps.filter((step) => step.status === "paid");
  const sellerServiceSlugs = new Set(
    paidSteps
      .filter((step) => step.service_source_type && step.service_source_type !== "static")
      .map((step) => step.service_slug)
      .filter(Boolean),
  );
  const officialServiceSlugs = new Set(
    paidSteps
      .filter((step) => step.service_source_type === "static")
      .map((step) => step.service_slug)
      .filter(Boolean),
  );

  const totalRuns = runs.length;
  const completedRuns = runs.filter((run) => run.status === "completed").length;
  const failedRuns = runs.filter((run) => run.status === "failed").length;
  const stoppedRuns = runs.filter((run) => run.status === "stopped").length;
  const budgetRespectedRuns = runs.filter(isBudgetRespected).length;
  const paidRequests = paidSteps.length;
  const skippedRequests = steps.filter((step) => step.status === "skipped").length;
  const failedRequests = steps.filter((step) => step.status === "failed").length;
  const totalSpent = runs.reduce(
    (sum, run) => sum + toNumber(run.spent_usdc),
    0,
  );
  const trustScore = calculateTrustScore({
    completedRuns,
    failedRuns,
    budgetRespectedRuns,
    paidRequests,
    failedRequests,
    sellerCreatedServicesUsed: sellerServiceSlugs.size,
  });

  return {
    wallet,
    first_seen_at: runs.at(-1)?.created_at ?? null,
    last_run_at: runs[0]?.created_at ?? null,
    total_runs: totalRuns,
    completed_runs: completedRuns,
    failed_runs: failedRuns,
    stopped_runs: stoppedRuns,
    budget_respected_runs: budgetRespectedRuns,
    paid_requests: paidRequests,
    skipped_requests: skippedRequests,
    failed_requests: failedRequests,
    total_usdc_spent: formatUsdc(totalSpent),
    seller_created_services_used: sellerServiceSlugs.size,
    official_services_used: officialServiceSlugs.size,
    trust_score: trustScore,
    raw: {
      formula:
        "20 + completed_runs*8 + paid_requests*4 + seller_created_services_used*6 + budget_respected_runs*3 - failed_requests*6 - failed_runs*10",
      profileVersion: 1,
      source: "agent_runs + agent_purchase_steps",
    },
  };
}

function eventForRun(
  wallet: string,
  run: AgentRunStatsRow,
  steps: AgentStepStatsRow[],
): ReputationEventInput {
  const paid = steps.filter((step) => step.status === "paid").length;
  const skipped = steps.filter((step) => step.status === "skipped").length;
  const failed = steps.filter((step) => step.status === "failed").length;
  const sellerPaid = steps.filter(
    (step) =>
      step.status === "paid" &&
      Boolean(step.service_source_type) &&
      step.service_source_type !== "static",
  ).length;
  const budgetRespected = isBudgetRespected(run);
  const scoreDelta =
    (run.status === "completed" ? 8 : run.status === "failed" ? -8 : 0) +
    paid * 3 +
    sellerPaid * 4 +
    (budgetRespected ? 2 : 0) -
    failed * 5;

  return {
    wallet,
    runId: run.id,
    eventType: `run_${run.status}`,
    title:
      run.status === "completed"
        ? "Agent run completed"
        : run.status === "failed"
          ? "Agent run failed"
          : run.status === "stopped"
            ? "Agent run stopped"
            : "Agent run updated",
    description: `${paid} paid, ${skipped} skipped, ${failed} failed; spent ${run.spent_usdc} USDC.`,
    scoreDelta,
    raw: {
      paid,
      skipped,
      failed,
      sellerPaid,
      budgetRespected,
      status: run.status,
    },
  };
}

export async function createOrUpdateAgentProfileByWallet(wallet: string) {
  const client = getServiceSupabase();
  if (!client) return null;

  const normalizedWallet = normalizeAgentWallet(wallet);
  const { data, error } = await client
    .from("agent_profiles")
    .upsert({ wallet: normalizedWallet }, { onConflict: "wallet" })
    .select(profileColumns)
    .single();

  if (error) {
    console.warn(`[agent-passport] Failed to create profile: ${error.message}`);
    return null;
  }

  return data as unknown as PublicAgentProfile;
}

export async function writeReputationEvent(input: ReputationEventInput) {
  const client = getServiceSupabase();
  if (!client) return null;

  const payload = {
    wallet: normalizeAgentWallet(input.wallet),
    run_id: input.runId ?? null,
    event_type: input.eventType,
    title: input.title,
    description: input.description ?? null,
    score_delta: input.scoreDelta ?? 0,
    raw: input.raw ?? null,
  };

  if (payload.run_id) {
    const { data: existing, error: lookupError } = await client
      .from("agent_reputation_events")
      .select("id")
      .eq("wallet", payload.wallet)
      .eq("run_id", payload.run_id)
      .eq("event_type", payload.event_type)
      .maybeSingle();

    if (lookupError) {
      console.warn(
        `[agent-passport] Failed to check existing reputation event: ${lookupError.message}`,
      );
      return null;
    }

    if (existing?.id) {
      const { data, error } = await client
        .from("agent_reputation_events")
        .update(payload)
        .eq("id", existing.id)
        .select(eventColumns)
        .single();

      if (error) {
        console.warn(`[agent-passport] Failed to update reputation event: ${error.message}`);
        return null;
      }

      return data as unknown as PublicAgentReputationEvent;
    }
  }

  const { data, error } = await client
    .from("agent_reputation_events")
    .insert(payload)
    .select(eventColumns)
    .single();

  if (error) {
    console.warn(`[agent-passport] Failed to write reputation event: ${error.message}`);
    return null;
  }

  return data as unknown as PublicAgentReputationEvent;
}

export async function recalculateAgentProfile(
  wallet: string | null | undefined,
  options: { runId?: string | null } = {},
) {
  if (!wallet) return null;

  const client = getServiceSupabase();
  if (!client) return null;

  const normalizedWallet = normalizeAgentWallet(wallet);

  try {
    const runs = await fetchRunStatsForWallet(client, normalizedWallet);
    const steps = await fetchStepStatsForRuns(
      client,
      runs.map((run) => run.id),
    );
    const payload = profilePayloadFromStats(normalizedWallet, runs, steps);

    const { data, error } = await client
      .from("agent_profiles")
      .upsert(payload, { onConflict: "wallet" })
      .select(profileColumns)
      .single();

    if (error) {
      console.warn(`[agent-passport] Failed to update profile: ${error.message}`);
      return null;
    }

    if (options.runId) {
      const run = runs.find((item) => item.id === options.runId);
      if (run) {
        const runSteps = steps.filter((step) => step.run_id === run.id);
        await writeReputationEvent(eventForRun(normalizedWallet, run, runSteps));
      }
    }

    return data as unknown as PublicAgentProfile;
  } catch (error) {
    console.warn(
      `[agent-passport] Failed to recalculate profile: ${safeErrorMessage(error)}`,
    );
    return null;
  }
}

export async function listAgentProfiles(limit = 30) {
  const client = getPublicSupabase();
  const safeLimit = Math.min(Math.max(limit, 1), 100);

  const { data, error } = await client
    .from("agent_profiles")
    .select(profileColumns)
    .order("last_run_at", { ascending: false, nullsFirst: false })
    .order("trust_score", { ascending: false })
    .limit(safeLimit);

  if (error) {
    if (isMissingPassportTableError(error.message)) return [];
    throw new Error(error.message);
  }

  return (data ?? []) as unknown as PublicAgentProfile[];
}

async function fetchFallbackPassport(
  client: SupabaseClient,
  wallet: string,
): Promise<AgentPassportDetail | null> {
  const runs = await fetchRunStatsForWallet(client, wallet);
  if (runs.length === 0) return null;

  const steps = await fetchStepStatsForRuns(
    client,
    runs.map((run) => run.id),
  );
  const payload = profilePayloadFromStats(wallet, runs, steps);
  const now = new Date().toISOString();

  return {
    profile: {
      ...payload,
      created_at: payload.first_seen_at ?? now,
      updated_at: now,
    },
    recentRuns: runs.slice(0, 10),
    recentEvents: [],
  };
}

export async function fetchAgentPassport(wallet: string) {
  const client = getPublicSupabase();
  const normalizedWallet = normalizeAgentWallet(wallet);

  const { data: profile, error } = await client
    .from("agent_profiles")
    .select(profileColumns)
    .eq("wallet", normalizedWallet)
    .maybeSingle();

  if (error) {
    if (isMissingPassportTableError(error.message)) {
      return fetchFallbackPassport(client, normalizedWallet);
    }
    throw new Error(error.message);
  }
  if (!profile) return fetchFallbackPassport(client, normalizedWallet);

  const { data: recentRuns, error: runsError } = await client
    .from("agent_runs")
    .select(runColumns)
    .ilike("agent_wallet", normalizedWallet)
    .order("created_at", { ascending: false })
    .limit(10);

  if (runsError) throw new Error(runsError.message);

  const { data: recentEvents, error: eventsError } = await client
    .from("agent_reputation_events")
    .select(eventColumns)
    .eq("wallet", normalizedWallet)
    .order("created_at", { ascending: false })
    .limit(20);

  if (eventsError && !isMissingPassportTableError(eventsError.message)) {
    throw new Error(eventsError.message);
  }

  return {
    profile: profile as unknown as PublicAgentProfile,
    recentRuns: (recentRuns ?? []) as unknown as AgentPassportRun[],
    recentEvents: (recentEvents ?? []) as unknown as PublicAgentReputationEvent[],
  } satisfies AgentPassportDetail;
}
