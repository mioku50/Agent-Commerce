/**
 * Copyright 2026 Circle Internet Group, Inc. All rights reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

export function sanitizePublicReportText(value: string): string {
  if (!value) return "";
  return value
    .replace(/\bPhase\s+\d+(?:\.\d+)?\b[:\s-]*/gi, "")
    .replace(/\bFreeModel\b/gi, "AI provider")
    .replace(/\bproject-owned (?:hosted )?payer\b/gi, "payment wallet")
    .replace(/\bdownstream x402\b/gi, "verified data services")
    .replace(/\bdeterministic aggregation\b/gi, "structured analysis")
    .replace(/\s+/g, " ")
    .trim();
}
