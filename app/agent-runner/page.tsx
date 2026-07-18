/**
 * Copyright 2026 Circle Internet Group, Inc.  All rights reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { HostedAgentRunner } from "./hosted-agent-runner";
import { getHostedRunnerDiagnostic } from "@/lib/agent/hosted-policy";

export const metadata = {
  title: "Hosted Buyer-Agent | Arc Agent Commerce",
  description:
    "Launch a real allowlisted x402 buyer-agent run from the browser using the project-owned Arc Testnet demo wallet.",
};

type PageProps = {
  searchParams: Promise<{ job?: string }>;
};

export default async function AgentRunnerPage({ searchParams }: PageProps) {
  const { job } = await searchParams;
  const diagnostic = getHostedRunnerDiagnostic();

  return (
    <HostedAgentRunner
      initialJobId={
        job && /^[0-9a-f-]{36}$/i.test(job) ? job : null
      }
      diagnostic={diagnostic}
    />
  );
}
