/**
 * Copyright 2026 Circle Internet Group, Inc.  All rights reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ServicePresentationMetadata } from "./presentation.ts";

export type ServiceMethod = "GET" | "POST";
export type ServiceStatus =
  | "draft"
  | "live"
  | "mock"
  | "coming-soon"
  | "disabled";
export type ServiceSourceType =
  | "static"
  | "provider_backed"
  | "seller_mock"
  | "external_placeholder";

export type ApiService = {
  id: string;
  slug: string;
  name: string;
  shortDescription: string;
  longDescription: string;
  category: string;
  method: ServiceMethod;
  endpoint: string;
  priceLabel: string;
  priceUsd: number;
  status: ServiceStatus;
  sourceType: ServiceSourceType;
  presentation?: ServicePresentationMetadata;
  isPaid: boolean;
  inputSchema: unknown;
  outputSchema: unknown;
  exampleRequest: unknown;
  exampleResponse: unknown;
  exampleUseCase: string;
  agentReasoningHint: string;
};

const emptyInputSchema = {
  type: "object",
  properties: {},
  additionalProperties: false,
};

export const serviceRegistry = [
  {
    id: "premium-quote",
    slug: "premium-quote",
    name: "Premium Quote",
    shortDescription: "A simple paid quote endpoint for testing x402 access.",
    longDescription:
      "Premium Quote is the smallest live service in the store. It proves the full agent-commerce loop: discover a paid API, receive an HTTP 402 payment requirement, pay the requested USDC amount through x402 and Circle Gateway, then receive a protected response.",
    category: "Research",
    method: "GET",
    endpoint: "/api/premium/quote",
    priceLabel: "0.001 USDC",
    priceUsd: 0.001,
    status: "live",
    sourceType: "static",
    isPaid: true,
    inputSchema: emptyInputSchema,
    outputSchema: {
      type: "object",
      properties: {
        quote: { type: "string" },
        category: { type: "string" },
        timestamp: { type: "string", format: "date-time" },
      },
      required: ["quote", "category", "timestamp"],
    },
    exampleRequest: {
      method: "GET",
      endpoint: "/api/premium/quote",
    },
    exampleResponse: {
      quote: "The best way to predict the future is to invent it. - Alan Kay",
      category: "technology",
      timestamp: "2026-05-18T10:00:00.000Z",
    },
    exampleUseCase:
      "An agent buys a concise premium insight before drafting a report or deciding whether a longer research step is worth paying for.",
    agentReasoningHint:
      "Use this service when the task needs a low-cost proof of payment, a short premium quote, or a simple end-to-end x402 check.",
  },
  {
    id: "market-snapshot",
    slug: "market-snapshot",
    name: "Demo Dataset",
    shortDescription: "An internal deterministic dataset retained for compatibility.",
    longDescription:
      "Demo Dataset returns a fixed internal dataset for integration testing. It is not live market data and is retained so existing routes and links continue to work.",
    category: "Demo Data",
    method: "GET",
    endpoint: "/api/premium/dataset",
    priceLabel: "0.01 USDC",
    priceUsd: 0.01,
    status: "live",
    sourceType: "static",
    isPaid: true,
    inputSchema: emptyInputSchema,
    outputSchema: {
      type: "object",
      properties: {
        dataset: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: { type: "number" },
              metric: { type: "string" },
              value: { type: "number" },
              unit: { type: "string" },
            },
            required: ["id", "metric", "value", "unit"],
          },
        },
        generated_at: { type: "string", format: "date-time" },
      },
      required: ["dataset", "generated_at"],
    },
    exampleRequest: {
      method: "GET",
      endpoint: "/api/premium/dataset",
    },
    exampleResponse: {
      dataset: [
        { id: 1, metric: "daily_active_users", value: 14200, unit: "users" },
        { id: 2, metric: "avg_session_duration", value: 8.4, unit: "minutes" },
      ],
      generated_at: "2026-05-18T10:00:00.000Z",
    },
    exampleUseCase:
      "A developer purchases a deterministic fixture while testing an x402 integration.",
    agentReasoningHint:
      "Use only for deterministic developer testing; never present this response as live market data.",
  },
  {
    id: "pyth-market-price",
    slug: "pyth-market-price",
    name: "Live Market Price",
    shortDescription: "Provider-backed BTC, ETH, and SOL prices from Pyth Network.",
    longDescription:
      "Arc Agent Commerce charges the agent for a provider-backed API service through x402. The server then fetches and normalizes current price data sourced from Pyth Network. The agent pays Arc Agent Commerce, not Pyth Network.",
    category: "Market Data",
    method: "POST",
    endpoint: "/api/provider/pyth/price",
    priceLabel: "0.001 USDC",
    priceUsd: 0.001,
    status: "live",
    sourceType: "provider_backed",
    presentation: {
      providerType: "live_provider",
      providerName: "Pyth Network",
      providerStatus: "live",
      assetSymbol: null,
      dataFreshness: "Price update age must be 120 seconds or less",
      billingLabel:
        "0.001 USDC pays Arc Agent Commerce for access to its Pyth-backed API, not Pyth Network directly.",
    },
    isPaid: true,
    inputSchema: {
      type: "object",
      properties: {
        symbol: {
          type: "string",
          enum: ["BTC/USD", "ETH/USD", "SOL/USD"],
        },
      },
      required: ["symbol"],
      additionalProperties: false,
    },
    outputSchema: {
      type: "object",
      properties: {
        provider: { type: "string", const: "Pyth Network" },
        symbol: { type: "string" },
        price: { type: "string" },
        confidence: { type: "string" },
        confidenceInterval: {
          type: "object",
          properties: {
            low: { type: "string" },
            high: { type: "string" },
          },
          required: ["low", "high"],
        },
        publishTime: { type: "string", format: "date-time" },
        fetchedAt: { type: "string", format: "date-time" },
        priceAgeSeconds: { type: "number" },
        freshnessThresholdSeconds: { type: "number" },
        sourceStatus: { type: "string", const: "live" },
        paidAmountUsdc: { type: "string", const: "0.001" },
      },
      required: [
        "provider",
        "symbol",
        "price",
        "confidence",
        "confidenceInterval",
        "publishTime",
        "fetchedAt",
        "priceAgeSeconds",
        "freshnessThresholdSeconds",
        "sourceStatus",
        "paidAmountUsdc",
      ],
    },
    exampleRequest: {
      method: "POST",
      endpoint: "/api/provider/pyth/price",
      body: { symbol: "BTC/USD" },
    },
    exampleResponse: {
      provider: "Pyth Network",
      symbol: "BTC/USD",
      price: "68432.12",
      confidence: "1.25",
      confidenceInterval: { low: "68430.87", high: "68433.37" },
      publishTime: "2026-07-19T12:00:00.000Z",
      fetchedAt: "2026-07-19T12:00:02.000Z",
      priceAgeSeconds: 2,
      freshnessThresholdSeconds: 120,
      sourceStatus: "live",
      paidAmountUsdc: "0.001",
    },
    exampleUseCase:
      "A hosted agent buys current BTC, ETH, or SOL context before producing a market brief with traceable receipts and Arc proofs.",
    agentReasoningHint:
      "Use for tasks that require current BTC, ETH, SOL, crypto price, or market context. Never invent a price if the provider is unavailable.",
  },
  {
    id: "text-analyzer",
    slug: "text-analyzer",
    name: "Text Analyzer",
    shortDescription: "A paid compute endpoint for analyzing submitted text.",
    longDescription:
      "Text Analyzer models a paid compute API. The buyer sends text, pays per request, and receives structured metadata that can feed another agent step, workflow, or dashboard.",
    category: "Compute",
    method: "POST",
    endpoint: "/api/premium/compute",
    priceLabel: "0.0003 USDC",
    priceUsd: 0.0003,
    status: "live",
    sourceType: "static",
    isPaid: true,
    inputSchema: {
      type: "object",
      properties: {
        text: {
          type: "string",
          description: "Text content to analyze.",
        },
      },
      required: ["text"],
    },
    outputSchema: {
      type: "object",
      properties: {
        summary: { type: "string" },
        word_count: { type: "number" },
        sentence_count: { type: "number" },
        char_count: { type: "number" },
        timestamp: { type: "string", format: "date-time" },
      },
      required: [
        "summary",
        "word_count",
        "sentence_count",
        "char_count",
        "timestamp",
      ],
    },
    exampleRequest: {
      method: "POST",
      endpoint: "/api/premium/compute",
      body: {
        text: "Agents can buy tiny API calls when the result is worth the price.",
      },
    },
    exampleResponse: {
      summary: "Input contains 12 words across 1 sentence(s).",
      word_count: 12,
      sentence_count: 1,
      char_count: 68,
      timestamp: "2026-05-18T10:00:00.000Z",
    },
    exampleUseCase:
      "An agent pays for a quick text analysis step before saving structured notes into a larger workflow.",
    agentReasoningHint:
      "Use this service when the task needs deterministic text metadata and the price is lower than running a heavier model call.",
  },
  {
    id: "agent-task",
    slug: "agent-task",
    name: "Agent Task",
    shortDescription: "A higher-value paid task endpoint for agent workflows.",
    longDescription:
      "Agent Task represents a more expensive service where the response can unlock a multi-step task, puzzle, work order, or higher-value unit of agent work. It is useful for testing purchase reasoning and spending-policy decisions.",
    category: "Agent Work",
    method: "GET",
    endpoint: "/api/premium/agent-task",
    priceLabel: "0.03 USDC",
    priceUsd: 0.03,
    status: "live",
    sourceType: "static",
    isPaid: true,
    inputSchema: emptyInputSchema,
    outputSchema: {
      type: "object",
      properties: {
        clue: { type: "string" },
        step: { type: "number" },
        total_steps: { type: "number" },
        timestamp: { type: "string", format: "date-time" },
      },
      required: ["clue", "step", "total_steps", "timestamp"],
    },
    exampleRequest: {
      method: "GET",
      endpoint: "/api/premium/agent-task",
    },
    exampleResponse: {
      clue: "Look for the old lighthouse on the western shore. The keeper left a journal.",
      step: 2,
      total_steps: 5,
      timestamp: "2026-05-18T10:00:00.000Z",
    },
    exampleUseCase:
      "An agent buys a task payload only after deciding the expected value justifies a higher per-request price.",
    agentReasoningHint:
      "Use this service when the agent has remaining budget and needs a richer paid task response than a simple quote or dataset.",
  },
  {
    id: "weather-signal",
    slug: "weather-signal",
    name: "Weather Signal",
    shortDescription: "A planned paid weather signal for future expansion.",
    longDescription:
      "Weather Signal is a coming-soon service that shows how the API Store can expand beyond the current premium sample endpoints. It documents the future service contract without adding a protected route in this phase.",
    category: "Signals",
    method: "GET",
    endpoint: "/api/store/weather-signal",
    priceLabel: "0.002 USDC",
    priceUsd: 0.002,
    status: "coming-soon",
    sourceType: "static",
    isPaid: true,
    inputSchema: {
      type: "object",
      properties: {
        location: {
          type: "string",
          description: "City or region for the signal.",
        },
      },
      required: ["location"],
    },
    outputSchema: {
      type: "object",
      properties: {
        location: { type: "string" },
        signal: { type: "string" },
        confidence: { type: "number" },
        generated_at: { type: "string", format: "date-time" },
      },
      required: ["location", "signal", "confidence", "generated_at"],
    },
    exampleRequest: {
      method: "GET",
      endpoint: "/api/store/weather-signal?location=San%20Francisco",
    },
    exampleResponse: {
      location: "San Francisco",
      signal: "Mild coastal conditions expected; low weather risk.",
      confidence: 0.82,
      generated_at: "2026-05-18T10:00:00.000Z",
    },
    exampleUseCase:
      "An agent checks a paid local signal before planning a delivery, travel recommendation, or field-work schedule.",
    agentReasoningHint:
      "Use this planned service when the agent needs location context and can justify paying for a concise external signal.",
  },
] satisfies readonly ApiService[];

export function getServiceById(serviceId: string) {
  return serviceRegistry.find((service) => service.id === serviceId);
}

export function getServiceBySlug(slug: string) {
  return serviceRegistry.find((service) => service.slug === slug);
}

export function getServiceByEndpoint(endpoint: string) {
  return serviceRegistry.find((service) => service.endpoint === endpoint);
}

export const serviceCategories = Array.from(
  new Set(serviceRegistry.map((service) => service.category)),
).sort();

export const serviceStatuses: readonly ServiceStatus[] = [
  "draft",
  "live",
  "mock",
  "coming-soon",
  "disabled",
];
