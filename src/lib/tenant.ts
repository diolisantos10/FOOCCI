/**
 * Tenant context helpers.
 *
 * The middleware injects `x-restaurant-id` and `x-user-id` headers
 * into every authenticated request. These helpers read those headers
 * so service calls never need to decode the JWT themselves.
 */

import { headers } from "next/headers";
import { NextRequest } from "next/server";

export const TENANT_HEADER = "x-restaurant-id";
export const USER_HEADER = "x-user-id";
export const ROLE_HEADER = "x-user-role";

/**
 * Read the tenant id injected by middleware.
 * Use inside Server Components and Route Handlers.
 */
export function getTenantId(): string {
  const headerList = headers();
  const restaurantId = headerList.get(TENANT_HEADER);

  if (!restaurantId) {
    throw new Error(
      "Missing tenant context. Ensure the request passed through auth middleware."
    );
  }

  return restaurantId;
}

/**
 * Read tenant data from a NextRequest (used inside middleware itself).
 */
export function getTenantIdFromRequest(req: NextRequest): string | null {
  return req.headers.get(TENANT_HEADER);
}

/**
 * Extract tenant context from request headers.
 * Returns null if headers are missing (unauthenticated route).
 */
export function getTenantContext(req: NextRequest): {
  restaurantId: string;
  userId: string;
  role: string;
} | null {
  const restaurantId = req.headers.get(TENANT_HEADER);
  const userId = req.headers.get(USER_HEADER);
  const role = req.headers.get(ROLE_HEADER);

  if (!restaurantId || !userId || !role) return null;

  return { restaurantId, userId, role };
}

/**
 * Assert that the user belongs to the target restaurant.
 * Throws if the restaurantId in the request doesn't match.
 */
export function assertTenant(
  req: NextRequest,
  targetRestaurantId: string
): void {
  const ctx = getTenantContext(req);
  if (!ctx || ctx.restaurantId !== targetRestaurantId) {
    throw new Error("Tenant mismatch – access denied");
  }
}
