/**
 * Copyright 2026 Circle Internet Group, Inc.  All rights reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { notFound } from "next/navigation";
import { HostedJobResult } from "../hosted-job-result";
import { getHostedAgentJobView } from "@/lib/agent/hosted-jobs";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ jobId: string }> };

export default async function HostedJobResultPage({ params }: PageProps) {
  const { jobId } = await params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(jobId)) notFound();
  const view = await getHostedAgentJobView(jobId).catch(() => null);
  if (!view) notFound();
  return <HostedJobResult initialView={view} />;
}
