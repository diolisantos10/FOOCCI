/**
 * Shared application types.
 *
 * Keep this file focused on cross-cutting types.
 * Domain-specific types live next to their service files.
 */

import type { Role, Plan } from "@prisma/client";

// ─── Re-export Prisma enums for convenience ───────────────────
export type { Role, Plan };

// ─── Pagination ───────────────────────────────────────────────

export interface PaginationParams {
  page?: number;
  limit?: number;
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

// ─── Tenant context ───────────────────────────────────────────

export interface TenantContext {
  restaurantId: string;
  userId: string;
  role: Role;
}

// ─── Service result pattern ───────────────────────────────────

export type ServiceResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; status?: number };

export function serviceOk<T>(data: T): ServiceResult<T> {
  return { ok: true, data };
}

export function serviceFail(
  error: string,
  status = 400
): ServiceResult<never> {
  return { ok: false, error, status };
}
