/**
 * Copyright 2026 Circle Internet Group, Inc.  All rights reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { after, NextRequest, NextResponse } from "next/server";
import {
  getHostedAgentJob,
  listRecentHostedAgentJobs,
  launchHostedAgentJob,
  runHostedAgentJob,
} from "@/lib/agent/hosted-jobs";
import {
  getHostedRunnerConfig,
  hostedIdempotencyHash,
  hostedRequesterFingerprint,
  optionalRequesterWallet,
  safeHostedError,
  validateIdempotencyKey,
} from "@/lib/agent/hosted-policy";
import { validateHostedWorkflowRequest } from "@/lib/agent/hosted-workflows";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  let workflowRequest: ReturnType<typeof validateHostedWorkflowRequest>;
  let requesterWallet: string | null;
  let idempotencyKey: string;

  try {
    const body = (await request.json()) as {
      workflowType?: unknown;
      task?: unknown;
      inputText?: unknown;
      budgetUsdc?: unknown;
      requesterWallet?: unknown;
    };
    workflowRequest = validateHostedWorkflowRequest(body);
    requesterWallet = optionalRequesterWallet(body.requesterWallet);
    idempotencyKey = validateIdempotencyKey(
      request.headers.get("idempotency-key"),
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Invalid launch request." },
      { status: 400 },
    );
  }

  try {
    const config = getHostedRunnerConfig();
    const result = await launchHostedAgentJob({
      idempotencyHash: hostedIdempotencyHash(
        config.rateLimitSecret,
        idempotencyKey,
      ),
      requesterFingerprint: hostedRequesterFingerprint({
        secret: config.rateLimitSecret,
        forwardedFor: request.headers.get("x-forwarded-for"),
        userAgent: request.headers.get("user-agent"),
      }),
      requesterWallet,
      request: workflowRequest,
    });

    if (!result.jobId) {
      const status = result.reason === "active_job" ? 409 : 429;
      return NextResponse.json(
        {
          error:
            result.reason === "active_job"
              ? "The project demo wallet already has an active hosted run."
              : result.reason === "cooldown"
                ? "Please wait for the public hosted-run cooldown."
                : "Hosted-run rate limit reached.",
          reason: result.reason,
          retryAfterSeconds: result.retryAfterSeconds,
        },
        {
          status,
          headers: { "Retry-After": String(result.retryAfterSeconds) },
        },
      );
    }

    const job = await getHostedAgentJob(result.jobId);
    if (job?.status === "queued") {
      after(async () => {
        try {
          await runHostedAgentJob(result.jobId!);
        } catch (error) {
          console.error(
            `[hosted-agent] background launch failed for job=${result.jobId}: ${safeHostedError(error)}`,
          );
        }
      });
    }

    return NextResponse.json(
      {
        jobId: result.jobId,
        created: result.created,
        idempotent: result.reason === "idempotent",
        status: job?.status ?? "queued",
        statusUrl: `/api/hosted-agent/jobs/${result.jobId}`,
        hostedRunUrl: `/agent-runner/${result.jobId}`,
      },
      { status: result.created ? 202 : 200 },
    );
  } catch (error) {
    console.error(`[hosted-agent] launch unavailable: ${safeHostedError(error)}`);
    return NextResponse.json(
      { error: "Hosted buyer-agent is temporarily unavailable." },
      { status: 503 },
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const rawLimit = Number(request.nextUrl.searchParams.get("limit") ?? "8");
    const jobs = await listRecentHostedAgentJobs(Number.isFinite(rawLimit) ? rawLimit : 8);
    return NextResponse.json({ jobs }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error(`[hosted-agent] history unavailable: ${safeHostedError(error)}`);
    return NextResponse.json(
      { error: "Unable to load hosted workflow history." },
      { status: 503 },
    );
  }
}
