/**
 * Copyright 2026 Circle Internet Group, Inc.  All rights reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { redirect } from "next/navigation";
import { HostedAgentRunner } from "./hosted-agent-runner";
import { getHostedRunnerDiagnostic } from "@/lib/agent/hosted-policy";
import { listRecentHostedAgentJobs } from "@/lib/agent/hosted-jobs";
import { parseHostedRunnerQuery } from "@/lib/agent/workflow-links";
import { getHostedWorkflowCheckoutDiagnostic } from "@/lib/agent/workflow-pricing";
import { getPublicSellerWorkflow, listPublicSellerWorkflows, type PublicSellerWorkflow } from "@/lib/seller/marketplace";
import { SellerWorkflowCards } from "@/components/seller-workflow-cards";
import { SellerWorkflowRunner } from "./seller-workflow-runner";
import { Badge } from "@/components/ui/badge";

export const metadata = {
  title: "Real-Input Hosted Agent Workflows | Arc Agent Commerce",
  description: "Submit real text to allowlisted multi-service x402 workflows with privacy-safe dynamic reports and verified Arc proofs.",
};

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<{
    job?: string | string[];
    workflow?: string | string[];
    symbol?: string | string[];
    repository?: string | string[];
    service?: string | string[];
  }>;
};

function recentHistoryWithTimeout() {
  return Promise.race([
    listRecentHostedAgentJobs(8),
    new Promise<Awaited<ReturnType<typeof listRecentHostedAgentJobs>>>((resolve) => {
      setTimeout(() => resolve([]), 3_000);
    }),
  ]).catch(() => []);
}

function sellerWorkflowsWithTimeout() {
  return Promise.race([
    listPublicSellerWorkflows(),
    new Promise<PublicSellerWorkflow[]>((resolve) => setTimeout(() => resolve([]), 3_000)),
  ]).catch(() => []);
}

export default async function AgentRunnerPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const job = Array.isArray(params.job) ? params.job[0] : params.job;
  if (job && /^[0-9a-f-]{36}$/i.test(job)) redirect(`/agent-runner/${job}`);
  const initialSelection = parseHostedRunnerQuery(params);
  const repositoryParam = Array.isArray(params.repository) ? params.repository[0] : params.repository;
  const serviceParam = Array.isArray(params.service) ? params.service[0] : params.service;
  if (serviceParam) {
    const workflow = await getPublicSellerWorkflow(serviceParam).catch(() => null);
    if (workflow?.availability === "available") return <SellerWorkflowRunner workflow={workflow} />;
  }
  const [diagnostic, history, sellerWorkflows] = await Promise.all([
    Promise.resolve({
      ...getHostedRunnerDiagnostic(),
      checkout: getHostedWorkflowCheckoutDiagnostic(),
    }),
    recentHistoryWithTimeout(),
    sellerWorkflowsWithTimeout(),
  ]);
  return (
    <>
      <HostedAgentRunner
        diagnostic={diagnostic}
        initialHistory={history}
        initialWorkflowType={initialSelection.workflowType}
        initialMarketSymbol={initialSelection.marketSymbol}
        initialRepository={repositoryParam}
      />
      {sellerWorkflows.length ? (
        <section className="border-t bg-secondary/10">
          <div className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6">
            <Badge variant="secondary">Community & Seller Workflows</Badge>
            <h2 className="mt-3 text-3xl font-bold">Run an external service</h2>
            <p className="mb-7 mt-3 max-w-3xl leading-7 text-muted-foreground">Choose a seller-published workflow, review its immutable price, and receive a schema-validated report.</p>
            <SellerWorkflowCards workflows={sellerWorkflows} />
          </div>
        </section>
      ) : null}
    </>
  );
}
