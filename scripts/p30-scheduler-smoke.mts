/**
 * Copyright 2026 Circle Internet Group, Inc. All rights reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { createClient } from "@supabase/supabase-js";
import { tryGetServerSupabaseConfig } from "../lib/supabase/server-env.ts";

const baseUrl = (
  process.env.VEYRA_PRODUCTION_URL ?? "https://agent-commerce-six.vercel.app"
).replace(/\/+$/, "");
const watchlistId = process.argv[2];

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function json(path: string, init: RequestInit = {}) {
  const response = await fetch(`${baseUrl}${path}`, init);
  const body = await response.json().catch(() => ({}));
  return { response, body };
}

async function main() {
  assert(
    /^wtl_[0-9a-f]{20}$/.test(watchlistId ?? ""),
    "Pass the production smoke watchlist ID as the first argument.",
  );
  const config = tryGetServerSupabaseConfig();
  assert(config, "Production server Supabase configuration is required.");
  const cronSecret = process.env.CRON_SECRET;
  assert(cronSecret, "CRON_SECRET is required for the scheduler smoke.");
  const server = createClient(config.url, config.key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const watchlist = await server
    .from("trust_watchlists")
    .select("id,public_id")
    .eq("public_id", watchlistId)
    .single();
  assert(
    !watchlist.error && watchlist.data,
    `Production watchlist lookup failed: ${watchlist.error?.message}`,
  );

  const before = await json(`/api/monitoring/public/${watchlistId}`);
  const previousSnapshot = (
    before.body.history as Array<{ snapshotId?: string }> | undefined
  )?.[0]?.snapshotId;
  assert(previousSnapshot, "The scheduler smoke requires an existing baseline snapshot.");

  try {
    const due = await server
      .from("trust_watchlists")
      .update({
        cadence: "daily",
        status: "active",
        next_recheck_at: "2000-01-01T00:00:00.000Z",
      })
      .eq("id", watchlist.data.id);
    assert(!due.error, `Unable to mark the smoke watchlist due: ${due.error?.message}`);

    const cron = await json("/api/internal/monitoring/recheck", {
      headers: { Authorization: `Bearer ${cronSecret}` },
    });
    assert(
      cron.response.status === 202 &&
        cron.body.launched === true &&
        cron.body.watchlistId === watchlistId &&
        typeof cron.body.jobId === "string",
      `Production scheduler did not launch the expected watchlist (HTTP ${cron.response.status}).`,
    );
    const jobId = cron.body.jobId as string;
    console.log(`[p30-scheduler-smoke] Job=${jobId}`);

    let history:
      | {
          currentDelta?: { previousSnapshotId?: string | null };
          history?: Array<{
            snapshotId?: string;
            jobId?: string;
            reportHash?: string;
            verificationStatus?: string;
            proofTransactionHash?: string | null;
          }>;
        }
      | undefined;
    for (let attempt = 0; attempt < 100; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 5_000));
      const result = await json(`/api/monitoring/public/${watchlistId}`);
      assert(
        result.response.ok,
        `Public trust history failed with HTTP ${result.response.status}.`,
      );
      history = result.body;
      if (
        history.history?.[0]?.jobId === jobId &&
        history.history[0].verificationStatus === "verified" &&
        history.history[0].proofTransactionHash
      ) {
        break;
      }
    }
    const snapshot = history?.history?.[0];
    assert(snapshot?.jobId === jobId, "Scheduled snapshot was not persisted.");
    assert(
      history?.currentDelta?.previousSnapshotId === previousSnapshot,
      "Scheduled delta is not linked to the previous immutable snapshot.",
    );
    assert(
      snapshot.verificationStatus === "verified" &&
        /^0x[0-9a-f]{64}$/i.test(snapshot.proofTransactionHash ?? ""),
      "Scheduled snapshot did not receive an Arc proof.",
    );
    console.log(
      `[p30-scheduler-smoke] Snapshot=${snapshot.snapshotId} ArcProof=${snapshot.proofTransactionHash}`,
    );
    console.log("[p30-scheduler-smoke] PASSED");
  } finally {
    const reset = await server
      .from("trust_watchlists")
      .update({
        cadence: "manual",
        next_recheck_at: null,
      })
      .eq("id", watchlist.data.id);
    assert(
      !reset.error,
      `Unable to reset the smoke watchlist schedule: ${reset.error?.message}`,
    );
  }
}

main().catch((error) => {
  console.error(
    `[p30-scheduler-smoke] FAILED: ${
      error instanceof Error ? error.message : String(error)
    }`,
  );
  process.exitCode = 1;
});
