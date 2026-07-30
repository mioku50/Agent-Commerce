import {
  createMachineErrorResponse,
  handleMachineInternalError,
} from "../api/machine-errors.ts";
import { TrustMonitoringError } from "./service.ts";

export function monitoringMachineError(error: unknown, route: string) {
  if (error instanceof TrustMonitoringError) {
    return createMachineErrorResponse(
      error.code as Parameters<typeof createMachineErrorResponse>[0],
      error.message,
      error.status,
      error.retryable,
    );
  }
  return handleMachineInternalError(error, route);
}
