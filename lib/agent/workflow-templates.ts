/**
 * Copyright 2026 Circle Internet Group, Inc.  All rights reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ServicePresentationMetadata } from "../services/presentation.ts";
import { BRAND } from "../brand.ts";

export const HOSTED_WORKFLOW_TYPES = [
  "github_due_diligence",
  "agent_trust_report",
  "paid_api_quality",
  "sentiment_tone",
  "builder_update",
  "market_context",
  "custom_task",
] as const;

export type HostedWorkflowType = (typeof HOSTED_WORKFLOW_TYPES)[number];

export const CURATED_HOSTED_WORKFLOW_TYPES = [
  "github_due_diligence",
  "agent_trust_report",
  "paid_api_quality",
  "market_context",
  "sentiment_tone",
  "builder_update",
] as const satisfies readonly HostedWorkflowType[];

export type CuratedHostedWorkflowType =
  (typeof CURATED_HOSTED_WORKFLOW_TYPES)[number];

export function isCuratedHostedWorkflowType(
  value: string,
): value is CuratedHostedWorkflowType {
  return (CURATED_HOSTED_WORKFLOW_TYPES as readonly string[]).includes(value);
}

export type HostedWorkflowTemplate = {
  value: HostedWorkflowType;
  label: string;
  shortLabel: string;
  description: string;
  task: string;
  placeholder: string;
  estimatedSpendUsdc: number;
  benefitLabel: string;
  services: Array<{
    slug:
      | "text-analyzer"
      | "premium-quote"
      | "pyth-market-price"
      | "github-repository-intelligence"
      | "github-due-diligence-analysis"
      | "agent-trust-finalizer";
    name: string;
    priceUsdc: number;
    purpose: string;
    presentation: ServicePresentationMetadata;
  }>;
  expectedResult: string[];
};

const githubServices: HostedWorkflowTemplate["services"] = [
  {
    slug: "github-repository-intelligence",
    name: "GitHub Repository Intelligence",
    priceUsdc: 0.0015,
    purpose:
      "Fetches live public GitHub metadata, recent commits, releases, contributors, and governance files.",
    presentation: {
      providerType: "live_provider",
      providerName: "GitHub API",
      providerStatus: "live",
      assetSymbol: null,
      dataFreshness: "Sourced from live GitHub REST API with 5-minute cache",
      billingLabel:
        `0.0015 USDC pays ${BRAND.name} for access to its server-side GitHub intelligence provider.`,
    },
  },
  {
    slug: "github-due-diligence-analysis",
    name: "GitHub Due Diligence Analysis",
    priceUsdc: 0.0005,
    purpose:
      "Evaluates repository health, release discipline, governance risk, and activity metrics using deterministic assessment rules.",
    presentation: {
      providerType: "internal_deterministic",
      providerName: null,
      providerStatus: "deterministic",
      assetSymbol: null,
      dataFreshness: null,
      billingLabel:
        `0.0005 USDC pays ${BRAND.name} for deterministic due diligence analysis.`,
    },
  },
];

const commonServices: HostedWorkflowTemplate["services"] = [
  {
    slug: "text-analyzer",
    name: "Text Analyzer",
    priceUsdc: 0.0003,
    purpose: "Measures the submitted text and returns structured compute output.",
    presentation: {
      providerType: "internal_deterministic",
      providerName: null,
      providerStatus: "deterministic",
      assetSymbol: null,
      dataFreshness: null,
      billingLabel: `USDC pays ${BRAND.name} for this deterministic API service.`,
    },
  },
  {
    slug: "premium-quote",
    name: "Premium Quote",
    priceUsdc: 0.001,
    purpose: "Adds a paid, traceable research-context result to the report.",
    presentation: {
      providerType: "internal_deterministic",
      providerName: null,
      providerStatus: "deterministic",
      assetSymbol: null,
      dataFreshness: null,
      billingLabel: `USDC pays ${BRAND.name} for this deterministic API service.`,
    },
  },
];

const agentTrustFinalizerService: HostedWorkflowTemplate["services"][number] = {
  slug: "agent-trust-finalizer",
  name: "Agent Trust Report Finalizer",
  priceUsdc: 0.0001,
  purpose:
    "Publishes the canonical final report hash through the existing Arc proof pipeline.",
  presentation: {
    providerType: "internal_deterministic",
    providerName: null,
    providerStatus: "deterministic",
    assetSymbol: null,
    dataFreshness: null,
    billingLabel:
      `0.0001 USDC pays ${BRAND.name} for canonical report finalization and Arc proof publication.`,
  },
};

const marketServices: HostedWorkflowTemplate["services"] = [
  {
    slug: "text-analyzer",
    name: "Text Analyzer",
    priceUsdc: 0.0003,
    purpose: "Measures the submitted source text for deterministic report context.",
    presentation: {
      providerType: "internal_deterministic",
      providerName: null,
      providerStatus: "deterministic",
      assetSymbol: null,
      dataFreshness: null,
      billingLabel: `USDC pays ${BRAND.name} for this deterministic API service.`,
    },
  },
  {
    slug: "pyth-market-price",
    name: "Live Market Price",
    priceUsdc: 0.001,
    purpose: "Returns a normalized live BTC, ETH, or SOL price sourced from Pyth Network.",
    presentation: {
      providerType: "live_provider",
      providerName: "Pyth Network",
      providerStatus: "live",
      assetSymbol: null,
      dataFreshness: "Price update age must be 120 seconds or less",
      billingLabel: `0.001 USDC pays ${BRAND.name} for access to its Pyth-backed API, not Pyth Network directly.`,
    },
  },
];

export const hostedWorkflowTemplates: HostedWorkflowTemplate[] = [
  {
    value: "github_due_diligence",
    label: "GitHub Project Due Diligence",
    shortLabel: "GitHub Due Diligence",
    description:
      "Analyze a public GitHub repository and receive an evidence-backed project health report.",
    task: "Analyze the selected public GitHub repository using live repository data and deterministic due diligence rules.",
    placeholder: "https://github.com/owner/repository",
    estimatedSpendUsdc: 0.002,
    benefitLabel: "Live GitHub data · Maintenance & risk analysis · Arc verification",
    services: githubServices,
    expectedResult: [
      "Live repository metadata, commits, releases, and file presence",
      "Deterministic health status, category signals, and risk analysis",
      "Receipts and a verified Arc proof for every paid call",
    ],
  },
  {
    value: "agent_trust_report",
    label: `${BRAND.name} Agent Trust Report`,
    shortLabel: "Agent Trust Report",
    description:
      "Review identity, code health, execution history, service reliability, payments, and verification signals in one report.",
    task:
      "Build an evidence-backed Agent Trust Report from the supplied public identifiers and available Veyra signals.",
    placeholder: "Provide an Agent ID, wallet, or public GitHub repository",
    estimatedSpendUsdc: 0.0004,
    benefitLabel:
      "Identity · Code health · Execution history · Arc verification",
    services: [...githubServices, commonServices[0], agentTrustFinalizerService],
    expectedResult: [
      "Deterministic Trust Score with evidence for every category",
      "Identity, execution, payment, service, contract, and endpoint snapshots when available",
      "Receipts and Arc verification status without exposing private tenant data",
    ],
  },
  {
    value: "paid_api_quality",
    label: "Paid API Quality Report",
    shortLabel: "API Quality",
    description:
      "Evaluate and compare paid APIs using observed pricing, latency, availability, response validity, payment execution, and settlement history.",
    task:
      "Evaluate and compare paid APIs using observed pricing, latency, availability, response validity, payment execution, and settlement history.",
    placeholder:
      "Enter service ID(s) to evaluate, e.g. pyth-market-price, github-repository-intelligence…",
    estimatedSpendUsdc: 0.0013,
    benefitLabel:
      "Telemetry & benchmarking · Uptime & latency P95 · Arc verification",
    services: commonServices,
    expectedResult: [
      "Observed uptime, P50/P95 latency, and response validity metrics",
      "Payment execution success, settlement reliability, and cost efficiency",
      "Receipts and verified Arc proof trail for telemetry observations",
    ],
  },
  {
    value: "sentiment_tone",
    label: "Sentiment & Tone Report",
    shortLabel: "Sentiment & Tone",
    description:
      "Analyze real submitted text with deterministic tone heuristics and paid API results.",
    task: "Analyze this text and produce a sentiment and tone workflow report.",
    placeholder: "Paste the real text whose sentiment and tone you want to inspect…",
    estimatedSpendUsdc: 0.0013,
    benefitLabel: "Text analysis · Shareable report · Arc verification",
    services: commonServices,
    expectedResult: [
      "Sentiment and tone signals",
      "Text measurements from the paid compute API",
      "Receipts and a verified Arc proof for every paid call",
    ],
  },
  {
    value: "builder_update",
    label: "Builder Update Summary",
    shortLabel: "Builder Update",
    description:
      "Turn a shipping update, changelog, or project note into a concise traceable report.",
    task: "Analyze this builder update and extract a concise structured progress report.",
    placeholder: "Paste a real shipping update, changelog, or project status note…",
    estimatedSpendUsdc: 0.0013,
    benefitLabel: "Text analysis · Shareable report · Arc verification",
    services: commonServices,
    expectedResult: [
      "Delivery and risk signals",
      "A structured summary of the submitted update",
      "Receipts and a verified Arc proof for every paid call",
    ],
  },
  {
    value: "market_context",
    label: "Market Context Brief",
    shortLabel: "Market Context",
    description:
      "Choose BTC/USD, ETH/USD, or SOL/USD and combine user-supplied context with a paid live price sourced from Pyth Network.",
    task: "Analyze this submitted crypto market context using a live provider-backed price and produce an evidence-labeled brief.",
    placeholder: "Add the real market context or question you want analyzed for the selected asset…",
    estimatedSpendUsdc: 0.0013,
    benefitLabel: "Live market snapshot · Shareable report · Arc verification",
    services: marketServices,
    expectedResult: [
      "Live Pyth Network price and confidence interval",
      "Provider publish time, server fetch time, and price age",
      "Receipts and a verified Arc proof for every paid call",
    ],
  },
  {
    value: "custom_task",
    label: "Custom Task",
    shortLabel: "Custom Task",
    description:
      "Describe a useful task and let the guarded planner select only allowlisted paid services.",
    task: "Analyze my text and prepare a concise structured report with useful paid API context.",
    placeholder: "Paste the real source text for your custom allowlisted workflow…",
    estimatedSpendUsdc: 0.0013,
    benefitLabel: "Text analysis · Shareable report · Arc verification",
    services: commonServices,
    expectedResult: [
      "A planner-selected structured report",
      "Selected and skipped service reasoning",
      "Receipts and a verified Arc proof for every paid call",
    ],
  },
];

export const curatedHostedWorkflowTemplates = hostedWorkflowTemplates.filter(
  (template) => isCuratedHostedWorkflowType(template.value),
);

export function getHostedWorkflowTemplate(type: HostedWorkflowType) {
  return hostedWorkflowTemplates.find((template) => template.value === type);
}
