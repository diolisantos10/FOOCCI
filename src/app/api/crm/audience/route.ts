import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getTenantContext } from "@/lib/tenant";
import { ok, badRequest, unauthorized, serverError } from "@/lib/api-response";

export type CustomerPreview = {
  id: string;
  name: string;
  phone: string;
  tier: string;
  segment: string;
  totalOrders: number;
  totalSpend: number;
  lastOrderAt: string | null;
};

export type AudienceResponse = {
  count: number;
  customers: CustomerPreview[];
  computed: boolean;
};

const PREVIEW_LIMIT = 20;

const baseSelect = {
  id: true, name: true, phone: true,
  tier: true, segment: true,
  totalOrders: true, totalSpend: true, lastOrderAt: true,
} as const;

type Row = {
  id: string; name: string; phone: string;
  tier: string; segment: string;
  totalOrders: number; totalSpend: { toNumber(): number };
  lastOrderAt: Date | null;
};

function serialize(rows: Row[]): CustomerPreview[] {
  return rows.map((r) => ({
    id:          r.id,
    name:        r.name,
    phone:       r.phone,
    tier:        r.tier,
    segment:     r.segment,
    totalOrders: r.totalOrders,
    totalSpend:  r.totalSpend.toNumber(),
    lastOrderAt: r.lastOrderAt?.toISOString() ?? null,
  }));
}

export async function GET(req: NextRequest) {
  try {
    const ctx = getTenantContext(req);
    if (!ctx) return unauthorized();

    const template = req.nextUrl.searchParams.get("template");
    if (!template) return badRequest("Parâmetro 'template' é obrigatório");

    const rid = ctx.restaurantId;
    const now = new Date();

    switch (template) {

      case "recuperar-frios": {
        const where = { restaurantId: rid, isGuest: false, isActive: true, segment: "FRIO" };
        const [rows, count] = await Promise.all([
          prisma.customer.findMany({ where, orderBy: { lastOrderAt: "asc" }, take: PREVIEW_LIMIT, select: baseSelect }),
          prisma.customer.count({ where }),
        ]);
        return ok<AudienceResponse>({ count, customers: serialize(rows as Row[]), computed: true });
      }

      case "reativar-mornos": {
        const where = { restaurantId: rid, isGuest: false, isActive: true, segment: "MORNO" };
        const [rows, count] = await Promise.all([
          prisma.customer.findMany({ where, orderBy: { lastOrderAt: "asc" }, take: PREVIEW_LIMIT, select: baseSelect }),
          prisma.customer.count({ where }),
        ]);
        return ok<AudienceResponse>({ count, customers: serialize(rows as Row[]), computed: true });
      }

      case "segunda-compra": {
        const where = { restaurantId: rid, isGuest: false, totalOrders: 1 };
        const [rows, count] = await Promise.all([
          prisma.customer.findMany({ where, orderBy: { lastOrderAt: "desc" }, take: PREVIEW_LIMIT, select: baseSelect }),
          prisma.customer.count({ where }),
        ]);
        return ok<AudienceResponse>({ count, customers: serialize(rows as Row[]), computed: true });
      }

      case "clientes-vip": {
        const where = { restaurantId: rid, isGuest: false, tier: { in: ["OURO", "DIAMANTE"] } };
        const [rows, count] = await Promise.all([
          prisma.customer.findMany({ where, orderBy: [{ tier: "asc" }, { totalSpend: "desc" }], take: PREVIEW_LIMIT, select: baseSelect }),
          prisma.customer.count({ where }),
        ]);
        return ok<AudienceResponse>({ count, customers: serialize(rows as Row[]), computed: true });
      }

      case "pedido-avaliacao": {
        const sevenDaysAgo = new Date(now.getTime() - 7 * 86_400_000);
        const where = { restaurantId: rid, isGuest: false, lastOrderAt: { gte: sevenDaysAgo } };
        const [rows, count] = await Promise.all([
          prisma.customer.findMany({ where, orderBy: { lastOrderAt: "desc" }, take: PREVIEW_LIMIT, select: baseSelect }),
          prisma.customer.count({ where }),
        ]);
        return ok<AudienceResponse>({ count, customers: serialize(rows as Row[]), computed: true });
      }

      case "recorrente-sumido": {
        const where = { restaurantId: rid, isGuest: false, totalOrders: { gte: 2 }, segment: "FRIO" };
        const [rows, count] = await Promise.all([
          prisma.customer.findMany({ where, orderBy: { totalOrders: "desc" }, take: PREVIEW_LIMIT, select: baseSelect }),
          prisma.customer.count({ where }),
        ]);
        return ok<AudienceResponse>({ count, customers: serialize(rows as Row[]), computed: true });
      }

      case "aniversariantes":
      case "aumentar-sobremesas":
      case "aumentar-bebidas":
      case "produto-favorito":
      case "alto-ticket":
      case "carrinho-abandonado":
        return ok<AudienceResponse>({ count: 0, customers: [], computed: false });

      default:
        return badRequest(`Template '${template}' desconhecido`);
    }
  } catch (err) {
    console.error("[GET /api/crm/audience]", err);
    return serverError();
  }
}
