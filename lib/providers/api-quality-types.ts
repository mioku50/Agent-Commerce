/**
 * Copyright 2026 Circle Internet Group, Inc.  All rights reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

export type HttpStatusClass =
  | "2xx"
  | "4xx"
  | "5xx"
  | "timeout"
  | "network_error";

export type ErrorCategory =
  | "none"
  | "timeout"
  | "network"
  | "invalid_response"
  | "payment_failed"
  | "settlement_failed"
  | "execution_failed"
  | "verification_failed";

export type ObservationSource =
  | "real_paid_execution"
  | "scheduled_probe"
  | "historical_execution";

export type ConfidenceLevel = "high" | "medium" | "low";

export type QualityStatus =
  | "Excellent"
  | "Reliable"
  | "Mixed signals"
  | "High attention"
  | "Insufficient data";

export interface ApiQualityObservation {
  observationId: string;
  serviceId: string;
  sellerPublicId?: string | null;
  startedAt: string;
  completedAt: string;
  quotedPriceUsdc: number;
  paidAmountUsdc: number;
  latencyMs: number;
  httpStatusClass: HttpStatusClass;
  endpointReached: boolean;
  responseSchemaValid: boolean;
  responseWithinSizeLimit: boolean;
  paymentRequired: boolean;
  paymentAuthorized: boolean;
  paymentSettled: boolean;
  executionCompleted: boolean;
  arcProofVerified: boolean;
  errorCategory: ErrorCategory;
  source: ObservationSource;
  createdAt: string;
}

export type ApiQualityObservationRow = {
  observation_id: string;
  service_id: string;
  seller_public_id: string | null;
  started_at: string;
  completed_at: string;
  quoted_price_usdc: string | number;
  paid_amount_usdc: string | number;
  latency_ms: number;
  http_status_class: HttpStatusClass;
  endpoint_reached: boolean;
  response_schema_valid: boolean;
  response_within_size_limit: boolean;
  payment_required: boolean;
  payment_authorized: boolean;
  payment_settled: boolean;
  execution_completed: boolean;
  arc_proof_verified: boolean;
  error_category: ErrorCategory;
  source: ObservationSource;
  created_at: string;
};

export type ApiQualityObservationInput = Omit<
  ApiQualityObservation,
  "observationId" | "createdAt"
> & {
  observationId?: string;
  createdAt?: string;
};

export interface ApiQualityMetrics {
  totalObservations: number;
  uptimePercent: number;
  executionSuccessPercent: number;
  paymentSuccessPercent: number;
  settlementSuccessPercent: number;
  validResponsePercent: number;
  latencyP50Ms: number;
  latencyP95Ms: number;
  latencyMaxMs: number;
  quotedPriceMinUsdc: number;
  quotedPriceMedianUsdc: number;
  quotedPriceMaxUsdc: number;
  costPerSuccessfulResultUsdc: number;
  firstObservedAt: string | null;
  lastObservedAt: string | null;
}

export interface ApiQualityScore {
  overallScore: number;
  availabilityScore: number;
  executionReliabilityScore: number;
  responseValidityScore: number;
  paymentSuccessScore: number;
  settlementSuccessScore: number;
  latencyConsistencyScore: number;
  status: QualityStatus;
  confidenceLevel: ConfidenceLevel;
  hasSufficientData: boolean;
}

export interface ServiceQualityInput {
  serviceId: string;
  serviceName?: string;
  sellerPublicId?: string | null;
  observations: ApiQualityObservation[];
}

export interface ApiQualityComparisonItem {
  serviceId: string;
  serviceName?: string;
  sellerPublicId?: string | null;
  metrics: ApiQualityMetrics;
  score: ApiQualityScore;
  rank: number;
}

export interface ApiQualityComparisonCategoryHighlight {
  category: "uptime" | "latency" | "execution" | "cost" | "overall";
  title: string;
  winnerServiceId: string;
  winnerServiceName?: string;
  value: string;
  description: string;
}

export interface ApiQualityComparisonResult {
  services: ApiQualityComparisonItem[];
  highlights: ApiQualityComparisonCategoryHighlight[];
  overallWinnerServiceId: string | null;
  observationWindowDays?: number;
}

export type ProbeType = "availability" | "paid_execution";

export type ProbeRunStatus =
  | "success"
  | "degraded"
  | "failed"
  | "budget_exceeded"
  | "cooldown_skipped"
  | "inactive_skipped";

export type ApiQualityAlertType =
  | "quality_degradation"
  | "uptime_drop"
  | "latency_spike"
  | "score_drop"
  | "execution_failure_spike";

export type ApiQualityAlertSeverity = "critical" | "warning" | "info";

export interface ApiQualityProbeConfig {
  serviceId: string;
  probeType?: ProbeType;
  maxPriceUsdc?: number;
  cooldownSeconds?: number;
  maxDailyProbeBudgetUsdc?: number;
  timeoutMs?: number;
}

export interface ApiQualityDelta {
  serviceId: string;
  previousScore: number;
  newScore: number;
  scoreDelta: number;
  previousUptimePercent: number;
  newUptimePercent: number;
  uptimeDelta: number;
  previousLatencyP95Ms: number;
  newLatencyP95Ms: number;
  latencyDeltaMs: number;
}

export interface ApiQualityAlert {
  alertId: string;
  serviceId: string;
  alertType: ApiQualityAlertType;
  severity: ApiQualityAlertSeverity;
  message: string;
  details: {
    previousValue?: number;
    newValue?: number;
    delta?: number;
    threshold?: number;
    [key: string]: unknown;
  };
  createdAt: string;
}

export interface ApiQualityProbeResult {
  probeId: string;
  serviceId: string;
  probeType: ProbeType;
  status: ProbeRunStatus;
  observation?: ApiQualityObservation;
  skippedReason?: string;
  metricsDelta?: ApiQualityDelta;
  alertsTriggered: ApiQualityAlert[];
  executedAt: string;
}

export interface ProbeEngineOptions {
  serviceIds?: string[];
  probeType?: ProbeType | "auto";
  maxDailyProbeBudgetUsdc?: number;
  cooldownSeconds?: number;
  emitAlerts?: boolean;
}

export interface ProbeRunSummary {
  totalProbes: number;
  executed: number;
  skipped: number;
  totalCostUsdc: number;
  results: ApiQualityProbeResult[];
  alerts: ApiQualityAlert[];
  executedAt: string;
}


