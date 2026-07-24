import {
  HOSTED_WORKFLOW_TYPES,
  type HostedWorkflowType,
} from "./workflow-templates.ts";
import {
  PYTH_MARKET_SYMBOLS,
  type PythMarketSymbol,
} from "../providers/types.ts";

export const DEFAULT_HOSTED_WORKFLOW: HostedWorkflowType = "github_due_diligence";
export const DEFAULT_MARKET_SYMBOL: PythMarketSymbol = "BTC/USD";

const workflowAliases: Record<string, HostedWorkflowType> = {
  github: "github_due_diligence",
  github_due_diligence: "github_due_diligence",
  sentiment: "sentiment_tone",
  sentiment_tone: "sentiment_tone",
  builder_update: "builder_update",
  market_context: "market_context",
  custom: "custom_task",
  custom_task: "custom_task",
};

const workflowQueryValues: Record<HostedWorkflowType, string> = {
  github_due_diligence: "github",
  sentiment_tone: "sentiment",
  builder_update: "builder_update",
  market_context: "market_context",
  custom_task: "custom",
};

function firstString(value: unknown) {
  if (Array.isArray(value)) return typeof value[0] === "string" ? value[0] : null;
  return typeof value === "string" ? value : null;
}

export function parseWorkflowQueryValue(value: unknown): HostedWorkflowType | null {
  const normalized = firstString(value)?.trim().toLowerCase();
  return normalized ? workflowAliases[normalized] ?? null : null;
}

export function parseMarketSymbolQuery(value: unknown): PythMarketSymbol | null {
  const normalized = firstString(value)?.trim().toUpperCase().replace(/[-_]/g, "/");
  if (!normalized) return null;
  const symbol = normalized.includes("/") ? normalized : `${normalized}/USD`;
  return PYTH_MARKET_SYMBOLS.includes(symbol as PythMarketSymbol)
    ? symbol as PythMarketSymbol
    : null;
}

export function parseHostedRunnerQuery(input: {
  workflow?: unknown;
  symbol?: unknown;
}) {
  const workflowType =
    parseWorkflowQueryValue(input.workflow) ?? DEFAULT_HOSTED_WORKFLOW;
  return {
    workflowType,
    marketSymbol:
      workflowType === "market_context"
        ? parseMarketSymbolQuery(input.symbol) ?? DEFAULT_MARKET_SYMBOL
        : DEFAULT_MARKET_SYMBOL,
  };
}

export function hostedWorkflowHref(
  workflowType: HostedWorkflowType,
  marketSymbol: PythMarketSymbol = DEFAULT_MARKET_SYMBOL,
) {
  const safeWorkflow = HOSTED_WORKFLOW_TYPES.includes(workflowType)
    ? workflowType
    : DEFAULT_HOSTED_WORKFLOW;
  const params = new URLSearchParams({
    workflow: workflowQueryValues[safeWorkflow],
  });
  if (safeWorkflow === "market_context") params.set("symbol", marketSymbol);
  return `/agent-runner?${params.toString()}`;
}
