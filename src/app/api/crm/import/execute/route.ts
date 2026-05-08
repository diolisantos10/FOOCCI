import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getTenantContext } from "@/lib/tenant";
import { ImportService } from "@/services/crm/ImportService";
import { OrderImportService } from "@/services/crm/OrderImportService";

const customerMappingSchema = z.object({
  phone:    z.string().min(1),
  name:     z.string().optional(),
  email:    z.string().optional(),
  birthday: z.string().optional(),
});

const orderMappingSchema = z.object({
  customerPhone:    z.string().min(1),
  customerName:     z.string().optional(),
  customerEmail:    z.string().optional(),
  orderDate:        z.string().min(1),
  orderTotal:       z.string().min(1),
  orderExternalId:  z.string().optional(),
  orderStatus:      z.string().optional(),
  paymentMethod:    z.string().optional(),
  deliveryFee:      z.string().optional(),
  discount:         z.string().optional(),
  fulfillmentType:  z.string().optional(),
  productName:      z.string().optional(),
  productCategory:  z.string().optional(),
  quantity:         z.string().optional(),
  unitPrice:        z.string().optional(),
  itemTotal:        z.string().optional(),
  itemNotes:        z.string().optional(),
});

const bodySchema = z.object({
  rows:       z.array(z.record(z.string())).min(1).max(50_000),
  importType: z.enum(["customers", "orders", "customers_orders"]).default("customers"),
  filename:   z.string().optional(),
  dryRun:     z.boolean().default(true),
  customerMapping: customerMappingSchema.optional(),
  orderMapping:    orderMappingSchema.optional(),
  // Legacy alias used by older client code (customer-only import)
  mapping:    customerMappingSchema.optional(),
});

export async function POST(req: NextRequest) {
  const ctx = getTenantContext(req);
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: unknown;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Dados inválidos", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { rows, importType, dryRun, filename } = parsed.data;
  const customerMapping = parsed.data.customerMapping ?? parsed.data.mapping;
  const orderMapping    = parsed.data.orderMapping;

  try {
    // ── Customer-only import ────────────────────────────────────────────────
    if (importType === "customers") {
      if (!customerMapping) {
        return NextResponse.json({ error: "Mapeamento de clientes ausente." }, { status: 400 });
      }
      const result = await ImportService.process(ctx.restaurantId, rows, customerMapping, dryRun);
      return NextResponse.json({ data: result });
    }

    // ── Order import (with or without separate customer pass) ──────────────
    if (importType === "orders" || importType === "customers_orders") {
      if (!orderMapping) {
        return NextResponse.json({ error: "Mapeamento de pedidos ausente." }, { status: 400 });
      }

      // For customers_orders, optionally run the customer mapping pass first to fill in
      // customer-level fields (name/email/birthday) before the order pass touches them.
      // We only do this on execute (not dry run) and only if a customer mapping was supplied.
      if (!dryRun && importType === "customers_orders" && customerMapping) {
        await ImportService.process(ctx.restaurantId, rows, customerMapping, false);
      }

      const result = await OrderImportService.process(
        ctx.restaurantId,
        rows,
        orderMapping,
        dryRun,
        filename ?? "",
      );

      // After order import, also rebuild metrics for the entire restaurant
      // is unnecessary — OrderImportService already rebuilds for affected customers.
      return NextResponse.json({ data: result });
    }

    return NextResponse.json({ error: "Tipo de importação inválido" }, { status: 400 });
  } catch (err) {
    console.error("[POST /api/crm/import/execute]", err);
    return NextResponse.json({ error: "Erro ao processar importação" }, { status: 500 });
  }
}
