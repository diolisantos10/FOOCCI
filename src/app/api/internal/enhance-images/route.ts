/**
 * POST /api/internal/enhance-images
 *   Start an enhancement batch job for a restaurant.
 *   Requires ADMIN_SECRET (x-admin-secret header or foocci-admin-token cookie).
 *
 * GET /api/internal/enhance-images?restaurantId=...
 *   List all enhancement jobs for a restaurant.
 *   Accepts either ADMIN_SECRET or tenant JWT (OWNER/MANAGER).
 *
 * Body (POST):
 *   restaurantId  string   required
 *   productIds?   string[] optional — omit to process all products
 *   dryRun?       boolean  default false
 *   processMode?  "enhance" | "upscale" | "enhance+upscale"  default "enhance+upscale"
 *
 * This is INTERNAL/ADMIN-ONLY. Not exposed to restaurant operators by default.
 */

import { NextRequest } from "next/server";
import { z } from "zod";
import { checkAdminRequest } from "@/lib/admin-auth";
import { getTenantContext } from "@/lib/tenant";
import { ok, badRequest, unauthorized, serverError } from "@/lib/api-response";
import { runEnhancementJob } from "@/services/imageEnhancement/ImageEnhancementService";
import { prisma } from "@/lib/prisma";

const startSchema = z.object({
  restaurantId: z.string().min(1),
  productIds:   z.array(z.string()).optional(),
  dryRun:       z.boolean().optional(),
  processMode:  z.enum(["enhance", "upscale", "enhance+upscale"]).optional(),
});

export async function POST(req: NextRequest) {
  const isAdmin = checkAdminRequest(req);
  const ctx     = getTenantContext(req);

  // Accept either admin secret OR tenant JWT (OWNER/MANAGER)
  if (!isAdmin && !ctx) return unauthorized();
  if (!isAdmin && ctx && !["OWNER", "MANAGER"].includes(ctx.role)) return unauthorized();

  let body: unknown;
  try { body = await req.json(); } catch { return badRequest("Invalid JSON body"); }

  const parsed = startSchema.safeParse(body);
  if (!parsed.success) return badRequest(parsed.error.issues.map((i) => i.message).join("; "));

  const { restaurantId, productIds, dryRun = false, processMode = "enhance+upscale" } = parsed.data;

  // Tenant users can only process their own restaurant
  if (ctx && !isAdmin && ctx.restaurantId !== restaurantId) return unauthorized();

  // Verify restaurant exists
  const restaurant = await prisma.restaurant.findUnique({
    where:  { id: restaurantId },
    select: { id: true, name: true },
  });
  if (!restaurant) return badRequest("Restaurant not found");

  try {
    const stats = await runEnhancementJob({ restaurantId, productIds, dryRun, processMode });
    return ok({ stats, restaurant: { id: restaurant.id, name: restaurant.name } });
  } catch (err) {
    console.error("[POST /api/internal/enhance-images]", err);
    return serverError();
  }
}

export async function GET(req: NextRequest) {
  // Accept both admin secret and tenant JWT
  const isAdmin = checkAdminRequest(req);
  const ctx     = getTenantContext(req);

  if (!isAdmin && !ctx) return unauthorized();

  const sp           = req.nextUrl.searchParams;
  const restaurantId = sp.get("restaurantId") ?? ctx?.restaurantId;

  if (!restaurantId) return badRequest("restaurantId is required");

  // Tenant users can only see their own restaurant
  if (ctx && !isAdmin && ctx.restaurantId !== restaurantId) return unauthorized();

  const page     = Math.max(1, parseInt(sp.get("page") ?? "1", 10));
  const pageSize = Math.min(100, Math.max(1, parseInt(sp.get("pageSize") ?? "50", 10)));
  const status   = sp.get("status") ?? undefined;

  try {
    const [jobs, total] = await Promise.all([
      prisma.menuItemImageEnhancement.findMany({
        where: {
          restaurantId,
          ...(status ? { status: status as never } : {}),
        },
        include: {
          menuItem: {
            select: {
              id:           true,
              name:         true,
              imageUrl:     true,
              category:     { select: { name: true } },
            },
          },
        },
        orderBy: { createdAt: "desc" },
        skip:    (page - 1) * pageSize,
        take:    pageSize,
      }),
      prisma.menuItemImageEnhancement.count({
        where: { restaurantId, ...(status ? { status: status as never } : {}) },
      }),
    ]);

    return ok({ jobs, total, page, pageSize });
  } catch (err) {
    console.error("[GET /api/internal/enhance-images]", err);
    return serverError();
  }
}
