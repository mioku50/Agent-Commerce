import { NextResponse } from "next/server";
import { AgentTrustInputError } from "../agent-trust/input.ts";
import { ByoaError, safeByoaError } from "../byoa/service.ts";
import { TrustMonitoringError } from "./service.ts";

export function trustMonitoringErrorResponse(error: unknown) {
  const known = error instanceof TrustMonitoringError;
  const auth = error instanceof ByoaError;
  const input = error instanceof AgentTrustInputError;
  return NextResponse.json(
    {
      error: {
        code: known
          ? error.code
          : auth
            ? error.reason
            : input
              ? error.code
              : "internal_error",
        message: known
          ? error.message
          : auth
            ? safeByoaError(error)
            : input
              ? error.message
              : "Continuous trust monitoring is temporarily unavailable.",
        retryable: known ? error.retryable : false,
      },
    },
    {
      status: known ? error.status : auth ? error.status : input ? 400 : 500,
      headers: { "Cache-Control": "no-store" },
    },
  );
}
