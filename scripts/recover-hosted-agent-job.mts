/**
 * Copyright 2026 Circle Internet Group, Inc.  All rights reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { recoverAndRunHostedAgentJob } from "../lib/agent/hosted-jobs.ts";

function getJobId() {
  const index = process.argv.indexOf("--job");
  const jobId = index >= 0 ? process.argv[index + 1] : null;
  if (
    !jobId ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(jobId)
  ) {
    throw new Error("Usage: npm run hosted:recover -- --job <uuid>");
  }
  return jobId;
}

async function main() {
  const jobId = getJobId();
  console.log(`[hosted-recovery] job=${jobId} checking safe recovery eligibility`);
  const result = await recoverAndRunHostedAgentJob(jobId);
  if (!result.recovered) {
    throw new Error(
      "Job is not a recoverable pre-payment failure, or another hosted run is active.",
    );
  }
  if ("error" in result.execution) {
    throw new Error(`Recovered execution failed: ${result.execution.error}`);
  }
  console.log(`[hosted-recovery] job=${jobId} completed`);
}

main().catch((error) => {
  console.error(
    `[hosted-recovery] failed: ${error instanceof Error ? error.message : "Unknown error"}`,
  );
  process.exitCode = 1;
});
