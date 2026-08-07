/**
 * Copyright 2026 Circle Internet Group, Inc. All rights reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

export type CanonicalAgentIdentity = {
  agentId: string;
  chainId: 5042002;
  identityRegistry: string;
  owner: string;
  metadataUri?: string;
  veyraPublicId?: string;
  verifiedOnchain: boolean;
};

export type ReputationEvidenceType =
  | "erc8004_feedback"
  | "erc8004_validation"
  | "erc8183_job_completed"
  | "erc8183_job_rejected"
  | "erc8183_evaluation"
  | "x402_payment_success"
  | "x402_payment_failure"
  | "veyra_agent_trust"
  | "api_quality"
  | "treasury_health"
  | "project_360"
  | "arc_proof";

export type ReputationEvidenceTier = 0 | 1 | 2 | 3 | 4;

export type SybilRiskLevel = "none" | "low" | "medium" | "high";

export type ReputationEvidence = {
  evidenceId: string;
  agentId: string;
  type: ReputationEvidenceType;
  tier: ReputationEvidenceTier;
  sourceId: string;
  sourceHash?: string;
  score?: number; // 0..100
  positive: boolean;
  confidence: number; // 0..1
  economicValueUsdc?: number;
  counterpartyAddress?: string;
  verifiedOnchain: boolean;
  arcProofVerified: boolean;
  sybilRisk: SybilRiskLevel;
  reason?: string;
  observedAt: string;
  canonicalHash: string;
};

export type AgentReputationDimensions = {
  identity: number;
  execution: number;
  validation: number;
  economicReliability: number;
  serviceQuality: number;
  reputation: number;
};

export type ReputationConfidenceLevel = "Low" | "Medium" | "High" | "Very High";

export type ReputationStatusLabel =
  | "Highly Trusted"
  | "Strong"
  | "Mixed Signals"
  | "High Attention"
  | "Elevated Risk"
  | "Limited Evidence";

export type ReputationExplanation = {
  trustScore: number;
  confidence: ReputationConfidenceLevel;
  coverage: number;
  statusLabel: ReputationStatusLabel;
  dimensions: AgentReputationDimensions;
  topPositiveEvidence: string[];
  riskSignals: string[];
};

export type ReputationSnapshot = {
  snapshotId: string;
  agentId: string;
  trustScore: number;
  confidence: ReputationConfidenceLevel;
  coverage: number;
  statusLabel: ReputationStatusLabel;
  dimensions: AgentReputationDimensions;
  evidenceCount: number;
  economicEvidenceCount: number;
  canonicalHash: string;
  arcProofTx?: string;
  topPositiveEvidence: string[];
  riskSignals: string[];
  createdAt: string;
};

export type SanitizedEvidenceItem = {
  evidenceId: string;
  type: ReputationEvidenceType;
  tier: ReputationEvidenceTier;
  positive: boolean;
  score?: number;
  economicValueUsdc?: number;
  verifiedOnchain: boolean;
  arcProofVerified: boolean;
  observedAt: string;
  canonicalHash: string;
  arcscanTxUrl?: string;
};

export const AGENT_REPUTATION_WEIGHTS = {
  identity: 0.15,
  execution: 0.25,
  validation: 0.20,
  economicReliability: 0.20,
  serviceQuality: 0.10,
  reputation: 0.10,
} as const;
