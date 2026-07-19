/**
 * Copyright 2026 Circle Internet Group, Inc.  All rights reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { createHash } from "node:crypto";
import type { BuyerAgentServiceResult } from "./execution.ts";
import {
  HOSTED_AGENT_MAX_TASK_LENGTH,
  validateHostedBudget,
} from "./hosted-policy.ts";
import { planAgentPurchases } from "./planner.ts";
import type { ApiService, ServiceMethod } from "../services/registry.ts";

export const HOSTED_WORKFLOW_TYPES = [
  "sentiment_tone",
  "builder_update",
  "market_context",
  "custom_task",
] as const;

export type HostedWorkflowType = (typeof HOSTED_WORKFLOW_TYPES)[number];

export const HOSTED_WORKFLOW_MAX_INPUT_LENGTH = 5_000;
export const HOSTED_WORKFLOW_MIN_INPUT_LENGTH = 20;
export const HOSTED_WORKFLOW_INPUT_PREVIEW_LENGTH = 240;
export const HOSTED_WORKFLOW_MAX_PAID_CALLS = 3;

export type HostedWorkflowRequest = {
  workflowType: HostedWorkflowType;
  task: string;
  inputText: string;
  budgetUsdc: number;
};

export type HostedPlanService = {
  id: string;
  slug: string;
  name: string;
  endpoint: string;
  method: ServiceMethod;
  priceUsdc: number;
  reasoning: string;
};

export type HostedPlannerSnapshot = {
  version: 2;
  workflowType: HostedWorkflowType;
  workflowLabel: string;
  effectiveTask: string;
  selectedServices: HostedPlanService[];
  skippedServices: HostedPlanService[];
  estimatedSpendUsdc: number;
  remainingBudgetUsdc: number;
  maxPaidCalls: number;
  budgetCapUsdc: number;
  aggregationMode: "deterministic_structured";
  aggregationLabel: "Structured workflow result (no LLM configured)";
  inputPreview: string;
  inputSha256: string;
  warnings: string[];
};

export type HostedFinalReport = {
  version: 2;
  workflowType: HostedWorkflowType;
  aggregationMode: "deterministic_structured";
  aggregationLabel: "Structured workflow result (no LLM configured)";
  input: {
    preview: string;
    sha256: string;
  };
  summary: string;
  keyFindings: string[];
  apiResults: BuyerAgentServiceResult[];
  selectedServices: HostedPlanService[];
  skippedServices: HostedPlanService[];
  spentUsdc: string;
  receiptIds: string[];
  proofTransactionHashes: string[];
  links: {
    hostedResult: string;
    agentRun: string | null;
    receipts: string;
    passport: string | null;
    proofTransactions: string[];
  };
  completedWithWarnings: boolean;
  generatedAt: string;
};

const WORKFLOW_LABELS: Record<HostedWorkflowType, string> = {
  sentiment_tone: "Sentiment & Tone Report",
  builder_update: "Builder Update Summary",
  market_context: "Market Context Brief",
  custom_task: "Custom Task",
};

const OBVIOUS_SECRET_PATTERNS: Array<{ label: string; pattern: RegExp }> = [
  {
    label: "private key block",
    pattern: /-----BEGIN (?:EC |RSA |OPENSSH )?PRIVATE KEY-----/i,
  },
  {
    label: "private key or seed phrase",
    pattern:
      /\b(?:private[_\s-]?key|wallet[_\s-]?key|seed[_\s-]?phrase|mnemonic)\s*[:=]\s*["']?(?:0x)?[a-z0-9+/=_-]{20,}/i,
  },
  {
    label: "secret environment value",
    pattern:
      /\b(?:AGENT_DB_SUPABASE_SECRET_KEY|AGENT_DB_SUPABASE_SERVICE_ROLE_KEY|HOSTED_AGENT_PRIVATE_KEY|PRIVATE_KEY|SECRET_KEY|SERVICE_ROLE_KEY|API_KEY)\s*=/i,
  },
  {
    label: "API token",
    pattern: /\b(?:sk-(?:proj-)?|ghp_|github_pat_|AKIA)[a-z0-9_-]{12,}\b/i,
  },
  {
    label: "bearer token",
    pattern: /\bbearer\s+[a-z0-9._~+/-]{20,}/i,
  },
  {
    label: "JWT",
    pattern: /\beyJ[a-z0-9_-]{10,}\.[a-z0-9_-]{10,}\.[a-z0-9_-]{10,}\b/i,
  },
  {
    label: "unprefixed private key",
    pattern: /^(?:[0-9a-f]{64})$/i,
  },
];

function normalizedText(value: unknown) {
  if (value === null || value === undefined) return "";
  if (typeof value !== "string") throw new Error("Input text must be a string.");
  return value.trim().replace(/\r\n/g, "\n");
}

function rejectObviousSecrets(value: string, field: "Task" | "Input text") {
  const match = OBVIOUS_SECRET_PATTERNS.find(({ pattern }) => pattern.test(value));
  if (match) {
    throw new Error(
      `${field} appears to contain a ${match.label}. Remove credentials or wallet secrets before continuing.`,
    );
  }
}

export function hashHostedWorkflowInput(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export function safeHostedWorkflowInputPreview(value: string) {
  const compact = value
    .replace(/-----BEGIN (?:EC |RSA |OPENSSH )?PRIVATE KEY-----/gi, "[redacted-private-key]")
    .replace(/\b0x[0-9a-f]{64}\b/gi, "[redacted-hex]")
    .replace(/\b(?:sk-(?:proj-)?|ghp_|github_pat_|AKIA)[a-z0-9_-]{12,}\b/gi, "[redacted-token]")
    .replace(/\beyJ[a-z0-9_-]{10,}\.[a-z0-9_-]{10,}\.[a-z0-9_-]{10,}\b/gi, "[redacted-jwt]")
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[redacted-email]")
    .replace(/\s+/g, " ")
    .trim();
  if (compact.length <= HOSTED_WORKFLOW_INPUT_PREVIEW_LENGTH) return compact;
  return `${compact.slice(0, HOSTED_WORKFLOW_INPUT_PREVIEW_LENGTH - 1).trimEnd()}…`;
}

export function hostedWorkflowInputMetadata(value: string) {
  return {
    preview: safeHostedWorkflowInputPreview(value),
    sha256: hashHostedWorkflowInput(value),
  };
}

export function isHostedWorkflowType(value: unknown): value is HostedWorkflowType {
  return HOSTED_WORKFLOW_TYPES.includes(value as HostedWorkflowType);
}

export function workflowLabel(workflowType: HostedWorkflowType) {
  return WORKFLOW_LABELS[workflowType];
}

export function validateHostedWorkflowRequest(input: {
  workflowType?: unknown;
  task?: unknown;
  inputText?: unknown;
  budgetUsdc?: unknown;
}): HostedWorkflowRequest {
  if (!isHostedWorkflowType(input.workflowType)) {
    throw new Error(
      "Workflow type must be sentiment_tone, builder_update, market_context, or custom_task.",
    );
  }

  const workflowType = input.workflowType;
  const task = normalizedText(input.task).replace(/\s+/g, " ");
  const inputText = normalizedText(input.inputText);
  if (task.length > HOSTED_AGENT_MAX_TASK_LENGTH) {
    throw new Error(`Task must contain at most ${HOSTED_AGENT_MAX_TASK_LENGTH} characters.`);
  }
  if (inputText.length > HOSTED_WORKFLOW_MAX_INPUT_LENGTH) {
    throw new Error(`Input text must contain at most ${HOSTED_WORKFLOW_MAX_INPUT_LENGTH} characters.`);
  }

  if (task && task.length < 10) {
    throw new Error("Task must contain at least 10 characters.");
  }
  if (inputText.length < HOSTED_WORKFLOW_MIN_INPUT_LENGTH) {
    throw new Error(
      `${workflowLabel(workflowType)} requires at least ${HOSTED_WORKFLOW_MIN_INPUT_LENGTH} input characters.`,
    );
  }
  rejectObviousSecrets(task, "Task");
  rejectObviousSecrets(inputText, "Input text");

  return {
    workflowType,
    task: task || defaultWorkflowTask(workflowType),
    inputText,
    budgetUsdc: validateHostedBudget(input.budgetUsdc),
  };
}

export function defaultWorkflowTask(workflowType: HostedWorkflowType) {
  if (workflowType === "sentiment_tone") {
    return "Analyze the submitted text and produce a sentiment and tone workflow report.";
  }
  if (workflowType === "builder_update") {
    return "Analyze the submitted builder update and produce a concise structured report.";
  }
  if (workflowType === "market_context") {
    return "Analyze the submitted market context and produce a concise evidence-labeled brief.";
  }
  return "Analyze the request with useful allowlisted paid API services.";
}

export function effectiveWorkflowTask(input: HostedWorkflowRequest) {
  if (input.workflowType === "sentiment_tone") {
    return `${input.task} Use paid text analysis and concise research context for the report.`;
  }
  if (input.workflowType === "builder_update") {
    return `${input.task} Use paid text analysis and concise research context for the builder update report.`;
  }
  if (input.workflowType === "market_context") {
    return `${input.task} Use paid text analysis and concise context for a market report based only on the submitted source.`;
  }
  return input.task;
}

function safeService(decision: {
  service: ApiService;
  expectedPriceUsd: number;
  reasoning: string;
}): HostedPlanService {
  return {
    id: decision.service.id,
    slug: decision.service.slug,
    name: decision.service.name,
    endpoint: decision.service.endpoint,
    method: decision.service.method,
    priceUsdc: decision.expectedPriceUsd,
    reasoning: decision.reasoning,
  };
}

export function createHostedWorkflowPlan(input: {
  request: HostedWorkflowRequest;
  services: ApiService[];
  allowlist: readonly { slug: string; endpoint: string; method: ServiceMethod }[];
}): HostedPlannerSnapshot {
  const allowedServices = input.services.filter((service) =>
    input.allowlist.some(
      (allowed) =>
        allowed.slug === service.slug &&
        allowed.endpoint === service.endpoint &&
        allowed.method === service.method,
    ),
  );
  const effectiveTask = effectiveWorkflowTask(input.request);
  const inputMetadata = hostedWorkflowInputMetadata(input.request.inputText ?? "");
  const plan = planAgentPurchases({
    task: effectiveTask,
    budgetUsdc: input.request.budgetUsdc,
    services: allowedServices,
    policy: {
      allowOfficial: true,
      allowSellerCreated: false,
      maxPaidCalls: HOSTED_WORKFLOW_MAX_PAID_CALLS,
      maxServicePriceUsd: input.request.budgetUsdc,
    },
  });

  return {
    version: 2,
    workflowType: input.request.workflowType,
    workflowLabel: workflowLabel(input.request.workflowType),
    effectiveTask,
    selectedServices: plan.selected.map(safeService),
    skippedServices: plan.skipped.map(safeService),
    estimatedSpendUsdc: plan.estimatedSpendUsdc,
    remainingBudgetUsdc: plan.remainingBudgetUsdc,
    maxPaidCalls: HOSTED_WORKFLOW_MAX_PAID_CALLS,
    budgetCapUsdc: input.request.budgetUsdc,
    aggregationMode: "deterministic_structured",
    aggregationLabel: "Structured workflow result (no LLM configured)",
    inputPreview: inputMetadata.preview,
    inputSha256: inputMetadata.sha256,
    warnings: plan.warnings,
  };
}

function findingForResult(result: BuyerAgentServiceResult) {
  if (result.status === "failed") {
    return `${result.serviceName} failed; the report preserves the partial result without retrying a payment automatically.`;
  }
  const response = result.response as Record<string, unknown> | null;
  if (result.serviceSlug === "text-analyzer" && response) {
    return `Text Analyzer measured ${String(response.word_count ?? "unknown")} words, ${String(response.sentence_count ?? "unknown")} sentences, and ${String(response.char_count ?? "unknown")} characters.`;
  }
  if (result.serviceSlug === "premium-quote" && response?.quote) {
    return `Premium Quote returned: ${String(response.quote)}`;
  }
  return `${result.serviceName} returned a structured paid API result.`;
}

function deterministicWorkflowFindings(request: HostedWorkflowRequest) {
  const text = request.inputText?.trim() ?? "";
  if (!text) return [];
  const words: string[] = text.toLowerCase().match(/[a-z0-9'-]+/g) ?? [];
  if (request.workflowType === "sentiment_tone") {
    const positive = new Set([
      "clear", "good", "great", "helpful", "improved", "ready", "stable",
      "strong", "successful", "thoughtful", "trustworthy", "useful",
    ]);
    const negative = new Set([
      "bad", "blocked", "broken", "confusing", "failed", "risk", "slow",
      "unstable", "unclear", "weak", "worse",
    ]);
    const positiveCount = words.filter((word) => positive.has(word)).length;
    const negativeCount = words.filter((word) => negative.has(word)).length;
    const sentiment = positiveCount > negativeCount
      ? "positive"
      : negativeCount > positiveCount
        ? "negative"
        : "neutral or mixed";
    const tone = /!/.test(text)
      ? "emphatic"
      : /\b(must|urgent|immediately|critical)\b/i.test(text)
        ? "urgent"
        : "measured";
    return [
      `Deterministic keyword heuristic: ${sentiment} sentiment (${positiveCount} positive and ${negativeCount} negative signal words).`,
      `Deterministic punctuation/keyword heuristic: ${tone} tone.`,
    ];
  }
  if (request.workflowType === "builder_update") {
    const deliverySignals = [
      "built", "fixed", "launched", "merged", "released", "shipped", "tested",
    ].filter((signal) => words.includes(signal));
    const riskSignals = ["blocked", "bug", "delay", "failed", "risk"].filter(
      (signal) => words.includes(signal),
    );
    return [
      `Deterministic builder signal scan found ${deliverySignals.length} delivery marker(s)${deliverySignals.length ? `: ${deliverySignals.join(", ")}` : "."}`,
      `Deterministic risk scan found ${riskSignals.length} risk marker(s)${riskSignals.length ? `: ${riskSignals.join(", ")}` : "."}`,
    ];
  }
  if (request.workflowType === "market_context") {
    const directionalSignals = [
      "down", "decreased", "declined", "grew", "growth", "increased", "rose", "up",
    ].filter((signal) => words.includes(signal));
    const riskSignals = [
      "risk", "uncertain", "uncertainty", "volatile", "volatility",
    ].filter((signal) => words.includes(signal));
    const numericSignals = text.match(/(?:\$|€|£)?\d+(?:\.\d+)?%?/g) ?? [];
    return [
      `Input-supplied market context contains ${numericSignals.length} numeric signal(s) and ${directionalSignals.length} directional marker(s).`,
      `Deterministic risk scan found ${riskSignals.length} market-risk marker(s)${riskSignals.length ? `: ${riskSignals.join(", ")}` : "."}`,
      "No live market feed or model inference was used; conclusions are limited to the submitted source and paid API responses.",
    ];
  }
  return [
    `Custom workflow supplied ${words.length} source word(s) for deterministic aggregation.`,
  ];
}

export function buildHostedFinalReport(input: {
  jobId: string;
  request: HostedWorkflowRequest;
  plan: HostedPlannerSnapshot;
  agentRunId: string | null;
  agentWallet: string;
  spentUsdc: string;
  receiptIds: string[];
  proofTransactionHashes: string[];
  serviceResults: BuyerAgentServiceResult[];
  explorerUrl: string;
}): HostedFinalReport {
  const paidCount = input.serviceResults.filter((result) => result.status === "paid").length;
  const failedCount = input.serviceResults.filter((result) => result.status === "failed").length;
  const inputMetadata = hostedWorkflowInputMetadata(input.request.inputText ?? "");
  return {
    version: 2,
    workflowType: input.request.workflowType,
    aggregationMode: "deterministic_structured",
    aggregationLabel: "Structured workflow result (no LLM configured)",
    input: {
      preview: inputMetadata.preview,
      sha256: inputMetadata.sha256,
    },
    summary: `${workflowLabel(input.request.workflowType)} completed ${paidCount} of ${input.plan.selectedServices.length} selected paid API call(s) using deterministic aggregation${failedCount > 0 ? `; ${failedCount} call(s) failed` : ""}.`,
    keyFindings: [
      ...deterministicWorkflowFindings(input.request),
      ...input.serviceResults.map(findingForResult),
    ],
    apiResults: input.serviceResults,
    selectedServices: input.plan.selectedServices,
    skippedServices: input.plan.skippedServices,
    spentUsdc: input.spentUsdc,
    receiptIds: input.receiptIds,
    proofTransactionHashes: input.proofTransactionHashes,
    links: {
      hostedResult: `/agent-runner/${input.jobId}`,
      agentRun: input.agentRunId ? `/runs/${input.agentRunId}` : null,
      receipts: `/receipts?wallet=${input.agentWallet}`,
      passport: `/agents/${input.agentWallet}`,
      proofTransactions: input.proofTransactionHashes.map(
        (hash) => `${input.explorerUrl.replace(/\/$/, "")}/tx/${hash}`,
      ),
    },
    completedWithWarnings: failedCount > 0,
    generatedAt: new Date().toISOString(),
  };
}
