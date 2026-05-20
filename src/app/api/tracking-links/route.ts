/**
 * GET  /api/tracking-links — list all tracking links for restaurant
 * POST /api/tracking-links — create a new tracking link
 */

import { NextRequest } from "next/server";
import { z } from "zod";
import { getTenantContext } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";
import { ok, created, badRequest, unauthorized, serverError } from "@/lib/api-response";
import { generateUniqueShortCode } from "@/lib/shortCode";

const createSchema = z.object({
  name:            z.string().min(1).max(100),
  slug:            z.string().min(1).max(80).regex(/^[a-z0-9-]+$/, "slug must be lowercase letters, numbers and hyphens"),
  destinationType: z.enum(["PEDIDO", "QR"]).default("PEDIDO"),
  source:          z.string().min(1).max(50),
  medium:          z.string().min(1).max(50),
  campaign:        z.string().max(100).optional(),
  content:         z.string().max(100).optional(),
  term:            z.string().max(100).optional(),
  isActive:        z.boolean().default(true),
});

export async function GET(req: NextRequest) {
  try {
    const ctx = getTenantContext(req);
    if (!ctx) return unauthorized();

    const links = await prisma.trackingLink.findMany({
      where:   { restaurantId: ctx.restaurantId },
      orderBy: { createdAt: "desc" },
    });

    // Lazy-generate shortCodes for any links that don't have one yet.
    // Runs once per link after deployment; no-op once all links have codes.
    const linksWithoutCode = links.filter((l) => !l.shortCode);
    if (linksWithoutCode.length > 0) {
      await Promise.all(
        linksWithoutCode.map(async (link) => {
          const code = await generateUniqueShortCode();
          await prisma.trackingLink.update({
            where: { id: link.id },
            data:  { shortCode: code },
          });
          link.shortCode = code;
        })
      );
    }

    return ok(links);
  } catch (err) {
    console.error("[GET /api/tracking-links]", err);
    return serverError();
  }
}

export async function POST(req: NextRequest) {
  try {
    const ctx = getTenantContext(req);
    if (!ctx) return unauthorized();

    const raw    = await req.json().catch(() => null);
    const parsed = createSchema.safeParse(raw);
    if (!parsed.success) return badRequest("Validation failed", parsed.error.flatten());

    const shortCode = await generateUniqueShortCode();

    const link = await prisma.trackingLink.create({
      data: { restaurantId: ctx.restaurantId, shortCode, ...parsed.data },
    });

    return created(link);
  } catch (err: unknown) {
    if ((err as { code?: string }).code === "P2002") {
      return badRequest("Já existe um link com esse slug para este restaurante.");
    }
    console.error("[POST /api/tracking-links]", err);
    return serverError();
  }
}
