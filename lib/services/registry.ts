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

export type ServiceMethod = "GET" | "POST";

export type DemoService = {
  id: string;
  name: string;
  description: string;
  category: string;
  method: ServiceMethod;
  endpoint: string;
  priceLabel: string;
  status: string;
  exampleUseCase: string;
};

export const serviceRegistry = [
  {
    id: "premium-quote",
    name: "Premium Quote",
    description:
      "A simple paid response that proves the agent can satisfy an x402 payment requirement and receive protected content.",
    category: "Premium Content",
    method: "GET",
    endpoint: "/api/premium/quote",
    priceLabel: "0.001 USDC",
    status: "Live x402 sample",
    exampleUseCase:
      "An agent buys a concise premium insight before drafting a report.",
  },
  {
    id: "market-snapshot",
    name: "Market Snapshot",
    description:
      "A mock market data response for testing paid financial signals, token summaries, and lightweight research workflows.",
    category: "Market Data",
    method: "GET",
    endpoint: "/api/premium/dataset",
    priceLabel: "0.01 USDC",
    status: "Live x402 sample",
    exampleUseCase:
      "An agent checks current market context before choosing the next analysis step.",
  },
  {
    id: "text-analyzer",
    name: "Text Analyzer",
    description:
      "A paid text utility that accepts content and returns structured analysis metadata for downstream agent tasks.",
    category: "Analysis",
    method: "POST",
    endpoint: "/api/premium/compute",
    priceLabel: "0.0003 USDC",
    status: "Live x402 sample",
    exampleUseCase:
      "An agent pays to summarize sentiment, entities, and action items from a supplied text block.",
  },
  {
    id: "weather-signal",
    name: "Weather Signal",
    description:
      "A mock location-aware weather signal for testing paid environmental data calls and routing decisions.",
    category: "Signals",
    method: "GET",
    endpoint: "/api/store/weather",
    priceLabel: "0.002 USDC",
    status: "Registry only",
    exampleUseCase:
      "An agent buys a weather signal before planning a local delivery or travel recommendation.",
  },
  {
    id: "agent-task",
    name: "Agent Task",
    description:
      "A higher-priced multi-step service that returns a task payload for buyer-agent reasoning and purchase logging demos.",
    category: "Workflow",
    method: "GET",
    endpoint: "/api/premium/agent-task",
    priceLabel: "0.03 USDC",
    status: "Live x402 sample",
    exampleUseCase:
      "An agent purchases a task bundle and records why the paid call was necessary.",
  },
] satisfies readonly DemoService[];

export function getServiceById(serviceId: string) {
  return serviceRegistry.find((service) => service.id === serviceId);
}
