/**
 * Copyright 2026 Circle Internet Group, Inc.  All rights reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

export const HOSTED_WORKFLOW_TYPES = [
  "sentiment_tone",
  "builder_update",
  "market_context",
  "custom_task",
] as const;

export type HostedWorkflowType = (typeof HOSTED_WORKFLOW_TYPES)[number];

export type HostedWorkflowTemplate = {
  value: HostedWorkflowType;
  label: string;
  shortLabel: string;
  description: string;
  task: string;
  placeholder: string;
  estimatedSpendUsdc: number;
  services: Array<{
    slug: "text-analyzer" | "premium-quote" | "pyth-market-price";
    name: string;
    priceUsdc: number;
    purpose: string;
  }>;
  expectedResult: string[];
};

const commonServices: HostedWorkflowTemplate["services"] = [
  {
    slug: "text-analyzer",
    name: "Text Analyzer",
    priceUsdc: 0.0003,
    purpose: "Measures the submitted text and returns structured compute output.",
  },
  {
    slug: "premium-quote",
    name: "Premium Quote",
    priceUsdc: 0.001,
    purpose: "Adds a paid, traceable research-context result to the report.",
  },
];

const marketServices: HostedWorkflowTemplate["services"] = [
  {
    slug: "text-analyzer",
    name: "Text Analyzer",
    priceUsdc: 0.0003,
    purpose: "Measures the submitted source text for deterministic report context.",
  },
  {
    slug: "pyth-market-price",
    name: "Live Market Price",
    priceUsdc: 0.001,
    purpose: "Returns a normalized live BTC, ETH, or SOL price sourced from Pyth Network.",
  },
];

export const hostedWorkflowTemplates: HostedWorkflowTemplate[] = [
  {
    value: "sentiment_tone",
    label: "Sentiment & Tone Report",
    shortLabel: "Sentiment & Tone",
    description:
      "Analyze real submitted text with deterministic tone heuristics and paid API results.",
    task: "Analyze this text and produce a sentiment and tone workflow report.",
    placeholder: "Paste the real text whose sentiment and tone you want to inspect…",
    estimatedSpendUsdc: 0.0013,
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
      "Combine a user-supplied market question with a paid live price sourced from Pyth Network.",
    task: "Analyze this submitted crypto market context using a live provider-backed price and produce an evidence-labeled brief.",
    placeholder: "Ask about BTC/USD, ETH/USD, or SOL/USD and include the context you want analyzed…",
    estimatedSpendUsdc: 0.0013,
    services: marketServices,
    expectedResult: [
      "Live Pyth Network price and confidence",
      "Provider publish and server fetch timestamps",
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
    services: commonServices,
    expectedResult: [
      "A planner-selected structured report",
      "Selected and skipped service reasoning",
      "Receipts and a verified Arc proof for every paid call",
    ],
  },
];

export function getHostedWorkflowTemplate(type: HostedWorkflowType) {
  return hostedWorkflowTemplates.find((template) => template.value === type);
}
