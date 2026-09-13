export const ERROR_CODES = [
  "AUTH_REQUIRED",
  "FORBIDDEN",
  "RESOURCE_NOT_FOUND",
  "VALIDATION_ERROR",
  "RATE_LIMITED",
  "AI_UNAVAILABLE",
  "AI_OUTPUT_INVALID",
  "VECTOR_SEARCH_FAILED",
  "INTEGRATION_ERROR",
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export type ApiResponse<T> =
  | { success: true; data: T; error: null }
  | { success: false; data: null; error: { code: ErrorCode; message: string } };

export class AppError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export function ok<T>(data: T): ApiResponse<T> {
  return { success: true, data, error: null };
}

export function fail(code: ErrorCode, message: string): ApiResponse<never> {
  return { success: false, data: null, error: { code, message } };
}

const FALLBACK_MESSAGE = "An unexpected error occurred.";

// Only AppError messages are surfaced to clients; anything else could leak
// connection strings or query fragments from a driver-level exception.
export function toApiResponse(error: unknown): ApiResponse<never> {
  if (error instanceof AppError) {
    return fail(error.code, error.message);
  }
  console.error("[ERROR] Unhandled:", error);
  return fail("INTEGRATION_ERROR", FALLBACK_MESSAGE);
}
