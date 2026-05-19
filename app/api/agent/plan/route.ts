import { NextResponse } from "next/server";
import {
  DEFAULT_AGENT_BUDGET_USDC,
  DEFAULT_AGENT_TASK,
  formatUsdc,
  planAgentPurchases,
  type AgentPlanningPolicy,
} from "@/lib/agent/planner";
import { listAllStoreServices } from "@/lib/services/store-service-persistence";

type PlanRequest = {
  task?: unknown;
  budgetUsdc?: unknown;
  preferredCategories?: unknown;
  maxServicePriceUsd?: unknown;
  allowSellerCreated?: unknown;
  allowOfficial?: unknown;
};

function parseNumber(value: unknown, fallback: number) {
  if (value === null || value === undefined || value === "") return fallback;
  const normalized = typeof value === "string" ? value.replace(",", ".") : value;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseOptionalNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const normalized = typeof value === "string" ? value.replace(",", ".") : value;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function parseCategories(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
}

function serviceSummary(decision: ReturnType<typeof planAgentPurchases>["decisions"][number]) {
  return {
    decision: decision.decision,
    reasoning: decision.reasoning,
    expectedPriceUsd: decision.expectedPriceUsd,
    remainingBudgetUsd: decision.remainingBudgetUsd,
    service: {
      id: decision.service.id,
      slug: decision.service.slug,
      name: decision.service.name,
      shortDescription: decision.service.shortDescription,
      category: decision.service.category,
      method: decision.service.method,
      endpoint: decision.service.endpoint,
      priceLabel: decision.service.priceLabel,
      priceUsd: decision.service.priceUsd,
      status: decision.service.status,
      sourceType: decision.service.sourceType,
      isPaid: decision.service.isPaid,
    },
  };
}

function localCommand(task: string, budgetUsdc: number) {
  const escapedTask = task.replace(/"/g, '\\"');
  return `AGENT_MAX_IN_FLIGHT=1 npm run agent -- --task "${escapedTask}" --limit ${formatUsdc(budgetUsdc)}`;
}

export async function POST(request: Request) {
  let body: PlanRequest;

  try {
    body = (await request.json()) as PlanRequest;
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const task =
    typeof body.task === "string" && body.task.trim()
      ? body.task.trim()
      : DEFAULT_AGENT_TASK;
  const budgetUsdc = Math.max(parseNumber(body.budgetUsdc, DEFAULT_AGENT_BUDGET_USDC), 0);
  const policy: AgentPlanningPolicy = {
    preferredCategories: parseCategories(body.preferredCategories),
    maxServicePriceUsd: parseOptionalNumber(body.maxServicePriceUsd),
    allowSellerCreated: body.allowSellerCreated !== false,
    allowOfficial: body.allowOfficial !== false,
  };
  const { services, warning } = await listAllStoreServices();
  const plan = planAgentPurchases({
    task,
    budgetUsdc,
    services,
    policy,
  });

  return NextResponse.json({
    task: plan.task,
    budgetUsdc: plan.budgetUsdc,
    estimatedSpendUsdc: plan.estimatedSpendUsdc,
    remainingBudgetUsdc: plan.remainingBudgetUsdc,
    selected: plan.selected.map(serviceSummary),
    skipped: plan.skipped.map(serviceSummary),
    decisions: plan.decisions.map(serviceSummary),
    warnings: [...plan.warnings, ...(warning ? [warning] : [])],
    policy: plan.policy,
    localCommand: localCommand(plan.task, plan.budgetUsdc),
    note: "Dry-run only. No payment, private key, Gateway deposit, or server-side fund movement occurs in this planning route.",
  });
}
