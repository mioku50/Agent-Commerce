import { NextResponse } from "next/server";
import { Project360InputError } from "./input.ts";
import { Project360Error } from "./service.ts";
import { ByoaError, safeByoaError } from "../byoa/service.ts";

export function project360ErrorResponse(error: unknown) {
  const service = error instanceof Project360Error;
  const input = error instanceof Project360InputError;
  const auth = error instanceof ByoaError;
  return NextResponse.json(
    {
      error: {
        code: service
          ? error.code
          : input
            ? error.code
            : auth
              ? error.reason
              : "internal_error",
        message: service
          ? error.message
          : input
            ? error.message
            : auth
              ? safeByoaError(error)
              : "Project 360 is temporarily unavailable.",
        retryable: service ? error.retryable : false,
      },
    },
    {
      status: service ? error.status : input ? error.status : auth ? error.status : 500,
      headers: { "Cache-Control": "no-store" },
    },
  );
}
