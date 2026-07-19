/**
 * Copyright 2026 Circle Internet Group, Inc.  All rights reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { redirect } from "next/navigation";
import { HostedAgentRunner } from "./hosted-agent-runner";
import { getHostedRunnerDiagnostic } from "@/lib/agent/hosted-policy";
import { listRecentHostedAgentJobs } from "@/lib/agent/hosted-jobs";

export const metadata = {
  title: "Real-Input Hosted Agent Workflows | Arc Agent Commerce",
  description: "Submit real text to allowlisted multi-service x402 workflows with privacy-safe dynamic reports and verified Arc proofs.",
};

export const dynamic = "force-dynamic";

type PageProps = { searchParams: Promise<{ job?: string }> };

function recentHistoryWithTimeout() {
  return Promise.race([
    listRecentHostedAgentJobs(8),
    new Promise<Awaited<ReturnType<typeof listRecentHostedAgentJobs>>>((resolve) => {
      setTimeout(() => resolve([]), 3_000);
    }),
  ]).catch(() => []);
}

export default async function AgentRunnerPage({ searchParams }: PageProps) {
  const { job } = await searchParams;
  if (job && /^[0-9a-f-]{36}$/i.test(job)) redirect(`/agent-runner/${job}`);
  const [diagnostic, history] = await Promise.all([
    Promise.resolve(getHostedRunnerDiagnostic()),
    recentHistoryWithTimeout(),
  ]);
  return <HostedAgentRunner diagnostic={diagnostic} initialHistory={history} />;
}
