import type { ApiService } from "@/lib/services/registry";

export const DEFAULT_AGENT_TASK =
  "Explore the API Store and buy the minimum useful services to produce a short agent commerce proof.";
export const DEFAULT_AGENT_BUDGET_USDC = 0.0113;

const PURCHASE_ORDER = [
  "github-repository-intelligence",
  "github-due-diligence-analysis",
  "text-analyzer",
  "pyth-market-price",
  "premium-quote",
  "market-snapshot",
  "agent-task",
] as const;

export type AgentPlanDecision = {
  service: ApiService;
  decision: "selected" | "skipped";
  reasoning: string;
  expectedPriceUsd: number;
  remainingBudgetUsd: number;
};

export type AgentPlanningPolicy = {
  preferredCategories?: string[];
  maxServicePriceUsd?: number | null;
  maxPaidCalls?: number | null;
  allowSellerCreated?: boolean;
  allowOfficial?: boolean;
};

export type AgentPlanInput = {
  task: string;
  budgetUsdc: number;
  services: ApiService[];
  policy?: AgentPlanningPolicy;
};

export type AgentPlanResult = {
  task: string;
  budgetUsdc: number;
  estimatedSpendUsdc: number;
  remainingBudgetUsdc: number;
  selected: AgentPlanDecision[];
  skipped: AgentPlanDecision[];
  decisions: AgentPlanDecision[];
  warnings: string[];
  policy: Required<Pick<AgentPlanningPolicy, "allowSellerCreated" | "allowOfficial">> &
    Omit<AgentPlanningPolicy, "allowSellerCreated" | "allowOfficial">;
};

export function formatUsdc(amount: number) {
  const formatted = roundUsdc(amount).toFixed(6).replace(/\.?0+$/, "");
  return formatted === "" ? "0" : formatted;
}

function roundUsdc(amount: number) {
  return Math.round(amount * 1_000_000) / 1_000_000;
}

function sortedServices(services: ApiService[]) {
  return [...services].sort((a, b) => {
    const aIndex = PURCHASE_ORDER.indexOf(a.slug as (typeof PURCHASE_ORDER)[number]);
    const bIndex = PURCHASE_ORDER.indexOf(b.slug as (typeof PURCHASE_ORDER)[number]);
    const normalizedA = aIndex === -1 ? Number.MAX_SAFE_INTEGER : aIndex;
    const normalizedB = bIndex === -1 ? Number.MAX_SAFE_INTEGER : bIndex;

    if (normalizedA !== normalizedB) return normalizedA - normalizedB;
    if (a.priceUsd !== b.priceUsd) return a.priceUsd - b.priceUsd;
    return a.name.localeCompare(b.name);
  });
}

function matches(task: string, pattern: RegExp) {
  return pattern.test(task.toLowerCase());
}

function taskTokens(task: string) {
  const stopwords = new Set([
    "with",
    "using",
    "from",
    "only",
    "when",
    "useful",
    "small",
    "create",
    "prepare",
    "agent",
    "commerce",
    "proof",
    "report",
  ]);

  return task
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 4 && !stopwords.has(token));
}

function sellerServiceMatchesTask(service: ApiService, task: string) {
  const normalizedCategory = service.category
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "\\W+");
  const haystack = [
    service.name,
    service.slug,
    service.category,
    service.shortDescription,
    service.longDescription,
    service.exampleUseCase,
    service.agentReasoningHint,
  ]
    .join(" ")
    .toLowerCase();

  if (normalizedCategory && matches(task, new RegExp(`\\b${normalizedCategory}\\b`))) {
    return true;
  }

  return taskTokens(task).some((token) => haystack.includes(token));
}

function serviceReasonForSelection(service: ApiService, task: string) {
  if (service.sourceType === "seller_mock") {
    return `Seller-created mock service matches the task context and is safe for the stored-response MVP: ${task}`;
  }

  if (service.slug === "github-repository-intelligence") {
    return "The task requires live public GitHub repository data, recent commits, releases, and governance file presence.";
  }

  if (service.slug === "github-due-diligence-analysis") {
    return "The task evaluates repository health, release discipline, and project risk using deterministic due diligence rules.";
  }

  if (service.slug === "premium-quote") {
    return "Low-cost proof of payment and useful short context for the task.";
  }

  if (service.slug === "market-snapshot") {
    return "The compatibility dataset is useful only for deterministic developer testing.";
  }

  if (service.slug === "pyth-market-price") {
    return "The task requires current crypto market context, so the agent buys a normalized live price sourced from Pyth Network.";
  }

  if (service.slug === "text-analyzer") {
    return "The task involves analysis, summary, text, or report generation, so a paid compute step can analyze the generated context.";
  }

  if (service.slug === "agent-task") {
    return "The task justifies a higher-value multi-step agent task, and the remaining budget can cover it.";
  }

  return `The service appears useful for this task: ${task}`;
}

function shouldSelectLiveService(service: ApiService, task: string, budget: number) {
  if (service.sourceType === "seller_mock") {
    return sellerServiceMatchesTask(service, task);
  }

  if (service.sourceType === "external_placeholder") {
    return false;
  }

  if (service.slug === "github-repository-intelligence") {
    return matches(task, /\b(github|repository|repo|due diligence|codebase)\b/);
  }
  if (service.slug === "github-due-diligence-analysis") {
    return matches(task, /\b(github|repository|repo|due diligence|due-diligence|health|risk)\b/);
  }
  if (service.slug === "premium-quote") {
    return !matches(task, /\b(market|crypto|bitcoin|btc|ethereum|ether|eth|solana|sol|token price|github|repository|repo|due diligence)\b/);
  }
  if (service.slug === "pyth-market-price") {
    return matches(task, /\b(market|crypto|bitcoin|btc|ethereum|ether|eth|solana|sol|price|token)\b/);
  }
  if (service.slug === "market-snapshot") {
    return matches(task, /\b(demo dataset|fixture|integration test)\b/);
  }
  if (service.slug === "text-analyzer") {
    return !matches(task, /\b(github|repository|repo|due diligence)\b/) &&
      matches(task, /\b(text|summary|summarize|analysis|analyze|report|draft|write|sentiment|tone)\b/);
  }
  if (service.slug === "agent-task") {
    return (
      budget >= 0.0413 &&
      matches(task, /\b(agent task|task|multi[- ]step|puzzle|work order)\b/)
    );
  }
  return false;
}

