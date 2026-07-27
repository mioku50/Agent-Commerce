/**
 * Copyright 2026 Circle Internet Group, Inc. All rights reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { NextRequest, NextResponse } from "next/server.js";
import { authenticateMachineRequest } from "../../../../../lib/api/machine-auth.ts";
import { hostedWorkflowTemplates } from "../../../../../lib/agent/workflow-templates.ts";
import { ARC_TESTNET_CHAIN_ID, ARC_TESTNET_USDC_ADDRESS } from "../../../../../lib/wallet/arc.ts";
import { listPublicSellerWorkflows } from "../../../../../lib/seller/marketplace.ts";
import { sellerWorkflowAllowed } from "../../../../../lib/seller/workflow.ts";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function buildInputSchema(workflowType: string) {
  if (workflowType === "github_due_diligence") {
    return {
      type: "object",
      properties: {
        repository: {
          type: "string",
          description: "GitHub repository in owner/repo format or full URL (e.g., circlefin/agent-commerce)",
        },
      },
      required: ["repository"],
    };
  }

  if (workflowType === "market_context") {
    return {
      type: "object",
      properties: {
        marketSymbol: {
          type: "string",
          enum: ["BTC/USD", "ETH/USD", "SOL/USD"],
          description: "Crypto market pair to evaluate",
        },
        text: {
          type: "string",
          description: "Market analysis question or context notes",
        },
      },
      required: ["marketSymbol"],
    };
  }

  return {
    type: "object",
    properties: {
      text: {
        type: "string",
        description: "Text input for analysis and processing",
      },
    },
    required: ["text"],
  };
}

export async function GET(request: NextRequest) {
  const authResult = await authenticateMachineRequest(request, "workflows:read");
  if (!authResult.ok) {
    return authResult.response;
  }

  const { context } = authResult;
  const allowedSet = new Set(context.allowedWorkflows || []);

  const templates = hostedWorkflowTemplates
    .filter((template) => allowedSet.has("*") || allowedSet.has(template.value))
    .map((template) => ({
      id: template.value,
      name: template.label,
      shortName: template.shortLabel,
      description: template.description,
      task: template.task,
      estimatedUsdc: template.estimatedSpendUsdc,
      inputSchema: buildInputSchema(template.value),
      arc: {
        chainId: ARC_TESTNET_CHAIN_ID,
        network: "arc-testnet",
        asset: "USDC",
        tokenAddress: ARC_TESTNET_USDC_ADDRESS,
      },
    }));

  const sellerWorkflows = context.spendingPolicy.allowed_service_types.includes("external_seller")
    ? (await listPublicSellerWorkflows()).filter((workflow) =>
        sellerWorkflowAllowed(context.allowedWorkflows, workflow.workflowType)
      )
    : [];

  return NextResponse.json(
    {
      version: "1",
      workflows: [...templates, ...sellerWorkflows],
    },
    {
      status: 200,
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}
