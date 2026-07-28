import assert from "node:assert/strict";
import { buildOperationsSnapshot } from "../lib/operations/health.ts";

const now = "2026-07-28T12:00:00.000Z";
const healthy = buildOperationsSnapshot({
  now,
  windowMinutes: 60,
  hostedJobs: [
    { status: "completed", created_at: "2026-07-28T11:40:00.000Z", updated_at: "2026-07-28T11:42:00.000Z" },
  ],
  providerSteps: [
    {
      service_slug: "github-repository-intelligence",
      status: "paid",
      created_at: "2026-07-28T11:40:00.000Z",
      raw: { providerLatencyMs: 850 },
    },
  ],
  workflowPayments: [
    {
      payment_mode: "paid",
      status: "settled",
      created_at: "2026-07-28T11:39:00.000Z",
      updated_at: "2026-07-28T11:42:00.000Z",
    },
  ],
  proofEvents: [
    {
      onchain_status: "verified",
      created_at: "2026-07-28T11:41:00.000Z",
      onchain_verified_at: "2026-07-28T11:41:02.000Z",
      onchain_attempt_count: 1,
    },
  ],
});

assert.equal(healthy.status, "healthy");
assert.equal(healthy.providers.p95LatencyMs, 850);
assert.equal(healthy.arcProofs.p95VerificationDelayMs, 2_000);
assert.equal(healthy.alerts.length, 0);

const failing = buildOperationsSnapshot({
  now,
  windowMinutes: 60,
  hostedJobs: [
    ...Array.from({ length: 4 }, (_, index) => ({
      status: "failed",
      created_at: `2026-07-28T11:${40 + index}:00.000Z`,
      updated_at: `2026-07-28T11:${41 + index}:00.000Z`,
    })),
    { status: "completed", created_at: "2026-07-28T11:45:00.000Z", updated_at: "2026-07-28T11:46:00.000Z" },
    { status: "running", created_at: "2026-07-28T11:20:00.000Z", updated_at: "2026-07-28T11:30:00.000Z" },
  ],
  providerSteps: Array.from({ length: 5 }, (_, index) => ({
    service_slug: "github-repository-intelligence",
    status: index < 3 ? "failed" : "paid",
    created_at: "2026-07-28T11:40:00.000Z",
    raw: { providerLatencyMs: 25_000 + index * 2_000 },
  })),
  workflowPayments: [
    {
      payment_mode: "paid",
      status: "credit_issued",
      created_at: "2026-07-28T11:39:00.000Z",
      updated_at: "2026-07-28T11:42:00.000Z",
    },
  ],
  proofEvents: [
    {
      onchain_status: "failed",
      created_at: "2026-07-28T11:40:00.000Z",
      onchain_verified_at: null,
      onchain_attempt_count: 3,
    },
    {
      onchain_status: "pending",
      created_at: "2026-07-28T11:50:00.000Z",
      onchain_verified_at: null,
      onchain_attempt_count: 1,
    },
  ],
});

assert.equal(failing.status, "critical");
assert(failing.alerts.some((alert) => alert.code === "execution_failures"));
assert(failing.alerts.some((alert) => alert.code === "stale_execution"));
assert(failing.alerts.some((alert) => alert.code === "provider_latency"));
assert(failing.alerts.some((alert) => alert.code === "payment_failures"));
assert(failing.alerts.some((alert) => alert.code === "arc_proof_failed"));
assert(failing.alerts.some((alert) => alert.code === "arc_proof_delayed"));
assert.match(failing.retryPolicy.paidProviderCalls, /Single attempt/);

console.log("[operations-test] passed: healthy metrics, threshold alerts, Arc delay tracking, safe retry policy");