function hasPreferredCategory(service: ApiService, preferredCategories: string[]) {
  if (preferredCategories.length === 0) return true;
  return preferredCategories
    .map((category) => category.trim().toLowerCase())
    .includes(service.category.toLowerCase());
}

function isSellerCreated(service: ApiService) {
  return service.sourceType === "seller_mock" || service.sourceType === "external_placeholder";
}

export function planAgentPurchases(input: AgentPlanInput): AgentPlanResult {
  const task = input.task.trim() || DEFAULT_AGENT_TASK;
  const budgetUsdc = Number.isFinite(input.budgetUsdc)
    ? Math.max(input.budgetUsdc, 0)
    : DEFAULT_AGENT_BUDGET_USDC;
  const policy = {
    preferredCategories: input.policy?.preferredCategories?.filter(Boolean) ?? [],
    maxServicePriceUsd: input.policy?.maxServicePriceUsd ?? null,
    maxPaidCalls: input.policy?.maxPaidCalls ?? null,
    allowSellerCreated: input.policy?.allowSellerCreated ?? true,
    allowOfficial: input.policy?.allowOfficial ?? true,
  };
  let remaining = budgetUsdc;
  let decisionsSelected = 0;

  const decisions = sortedServices(input.services).map((service): AgentPlanDecision => {
    const skipped = (reasoning: string): AgentPlanDecision => ({
      service,
      decision: "skipped",
      reasoning,
      expectedPriceUsd: service.priceUsd,
      remainingBudgetUsd: roundUsdc(remaining),
    });

    if (service.status === "coming-soon") {
      return skipped("This service is coming soon and does not have a live paid endpoint.");
    }

    if (service.sourceType === "external_placeholder") {
      return skipped("External fulfillment is not enabled in this MVP, so the buyer-agent will not call this seller-created placeholder.");
    }

    if (isSellerCreated(service) && !policy.allowSellerCreated) {
      return skipped("Seller-created services are disabled by the selected policy.");
    }

    if (!isSellerCreated(service) && !policy.allowOfficial) {
      return skipped("Official sample services are disabled by the selected policy.");
    }

    if (!hasPreferredCategory(service, policy.preferredCategories)) {
      return skipped(`Skipped because ${service.category} is outside the preferred categories for this dry run.`);
    }

    if (service.status !== "live") {
      return skipped("This service is not marked live, so the scripted buyer-agent will not spend budget on it.");
    }

    if (!service.isPaid) {
      return skipped("This listing is not priced as a paid x402 service, so the buyer-agent will not spend Gateway balance on it.");
    }

    if (
      policy.maxServicePriceUsd !== null &&
      service.priceUsd > policy.maxServicePriceUsd
    ) {
      return skipped(`Skipped because ${service.priceLabel} exceeds the max service price of ${formatUsdc(policy.maxServicePriceUsd)} USDC.`);
    }

    if (!shouldSelectLiveService(service, task, budgetUsdc)) {
      return skipped("The scripted policy did not find enough task relevance to justify this paid call.");
    }

    if (
      policy.maxPaidCalls !== null &&
      decisionsSelected >= policy.maxPaidCalls
    ) {
      return skipped(`Skipped because the workflow is limited to ${policy.maxPaidCalls} paid call(s).`);
    }

    if (service.priceUsd > remaining + 0.0000001) {
      return skipped(`Skipped because ${service.priceLabel} exceeds the remaining budget of ${formatUsdc(remaining)} USDC.`);
    }

    remaining = roundUsdc(remaining - service.priceUsd);
    decisionsSelected += 1;

    return {
      service,
      decision: "selected",
      reasoning: serviceReasonForSelection(service, task),
      expectedPriceUsd: service.priceUsd,
      remainingBudgetUsd: remaining,
    };
  });

  const selected = decisions.filter((decision) => decision.decision === "selected");
  const skipped = decisions.filter((decision) => decision.decision === "skipped");
  const estimatedSpendUsdc = roundUsdc(
    selected.reduce((sum, decision) => sum + decision.expectedPriceUsd, 0),
  );
  const warnings: string[] = [];

  if (budgetUsdc <= 0) {
    warnings.push("Budget must be greater than 0 USDC before the local CLI agent can buy paid services.");
  } else if (selected.length === 0) {
    warnings.push("No service was selected. Increase budget, broaden policy filters, or use a task that matches a live API service.");
  } else if (estimatedSpendUsdc > budgetUsdc) {
    warnings.push("Estimated spend exceeds budget. The local CLI agent should not run with this plan.");
  }

  const cheapestRelevant = decisions.find(
    (decision) =>
      decision.decision === "skipped" &&
      decision.reasoning.includes("remaining budget"),
  );
  if (cheapestRelevant) {
    warnings.push("Budget was too low for at least one relevant service.");
  }

  return {
    task,
    budgetUsdc,
    estimatedSpendUsdc,
    remainingBudgetUsdc: roundUsdc(remaining),
    selected,
    skipped,
    decisions,
    warnings,
    policy,
  };
}
