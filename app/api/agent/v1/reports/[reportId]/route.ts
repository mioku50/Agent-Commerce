/**
 * Copyright 2026 Circle Internet Group, Inc. All rights reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { NextRequest, NextResponse } from "next/server.js";
import { authenticateMachineRequest } from "../../../../../../lib/api/machine-auth.ts";
import { createMachineErrorResponse } from "../../../../../../lib/api/machine-errors.ts";
import {
  getHostedAgentJob,
  getHostedAgentJobView,
  type HostedAgentJobRow,
} from "../../../../../../lib/agent/hosted-jobs.ts";
import {
  buildGitHubPublicReport,
  formatGitHubPublicReportAsMarkdown,
  type HostedWorkflowArcProofItem,
  type HostedWorkflowReceiptItem,
} from "../../../../../../lib/reports/github-public-report.ts";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type RouteContext = { params: Promise<{ reportId: string }> };

function buildReportFromJob(
  job: HostedAgentJobRow,
  jobView: Awaited<ReturnType<typeof getHostedAgentJobView>>,
) {
  const structuredResult = job.structured_result as any;
  const workflowData = structuredResult?.workflowData || {};
  const snapshot = workflowData.snapshot || null;
  const assessment = workflowData.assessment || null;
  const plannerRepo = (job.planner_snapshot as any)?.repository;

  const repoRef =
    workflowData.repository ||
    plannerRepo ||
    structuredResult?.repository ||
    job.planner_snapshot?.repository;

  const repository = repoRef
    ? {
        fullName: repoRef.fullName || String(job.input_preview || "repository"),
        canonicalUrl:
          repoRef.canonicalUrl ||
          `https://github.com/${repoRef.fullName || job.input_preview}`,
      }
    : job.input_preview
    ? {
        fullName: job.input_preview,
        canonicalUrl: job.input_preview.startsWith("http")
          ? job.input_preview
          : `https://github.com/${job.input_preview}`,
      }
    : null;

  const mappedStatus =
    job.status === "completed"
      ? structuredResult?.completedWithWarnings
        ? "completed_with_warnings"
        : "completed"
      : job.status;

  const proofs: HostedWorkflowArcProofItem[] = (jobView?.proofs || []).map((p) => ({
    receiptId: p.receiptId,
    txHash: p.transactionHash || p.receiptId,
    status: p.status || "verified",
    explorerUrl:
      p.transactionUrl ||
      (p.transactionHash
        ? `https://explorer.testnet.arc.network/tx/${p.transactionHash}`
        : null),
    blockNumber: p.blockNumber,
    contractAddress: p.contractAddress,
  }));

  const fallbackProofs: HostedWorkflowArcProofItem[] = (job.proof_transaction_hashes || []).map(
    (hash) => ({
      txHash: hash,
      status: "verified",
      explorerUrl: `https://explorer.testnet.arc.network/tx/${hash}`,
    }),
  );

  const receipts: HostedWorkflowReceiptItem[] = (jobView?.services || []).map((s) => ({
    receiptId: s.receiptId || s.serviceSlug,
    serviceSlug: s.serviceSlug,
    serviceName: s.serviceName,
    priceUsdc: s.priceUsdc,
    status: s.status,
  }));

  const generatedAt =
    job.completed_at ||
    structuredResult?.generatedAt ||
    job.updated_at ||
    job.created_at ||
    new Date().toISOString();

  return buildGitHubPublicReport({
    jobId: job.id,
    workflow: job.workflow_type,
    status: mappedStatus,
    repository,
    snapshot,
    assessment,
    proofs: proofs.length > 0 ? proofs : fallbackProofs,
    receipts,
    generatedAt,
  });
}

export async function GET(request: NextRequest, { params }: RouteContext) {
  const authResult = await authenticateMachineRequest(request, "reports:read");
  if (!authResult.ok) {
    return authResult.response;
  }
  const { context } = authResult;

  const { reportId } = await params;
  if (!reportId || typeof reportId !== "string" || !reportId.trim()) {
    return createMachineErrorResponse(
      "report_not_found",
      "The specified workflow report could not be found.",
      404,
    );
  }

  let job: HostedAgentJobRow | null = null;
  let jobView: Awaited<ReturnType<typeof getHostedAgentJobView>> = null;
  try {
    job = await getHostedAgentJob(reportId.trim());
    if (job) {
      jobView = await getHostedAgentJobView(reportId.trim());
    }
  } catch (err) {
    console.error("[reports/[reportId]/route] Job query error:", err);
    return createMachineErrorResponse(
      "report_not_found",
      "The specified workflow report could not be found.",
      404,
    );
  }

  if (!job) {
    return createMachineErrorResponse(
      "report_not_found",
      "The specified workflow report could not be found.",
      404,
    );
  }

  // Enforce strict Machine API credential ownership
  const isOwner =
    job.byoa_agent_id === context.agentId &&
    job.machine_credential_id === context.credential.id;

  if (!isOwner) {
    return createMachineErrorResponse(
      "report_not_found",
      "The specified workflow report could not be found.",
      404,
    );
  }

  // Check completion: Return 400 report_not_ready if job is still in progress
  if (job.status !== "completed" && job.status !== "failed") {
    return createMachineErrorResponse(
      "report_not_ready",
      "Report execution is not ready yet.",
      400,
    );
  }

  const report = buildReportFromJob(job, jobView);

  // Content negotiation (Accept header)
  const acceptHeader =
    request.headers.get("accept") || request.headers.get("Accept") || "";
  const wantsMarkdown = acceptHeader.toLowerCase().includes("text/markdown");

  if (wantsMarkdown) {
    const markdown = formatGitHubPublicReportAsMarkdown(report);
    return new NextResponse(markdown, {
      status: 200,
      headers: {
        "Content-Type": "text/markdown; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  }

  return NextResponse.json(report, {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}
