/**
 * Copyright 2026 Circle Internet Group, Inc.  All rights reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from "node:assert/strict";
import {
  calculateQualityScore,
  checkProbeSafetyAndBudget,
  clearInMemoryApiQualityAlerts,
  clearInMemoryApiQualityObservations,
  compareApiQuality,
  computeApiQualityMetrics,
  detectQualityDegradationAlerts,
  executeScheduledProbe,
  getInMemoryApiQualityAlerts,
  getInMemoryApiQualityObservations,
  recordApiQualityObservation,
  runScheduledApiQualityProbes,
} from "../lib/providers/api-quality.ts";

async function runTests() {
  console.log("Starting API Quality Provider & Monitoring Probes Unit Tests...");

  // Setup: clear in-memory stores
  clearInMemoryApiQualityObservations();
  clearInMemoryApiQualityAlerts();

  // Test 1: Record observations and compute metrics
  console.log("Test 1: Recording observations and computing metrics");
  const now = new Date();
  for (let i = 0; i < 15; i++) {
    await recordApiQualityObservation({
      serviceId: "srv_test_weather",
      sellerPublicId: "sel_test_seller_1",
      startedAt: new Date(now.getTime() - (15 - i) * 3600000).toISOString(),
      completedAt: new Date(now.getTime() - (15 - i) * 3600000 + 150).toISOString(),
      quotedPriceUsdc: 0.05,
      paidAmountUsdc: 0.05,
      latencyMs: 120 + (i % 3) * 10,
      httpStatusClass: "2xx",
      endpointReached: true,
      responseSchemaValid: true,
      responseWithinSizeLimit: true,
      paymentRequired: true,
      paymentAuthorized: true,
      paymentSettled: true,
      executionCompleted: true,
      arcProofVerified: true,
      errorCategory: "none",
      source: "real_paid_execution",
    });
  }

  const obs = getInMemoryApiQualityObservations();
  assert.equal(obs.length, 15, "Should have 15 recorded observations");

  const metrics = computeApiQualityMetrics(obs);
  assert.equal(metrics.totalObservations, 15, "Total observations should be 15");
  assert.equal(metrics.uptimePercent, 100, "Uptime should be 100%");
  assert.equal(metrics.executionSuccessPercent, 100, "Execution success should be 100%");
  assert.equal(metrics.paymentSuccessPercent, 100, "Payment success should be 100%");
  assert.equal(metrics.settlementSuccessPercent, 100, "Settlement success should be 100%");

  // Test 2: Calculate quality score
  console.log("Test 2: Calculating Quality Score");
  const score = calculateQualityScore(metrics, obs);
  assert.equal(score.hasSufficientData, true, "Should have sufficient data");
  assert.equal(score.status, "Excellent", "Status should be Excellent");
  assert.ok(score.overallScore >= 90, "Overall score should be >= 90");

  // Test 3: Side-by-side comparison
  console.log("Test 3: Comparing services");
  for (let i = 0; i < 10; i++) {
    await recordApiQualityObservation({
      serviceId: "srv_test_crypto",
      sellerPublicId: "sel_test_seller_2",
      startedAt: new Date(now.getTime() - (10 - i) * 3600000).toISOString(),
      completedAt: new Date(now.getTime() - (10 - i) * 3600000 + 450).toISOString(),
      quotedPriceUsdc: 0.10,
      paidAmountUsdc: 0.10,
      latencyMs: 400 + i * 50,
      httpStatusClass: i === 5 ? "5xx" : "2xx",
      endpointReached: true,
      responseSchemaValid: i !== 5,
      responseWithinSizeLimit: true,
      paymentRequired: true,
      paymentAuthorized: true,
      paymentSettled: true,
      executionCompleted: i !== 5,
      arcProofVerified: i !== 5,
      errorCategory: i === 5 ? "execution_failed" : "none",
      source: "real_paid_execution",
    });
  }

  const comparison = compareApiQuality(
    [
      { serviceId: "srv_test_weather", observations: obs.filter((o) => o.serviceId === "srv_test_weather") },
      { serviceId: "srv_test_crypto", observations: obs.filter((o) => o.serviceId === "srv_test_crypto") },
    ],
    30,
  );

  assert.equal(comparison.services.length, 2, "Should compare 2 services");
  assert.equal(comparison.overallWinnerServiceId, "srv_test_weather", "srv_test_weather should win");

  // Test 4: Cooldown & Budget guards
  console.log("Test 4: Testing Probe Safety & Budget Guards");
  // Cooldown check
  const safety1 = await checkProbeSafetyAndBudget("srv_probe_test", "availability", { cooldownSeconds: 300 });
  assert.equal(safety1.allowed, true, "Initial probe should be allowed");

  // Execute a probe
  const probeRes1 = await executeScheduledProbe({ serviceId: "srv_probe_test", probeType: "availability" });
  assert.equal(probeRes1.status, "success", "Probe execution should succeed");

  // Immediate second probe should trigger cooldown
  const safety2 = await checkProbeSafetyAndBudget("srv_probe_test", "availability", { cooldownSeconds: 300 });
  assert.equal(safety2.allowed, false, "Second probe within 300s should be blocked by cooldown");
  assert.equal(safety2.status, "cooldown_skipped", "Status should be cooldown_skipped");

  // Test budget guard for paid execution probe
  const safety3 = await checkProbeSafetyAndBudget("srv_budget_test", "paid_execution", {
    maxDailyProbeBudgetUsdc: 0.01,
    maxPriceUsdc: 0.005,
  });
  assert.equal(safety3.allowed, false, "Paid probe exceeding max price limit should be blocked");
  assert.equal(safety3.status, "budget_exceeded", "Status should be budget_exceeded");

  // Test 5: Delta Degradation Alert Detection
  console.log("Test 5: Delta Alert Detection");
  clearInMemoryApiQualityAlerts();

  const prevScore = { overallScore: 95, availabilityScore: 25, executionReliabilityScore: 20, responseValidityScore: 15, paymentSuccessScore: 15, settlementSuccessScore: 15, latencyConsistencyScore: 10, status: "Excellent" as const, confidenceLevel: "high" as const, hasSufficientData: true };
  const newScore = { overallScore: 70, availabilityScore: 15, executionReliabilityScore: 15, responseValidityScore: 15, paymentSuccessScore: 15, settlementSuccessScore: 10, latencyConsistencyScore: 0, status: "Mixed signals" as const, confidenceLevel: "high" as const, hasSufficientData: true };

  const prevMetrics = { totalObservations: 20, uptimePercent: 100, executionSuccessPercent: 100, paymentSuccessPercent: 100, settlementSuccessPercent: 100, validResponsePercent: 100, latencyP50Ms: 100, latencyP95Ms: 150, latencyMaxMs: 200, quotedPriceMinUsdc: 0.05, quotedPriceMedianUsdc: 0.05, quotedPriceMaxUsdc: 0.05, costPerSuccessfulResultUsdc: 0.05, firstObservedAt: now.toISOString(), lastObservedAt: now.toISOString() };
  const newMetrics = { totalObservations: 21, uptimePercent: 85, executionSuccessPercent: 75, paymentSuccessPercent: 100, settlementSuccessPercent: 100, validResponsePercent: 100, latencyP50Ms: 200, latencyP95Ms: 6000, latencyMaxMs: 8000, quotedPriceMinUsdc: 0.05, quotedPriceMedianUsdc: 0.05, quotedPriceMaxUsdc: 0.05, costPerSuccessfulResultUsdc: 0.05, firstObservedAt: now.toISOString(), lastObservedAt: now.toISOString() };

  const alerts = detectQualityDegradationAlerts("srv_degraded", prevScore, newScore, prevMetrics, newMetrics);
  assert.ok(alerts.length >= 3, "Should trigger multiple degradation alerts");
  const alertTypes = alerts.map((a) => a.alertType);
  assert.ok(alertTypes.includes("score_drop"), "Should trigger score_drop alert");
  assert.ok(alertTypes.includes("uptime_drop"), "Should trigger uptime_drop alert");
  assert.ok(alertTypes.includes("latency_spike"), "Should trigger latency_spike alert");
  assert.ok(alertTypes.includes("execution_failure_spike"), "Should trigger execution_failure_spike alert");

  // Test 6: Batch Probe Runner
  console.log("Test 6: Batch Probe Runner");
  const batchSummary = await runScheduledApiQualityProbes({
    serviceIds: ["srv_batch_1", "srv_batch_2"],
    probeType: "availability",
    cooldownSeconds: 0, // Disable cooldown for batch test
  });

  assert.equal(batchSummary.totalProbes, 2, "Batch totalProbes should be 2");
  assert.equal(batchSummary.executed, 2, "Batch executed probes should be 2");
  assert.equal(batchSummary.results.length, 2, "Should return 2 probe results");

  console.log("All API Quality Provider & Monitoring Probes Tests Passed!");
}

runTests().catch((err) => {
  console.error("Test failure:", err);
  process.exit(1);
});
