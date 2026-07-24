/**
 * Copyright 2026 Circle Internet Group, Inc. All rights reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { NextResponse } from "next/server.js";
import { randomUUID } from "node:crypto";

export type MachineErrorCode =
  | "invalid_repository"
  | "repository_not_found"
  | "repository_inaccessible"
  | "credential_missing"
  | "credential_revoked"
  | "scope_denied"
  | "workflow_disabled"
  | "quote_expired"
  | "quote_already_used"
  | "idempotency_conflict"
  | "payment_required"
  | "payment_invalid"
  | "spending_limit_exceeded"
  | "run_not_found"
  | "report_not_found"
  | "report_not_ready"
  | "provider_unavailable"
  | "rate_limited"
  | "internal_error";

export interface MachineErrorResponseBody {
  error: {
    code: MachineErrorCode;
    message: string;
    retryable: boolean;
    requestId: string;
  };
}

export function generateRequestId(): string {
  return `req_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
}

export function sanitizeErrorMessage(message: string): string {
  // Ensure stack traces or internal SQL errors are not leaked
  if (
    /postgres|supabase|pg_|\bSQL\b|column\s+.*does not exist|violates\s+foreign\s+key|relation\s+.*does not exist|syntax error at or near/i.test(
      message,
    ) ||
    message.includes("Error:") && message.includes("\n    at ")
  ) {
    return "An internal system error occurred. Please try again later.";
  }
  return message;
}

export function createMachineErrorResponse(
  code: MachineErrorCode,
  message: string,
  status = 400,
  retryable = false,
  requestId?: string,
): NextResponse<MachineErrorResponseBody> {
  const reqId = requestId || generateRequestId();
  const safeMessage = sanitizeErrorMessage(message);

  return NextResponse.json(
    {
      error: {
        code,
        message: safeMessage,
        retryable,
        requestId: reqId,
      },
    },
    {
      status,
      headers: {
        "Content-Type": "application/json",
        "X-Request-Id": reqId,
      },
    },
  );
}
