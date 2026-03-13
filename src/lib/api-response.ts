/**
 * Standardized API response helpers.
 *
 * All route handlers use these to ensure consistent envelope shape:
 *   { success: true,  data: T }
 *   { success: false, error: string, details?: unknown }
 */

import { NextResponse } from "next/server";

export type ApiSuccess<T> = {
  success: true;
  data: T;
};

export type ApiError = {
  success: false;
  error: string;
  details?: unknown;
};

export type ApiResponse<T> = ApiSuccess<T> | ApiError;

export function ok<T>(data: T, status = 200): NextResponse<ApiSuccess<T>> {
  return NextResponse.json({ success: true, data }, { status });
}

export function created<T>(data: T): NextResponse<ApiSuccess<T>> {
  return ok(data, 201);
}

export function noContent(): NextResponse {
  return new NextResponse(null, { status: 204 });
}

export function badRequest(
  error: string,
  details?: unknown
): NextResponse<ApiError> {
  return NextResponse.json({ success: false, error, details }, { status: 400 });
}

export function unauthorized(error = "Unauthorized"): NextResponse<ApiError> {
  return NextResponse.json({ success: false, error }, { status: 401 });
}

export function forbidden(error = "Forbidden"): NextResponse<ApiError> {
  return NextResponse.json({ success: false, error }, { status: 403 });
}

export function notFound(error = "Not found"): NextResponse<ApiError> {
  return NextResponse.json({ success: false, error }, { status: 404 });
}

export function conflict(error: string): NextResponse<ApiError> {
  return NextResponse.json({ success: false, error }, { status: 409 });
}

export function serverError(
  error = "Internal server error",
  details?: unknown
): NextResponse<ApiError> {
  return NextResponse.json({ success: false, error, details }, { status: 500 });
}

/**
 * Wraps a route handler to catch unhandled errors and return 500.
 */
export function withErrorHandler<T>(
  handler: () => Promise<NextResponse<T>>
): Promise<NextResponse<T | ApiError>> {
  return handler().catch((err: unknown) => {
    console.error("[API Error]", err);
    const message =
      err instanceof Error ? err.message : "Internal server error";
    return serverError(message);
  });
}
