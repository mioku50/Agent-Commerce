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

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type RouteContext = { params: Promise<{ reportId: string }> };

export interface StructuredMachineReport {
  reportId: string;
  workflow: string;
  repository: {
    fullName: string;
    canonicalUrl: string;
  } | null;
  status: string;
  executiveSummary: string;
  projectPurpose: string;
  technology: {
    primaryLanguage: string;
    frameworks: string[];
    hasWorkflows: boolean;
    workflowCount: number;
  };
  activity: {
    commitCount30d: number;
    commitCount90d: number;
    commitCount180d: number;
    lastCommitAt: string | null;
  };
  strengths: string[];
  risks: Array<{
    code: string;
    title: string;
    severity: string;
    description: string;
    impact: string;
  }>;
  questionsBeforeAdoption: string[];
  confidence: string;
  verification: {
    status: string;
    network: string;
    proofs: Array<{
      receiptId?: string;
      txHash: string;
      status: string;
      explorerUrl: string | null;
    }>;
  };
  generatedAt: string;
}

function buildStructuredReport(
  job: HostedAgentJobRow,
  jobView: Awaited<ReturnType<typeof getHostedAgentJobView>>,
): StructuredMachineReport {
  const structuredResult = job.structured_result as any;
  const workflowData = structuredResult?.workflowData || {};
  const snapshot = workflowData.snapshot;
  const assessment = workflowData.assessment;
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

  const executiveSummary =
    assessment?.overallSummary ||
    structuredResult?.summary ||
    job.progress_message ||
    "Repository due diligence completed.";

  const projectPurpose =
    snapshot?.projectPurpose?.summary ||
    structuredResult?.summary ||
    job.task ||
    "Repository health and due diligence analysis.";

  const technology = snapshot?.stack
    ? {
        primaryLanguage: snapshot.stack.primaryLanguage || "Unknown",
        frameworks: snapshot.stack.detectedFrameworks || [],
        hasWorkflows: Boolean(snapshot.stack.hasWorkflows),
        workflowCount: snapshot.stack.workflowCount || 0,
      }
    : {
        primaryLanguage: "Unknown",
        frameworks: [],
        hasWorkflows: false,
        workflowCount: 0,
      };

  const activity = snapshot?.activity
    ? {
        commitCount30d: snapshot.activity.commitCount30d ?? 0,
        commitCount90d: snapshot.activity.commitCount90d ?? 0,
        commitCount180d: snapshot.activity.commitCount180d ?? 0,
        lastCommitAt: snapshot.activity.lastCommitAt ?? null,
      }
    : {
        commitCount30d: 0,
        commitCount90d: 0,
        commitCount180d: 0,
        lastCommitAt: null,
      };

  const strengths: string[] =
    assessment?.strengths && Array.isArray(assessment.strengths)
      ? assessment.strengths
      : structuredResult?.keyFindings && Array.isArray(structuredResult.keyFindings)
      ? structuredResult.keyFindings
      : [];

  const rawRisks = assessment?.risks && Array.isArray(assessment.risks) ? assessment.risks : [];
  const risks = rawRisks.map((r: any) => ({
    code: String(r.code || "risk_factor"),
    title: String(r.title || "Identified Risk"),
    severity: String(r.severity || "medium"),
    description: String(r.description || ""),
    impact: String(r.impact || ""),
  }));

  const questionsBeforeAdoption: string[] =
    assessment?.suggestedQuestions && Array.isArray(assessment.suggestedQuestions)
      ? assessment.suggestedQuestions
      : [];

  const confidence =
    snapshot?.source?.upstreamStatus === "fallback"
      ? "low"
      : assessment?.categories?.activity?.confidence || "high";

  const selectedCount =
    Array.isArray(job.selected_services) && job.selected_services.length > 0
      ? job.selected_services.length
      : Array.isArray(job.receipt_ids) && job.receipt_ids.length > 0
      ? job.receipt_ids.length
      : 1;

  const proofRecords = jobView?.proofs || [];
  const hasFailedProof = proofRecords.some((p) => p.status === "failed");

  const verifiedHashes = Array.isArray(job.proof_transaction_hashes)
    ? job.proof_transaction_hashes.filter((h): h is string => Boolean(h && typeof h === "string" && h.trim()))
    : [];

  const verifiedSteps =
    proofRecords.length > 0
      ? proofRecords.filter((p) => p.status === "verified" && Boolean(p.transactionHash)).length
      : verifiedHashes.length;

  let verificationStatus: string;
  if (hasFailedProof || (job.status === "failed" && verifiedSteps === 0)) {
    verificationStatus = "verification_failed";
  } else if (verifiedSteps > 0 && verifiedSteps >= selectedCount) {
    verificationStatus = "verified";
  } else if (verifiedSteps > 0 && verifiedSteps < selectedCount) {
    verificationStatus = "partially_verified";
  } else {
    verificationStatus = "verification_pending";
  }

  const proofs = (jobView?.proofs || []).map((p) => ({
    receiptId: p.receiptId,
    txHash: p.transactionHash || p.receiptId,
    status: p.status || "verified",
    explorerUrl:
      p.transactionUrl ||
      (p.transactionHash
        ? `https://explorer.testnet.arc.network/tx/${p.transactionHash}`
        : null),
  }));

  const fallbackProofs = (job.proof_transaction_hashes || []).map((hash) => ({
    txHash: hash,
    status: "verified",
    explorerUrl: `https://explorer.testnet.arc.network/tx/${hash}`,
  }));

  return {
    reportId: job.id,
    workflow: job.workflow_type,
    repository,
    status: mappedStatus,
    executiveSummary,
    projectPurpose,
    technology,
    activity,
    strengths,
    risks,
    questionsBeforeAdoption,
    confidence,
    verification: {
      status: verificationStatus,
      network: "arc-testnet",
      proofs: proofs.length > 0 ? proofs : fallbackProofs,
    },
    generatedAt:
      job.completed_at ||
      structuredResult?.generatedAt ||
      job.updated_at ||
      job.created_at ||
      new Date().toISOString(),
  };
}

