/**
 * GET  /api/internal/image-recovery  — scan for products with missing imageUrl that can be restored
 * POST /api/internal/image-recovery  — execute recovery (restore originalUrl → MenuItem.imageUrl)
 *
 * Auth: tenant JWT (OWNER/MANAGER) or admin secret.
 *
 * Recovery strategy: find all MenuItem records for the restaurant where imageUrl IS NULL
 * and a MenuItemImageEnhancement record exists with a non-null originalUrl.
 * Restores MenuItem.imageUrl = MenuItemImageEnhancement.originalUrl.
 */

import { NextRequest } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { checkAdminRequest } from "@/lib/admin-auth";
import { ok, badRequest, unauthorized, serverError } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";

async function findRecoverable(restaurantId: string) {
  // Find enhancement records where originalUrl is set but the linked product imageUrl is null.
  // Uses a two-step approach for Prisma type compatibility.
  const enhancements = await prisma.menuItemImageEnhancement.findMany({
    where: { restaurantId },
    include: { menuItem: { select: { id: true, name: true, imageUrl: true } } },
  });
  return enhancements.filter(
    (e) => e.originalUrl && e.originalUrl.trim() !== "" && e.menuItem.imageUrl === null
  );
}

// ─── GET — scan ────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const ctx     = getTenantContext(req);
  const isAdmin = checkAdminRequest(req);
  if (!ctx && !isAdmin) return unauthorized();

  const restaurantId = ctx?.restaurantId ?? req.nextUrl.searchParams.get("restaurantId");
  if (!restaurantId) return badRequest("restaurantId required");

  try {
    const recoverable = await findRecoverable(restaurantId);

    return ok({
      toRecover: recoverable.length,
      items: recoverable.map((r) => ({
        menuItemId:  r.menuItemId,
        name:        r.menuItem.name,
        originalUrl: r.originalUrl as string,
      })),
    });
  } catch (err) {
    console.error("[GET /api/internal/image-recovery]", err);
    return serverError();
  }
}

// ─── POST — execute recovery ───────────────────────────────────

export async function POST(req: NextRequest) {
  const ctx     = getTenantContext(req);
  const isAdmin = checkAdminRequest(req);
  if (!ctx && !isAdmin) return unauthorized();

  let body: { restaurantId?: string; dryRun?: boolean } = {};
  try { body = await req.json(); } catch { /* empty body is fine */ }

  const restaurantId = ctx?.restaurantId ?? body.restaurantId;
  if (!restaurantId) return badRequest("restaurantId required");
  const dryRun = body.dryRun ?? false;

  try {
    const recoverable = await findRecoverable(restaurantId);

    if (recoverable.length === 0) {
      return ok({ recovered: 0, skipped: 0, dryRun, items: [] });
    }

    const items = recoverable.map((r) => ({
      menuItemId:  r.menuItemId,
      name:        r.menuItem.name,
      originalUrl: r.originalUrl as string,
    }));

    if (dryRun) {
      return ok({ recovered: 0, skipped: items.length, dryRun: true, items });
    }

    // Restore in a single transaction
    await prisma.$transaction(
      items.map((item) =>
        prisma.menuItem.update({
          where: { id: item.menuItemId },
          data:  { imageUrl: item.originalUrl },
        })
      )
    );

    console.info(`[image-recovery] Restored ${items.length} product images for restaurant ${restaurantId}`);

    return ok({ recovered: items.length, skipped: 0, dryRun: false, items });
  } catch (err) {
    console.error("[POST /api/internal/image-recovery]", err);
    return serverError();
  }
}