function formatReportAsMarkdown(report: StructuredMachineReport): string {
  const repoHeader = report.repository
    ? `[${report.repository.fullName}](${report.repository.canonicalUrl})`
    : report.workflow;

  const strengthsList =
    report.strengths.length > 0
      ? report.strengths.map((s) => `- ${s}`).join("\n")
      : "- None noted.";

  const risksList =
    report.risks.length > 0
      ? report.risks
          .map(
            (r) =>
              `- **[${r.severity.toUpperCase()}]** ${r.title} (\`${r.code}\`)\n  ${r.description}\n  *Impact:* ${r.impact}`,
          )
          .join("\n")
      : "- No significant risk factors identified.";

  const questionsList =
    report.questionsBeforeAdoption.length > 0
      ? report.questionsBeforeAdoption.map((q) => `- ${q}`).join("\n")
      : "- Standard integration review recommended.";

  const proofsList =
    report.verification.proofs.length > 0
      ? report.verification.proofs
          .map(
            (p) =>
              `- \`${p.txHash}\` (${p.status})${p.explorerUrl ? ` — [View Arc Proof](${p.explorerUrl})` : ""}`,
          )
          .join("\n")
      : "- No on-chain proof metadata recorded.";

  return `# GitHub Due Diligence Report: ${repoHeader}

**Report ID:** \`${report.reportId}\`  
**Workflow:** \`${report.workflow}\`  
**Status:** \`${report.status}\`  
**Confidence:** \`${report.confidence}\`  
**Generated At:** ${report.generatedAt}

---

## Executive Summary
${report.executiveSummary}

## Project Purpose
${report.projectPurpose}

## Technology Stack
- **Primary Language:** ${report.technology.primaryLanguage}
- **Frameworks:** ${report.technology.frameworks.join(", ") || "None detected"}
- **Automated Workflows:** ${report.technology.hasWorkflows ? `${report.technology.workflowCount} GitHub Actions workflow(s)` : "None detected"}

## Activity Metrics
- **Commits (30d):** ${report.activity.commitCount30d}
- **Commits (90d):** ${report.activity.commitCount90d}
- **Commits (180d):** ${report.activity.commitCount180d}
- **Latest Commit:** ${report.activity.lastCommitAt || "N/A"}

## Verified Strengths
${strengthsList}

## Identified Risks
${risksList}

## Suggested Questions Before Adoption
${questionsList}

---

## Verification & Arc Proofs
- **Verification Status:** \`${report.verification.status}\`
- **Network:** \`${report.verification.network}\`

${proofsList}
`;
}

export async function GET(request: NextRequest, { params }: RouteContext) {
  const authResult = await authenticateMachineRequest(request, "reports:read");
  if (!authResult.ok) {
    return authResult.response;
  }
  const { context } = authResult;

  const { reportId } = await params;
  if (!reportId || typeof reportId !== "string" || !reportId.trim()) {
    return createMachineErrorResponse("report_not_found", "Report not found.", 404);
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
    return createMachineErrorResponse("report_not_found", "Report not found.", 404);
  }

  if (!job) {
    return createMachineErrorResponse("report_not_found", "Report not found.", 404);
  }

  // Scoped Access: Validate ownership against authenticated credential's owner/agent
  const isAgentOwner =
    (job.byoa_agent_id && job.byoa_agent_id === context.agentId) ||
    (job.requester_wallet &&
      job.requester_wallet.toLowerCase() === context.ownerWallet.toLowerCase());

  if (!isAgentOwner) {
    return createMachineErrorResponse(
      "report_not_found",
      "Report not found or not owned by this credential.",
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

  const report = buildStructuredReport(job, jobView);

  // Content negotiation (Accept header)
  const acceptHeader =
    request.headers.get("accept") || request.headers.get("Accept") || "";
  const wantsMarkdown = acceptHeader.toLowerCase().includes("text/markdown");

  if (wantsMarkdown) {
    const markdown = formatReportAsMarkdown(report);
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
