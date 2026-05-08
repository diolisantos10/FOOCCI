/**
 * OrderImportService
 *
 * Imports historical orders (+ order items + customers) from a flat CSV/XLSX file.
 *
 * File structure assumed: one row per order item.
 * Multiple rows sharing the same order identity (phone + date + externalId or total)
 * are grouped into a single order.
 *
 * Safety guarantees:
 *   - Tenant-scoped: all queries use restaurantId.
 *   - Idempotent: each order gets a fingerprint stored in Order.idempotencyKey.
 *     Re-uploading the same file skips already-imported orders.
 *   - Non-destructive: existing customer data is only filled in, never overwritten.
 *   - Historical dates: Order.importedAt stores the original order date so that
 *     CRM segmentation (Quente/Morno/Frio) reflects real history.
 *   - Product matching: matched by normalized name within the restaurant. Unmatched
 *     items are kept as name/price snapshots with menuItemId = null.
 */

import { createHash } from "crypto";
import { Decimal } from "@prisma/client/runtime/library";
import { prisma } from "@/lib/prisma";
import { CustomerMetricsSyncService } from "./CustomerMetricsSyncService";

// ── Field Mapping ─────────────────────────────────────────────────────────────

export interface OrderFieldMapping {
  // Customer
  customerPhone:    string;         // required
  customerName?:    string;
  customerEmail?:   string;
  // Order
  orderDate:        string;         // required
  orderTotal:       string;         // required
  orderExternalId?: string;
  orderStatus?:     string;
  paymentMethod?:   string;
  deliveryFee?:     string;
  discount?:        string;
  fulfillmentType?: string;
  // Items (optional — one row per item)
  productName?:     string;
  productCategory?: string;
  quantity?:        string;
  unitPrice?:       string;
  itemTotal?:       string;
  itemNotes?:       string;
}

// ── Hints for auto-detection ───────────────────────────────────────────────────

export const ORDER_COLUMN_HINTS: Record<keyof OrderFieldMapping, string[]> = {
  customerPhone:    ["telefone_cliente", "telefone", "phone", "celular", "whatsapp", "fone"],
  customerName:     ["nome_cliente", "cliente", "nome", "customer_name", "name"],
  customerEmail:    ["email_cliente", "email", "e-mail", "mail"],
  orderDate:        ["data_pedido", "data", "date", "created_at", "criado_em", "data_compra"],
  orderTotal:       ["total", "valor_total", "valor", "amount", "total_pedido"],
  orderExternalId:  ["id_externo", "external_id", "pedido_id", "order_id", "codigo"],
  orderStatus:      ["status", "situacao", "situação", "estado"],
  paymentMethod:    ["pagamento", "metodo_pagamento", "payment", "forma_pagamento"],
  deliveryFee:      ["taxa_entrega", "frete", "delivery_fee", "entrega"],
  discount:         ["desconto", "discount"],
  fulfillmentType:  ["tipo_entrega", "modalidade", "fulfillment", "tipo"],
  productName:      ["produto", "item", "nome_produto", "product", "descricao", "descrição"],
  productCategory:  ["categoria", "category", "categoria_produto"],
  quantity:         ["quantidade", "qtd", "qty", "quantity", "quant"],
  unitPrice:        ["preco_unitario", "valor_unitario", "preco", "price", "unit_price", "preco_unit"],
  itemTotal:        ["total_item", "subtotal_item", "item_total"],
  itemNotes:        ["observacao", "observação", "obs", "notes", "nota_item"],
};

export function autoDetectOrderMapping(columns: string[]): Partial<OrderFieldMapping> {
  const lower = columns.map((c) => c.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s/g, "_"));
  function find(hints: string[]): string | undefined {
    const idx = lower.findIndex((c) => hints.some((h) => c.includes(h)));
    return idx >= 0 ? columns[idx] : undefined;
  }
  const detected: Partial<OrderFieldMapping> = {};
  for (const [field, hints] of Object.entries(ORDER_COLUMN_HINTS)) {
    const found = find(hints);
    if (found) (detected as Record<string, string>)[field] = found;
  }
  return detected;
}

// ── Internal types ────────────────────────────────────────────────────────────

interface ParsedItem {
  productName:     string | null;
  productCategory: string | null;
  quantity:        number;
  unitPrice:       number;
  itemTotal:       number;
  itemNotes:       string | null;
}

interface ParsedOrderGroup {
  key:            string;         // grouping fingerprint (phone + date + externalId)
  customerPhone:  string;         // normalized E.164
  customerName:   string | null;
  customerEmail:  string | null;
  orderDate:      Date;
  orderTotal:     number;
  externalId:     string | null;
  paymentMethod:  string | null;
  deliveryFee:    number;
  discount:       number;
  fulfillmentType: string;
  items:          ParsedItem[];
  warnings:       string[];
  sourceRows:     number[];
}

interface ValidationError {
  row:    number;
  reason: string;
}

// ── Preview / Result types ────────────────────────────────────────────────────

export interface OrderImportPreview {
  totalRows:         number;
  validRows:         number;
  errorRows:         number;
  warningRows:       number;
  uniqueOrders:      number;
  newCustomers:      number;
  existingCustomers: number;
  productsMatched:   number;
  productsUnmatched: number;
  duplicateOrders:   number;
  errors:            Array<{ row: number; reason: string }>;
  warnings:          string[];
  unmatchedProducts: Array<{ name: string; count: number }>;
  sampleOrders:      Array<{
    phone:      string;
    date:       string;
    total:      number;
    itemCount:  number;
    status:     "new" | "duplicate" | "warning";
  }>;
}

export interface OrderImportResult {
  totalRows:         number;
  createdCustomers:  number;
  updatedCustomers:  number;
  createdOrders:     number;
  createdItems:      number;
  skippedDuplicates: number;
  errorRows:         number;
  unmatchedProducts: Array<{ name: string; count: number; revenue: number }>;
  rebuildSummary:    { customersProcessed: number; customersUpdated: number };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function normalizePhone(raw: string): string | null {
  if (!raw?.trim()) return null;
  const trimmed = raw.trim();
  if (/^\+[1-9]\d{7,14}$/.test(trimmed)) return trimmed;
  const digits = trimmed.replace(/\D/g, "");
  if (!digits || digits.length < 8) return null;
  if (digits.length === 10 || digits.length === 11) return `+55${digits}`;
  if ((digits.length === 12 || digits.length === 13) && digits.startsWith("55")) return `+${digits}`;
  if (digits.length <= 15) return `+${digits}`;
  return null;
}

function normalizeProductName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function parseDate(raw: string): Date | null {
  if (!raw?.trim()) return null;
  const v = raw.trim();
  // DD/MM/YYYY or DD/MM/YY
  const br = v.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (br && br[1] && br[2] && br[3]) {
    const year = br[3].length === 2 ? `20${br[3]}` : br[3];
    const d = new Date(`${year}-${br[2].padStart(2, "0")}-${br[1].padStart(2, "0")}T12:00:00Z`);
    if (!isNaN(d.getTime())) return d;
  }
  // ISO or other parseable
  const iso = new Date(v);
  if (!isNaN(iso.getTime())) return iso;
  return null;
}

function parseDecimal(raw: string | undefined | null): number {
  if (!raw?.trim()) return 0;
  // Handle Brazilian format (1.234,56) and standard (1234.56)
  const cleaned = raw.trim().replace(/[R$\s]/g, "");
  const br = cleaned.replace(/\./g, "").replace(",", ".");
  const n = parseFloat(br);
  return isNaN(n) ? 0 : n;
}

function mapFulfillmentType(raw: string | null): string {
  if (!raw) return "DELIVERY";
  const v = raw.toLowerCase();
  if (v.includes("pickup") || v.includes("retirada") || v.includes("balcao") || v.includes("balcão")) return "PICKUP";
  if (v.includes("dine") || v.includes("mesa") || v.includes("local")) return "DINE_IN";
  return "DELIVERY";
}

function mapPaymentMethod(raw: string | null): string | null {
  if (!raw) return null;
  const v = raw.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  if (v.includes("pix")) return "PIX";
  if (v.includes("dinheiro") || v.includes("cash") || v.includes("especie")) return "CASH";
  if (v.includes("debito") || v.includes("debit")) return "DEBIT_CARD";
  if (v.includes("credito") || v.includes("credit")) return "CREDIT_CARD";
  if (v.includes("cartao") || v.includes("card") || v.includes("maquina")) return "CARD_MACHINE";
  if (v.includes("online")) return "ONLINE";
  return null;
}

function makeOrderKey(phone: string, date: Date, externalId: string | null, total: number): string {
  if (externalId) return `ext:${phone}:${externalId}`;
  return `fp:${phone}:${date.toISOString().slice(0, 10)}:${total.toFixed(2)}`;
}

function makeIdempotencyKey(restaurantId: string, phone: string, date: Date, total: number, itemNames: string[]): string {
  const items = [...itemNames].sort().join(",");
  return createHash("sha256")
    .update(`import:${restaurantId}|${phone}|${date.toISOString().slice(0, 10)}|${total.toFixed(2)}|${items}`)
    .digest("hex");
}

// ── Row parsing ───────────────────────────────────────────────────────────────

function parseRow(
  raw: Record<string, string>,
  mapping: OrderFieldMapping,
  rowIndex: number,
): { ok: true; phone: string; date: Date; total: number; item: ParsedItem | null; customerName: string | null; customerEmail: string | null; externalId: string | null; paymentMethod: string | null; deliveryFee: number; discount: number; fulfillmentType: string }
  | { ok: false; reason: string } {

  const rawPhone = raw[mapping.customerPhone] ?? "";
  const phone = normalizePhone(rawPhone);
  if (!phone) return { ok: false, reason: `Linha ${rowIndex}: telefone inválido "${rawPhone}"` };

  const rawDate = mapping.orderDate ? (raw[mapping.orderDate] ?? "") : "";
  const date = parseDate(rawDate);
  if (!date) return { ok: false, reason: `Linha ${rowIndex}: data inválida "${rawDate}"` };

  const rawTotal = mapping.orderTotal ? (raw[mapping.orderTotal] ?? "") : "";
  const total = parseDecimal(rawTotal);
  if (total <= 0) return { ok: false, reason: `Linha ${rowIndex}: total inválido "${rawTotal}"` };

  const externalId = mapping.orderExternalId ? (raw[mapping.orderExternalId]?.trim() || null) : null;
  const customerName = mapping.customerName ? (raw[mapping.customerName]?.trim() || null) : null;
  const customerEmail = mapping.customerEmail ? (raw[mapping.customerEmail]?.trim() || null) : null;
  const paymentMethod = mapping.paymentMethod ? mapPaymentMethod(raw[mapping.paymentMethod] ?? null) : null;
  const deliveryFee = mapping.deliveryFee ? parseDecimal(raw[mapping.deliveryFee]) : 0;
  const discount = mapping.discount ? parseDecimal(raw[mapping.discount]) : 0;
  const fulfillmentType = mapping.fulfillmentType ? mapFulfillmentType(raw[mapping.fulfillmentType] ?? null) : "DELIVERY";

  // Item fields — optional
  const rawProductName = mapping.productName ? (raw[mapping.productName]?.trim() || null) : null;
  let item: ParsedItem | null = null;
  if (rawProductName) {
    const qty = mapping.quantity ? Math.max(1, Math.round(parseDecimal(raw[mapping.quantity]))) : 1;
    const unitPrice = mapping.unitPrice ? parseDecimal(raw[mapping.unitPrice]) : 0;
    const rawItemTotal = mapping.itemTotal ? parseDecimal(raw[mapping.itemTotal]) : 0;
    const resolvedTotal = rawItemTotal > 0 ? rawItemTotal : unitPrice * qty;
    item = {
      productName:     rawProductName,
      productCategory: mapping.productCategory ? (raw[mapping.productCategory]?.trim() || null) : null,
      quantity:        qty,
      unitPrice:       unitPrice > 0 ? unitPrice : (resolvedTotal > 0 ? resolvedTotal / qty : 0),
      itemTotal:       resolvedTotal,
      itemNotes:       mapping.itemNotes ? (raw[mapping.itemNotes]?.trim() || null) : null,
    };
  }

  return { ok: true, phone, date, total, item, customerName, customerEmail, externalId, paymentMethod, deliveryFee, discount, fulfillmentType };
}

// ── Row grouping into orders ──────────────────────────────────────────────────

function groupRowsIntoOrders(
  rawRows: Record<string, string>[],
  mapping: OrderFieldMapping,
): { groups: ParsedOrderGroup[]; errors: ValidationError[]; totalRows: number } {
  const errors: ValidationError[] = [];
  const orderMap = new Map<string, ParsedOrderGroup>();
  const orderList: ParsedOrderGroup[] = []; // preserves insertion order

  rawRows.forEach((raw, i) => {
    const result = parseRow(raw, mapping, i + 1);
    if (!result.ok) {
      errors.push({ row: i + 1, reason: result.reason });
      return;
    }

    const { phone, date, total, item, customerName, customerEmail, externalId, paymentMethod, deliveryFee, discount, fulfillmentType } = result;
    const key = makeOrderKey(phone, date, externalId, total);

    if (orderMap.has(key)) {
      const group = orderMap.get(key)!;
      if (item) group.items.push(item);
      group.sourceRows.push(i + 1);
      // Merge customer name/email if we have more data
      if (!group.customerName && customerName) group.customerName = customerName;
      if (!group.customerEmail && customerEmail) group.customerEmail = customerEmail;
    } else {
      const group: ParsedOrderGroup = {
        key,
        customerPhone: phone,
        customerName,
        customerEmail,
        orderDate: date,
        orderTotal: total,
        externalId,
        paymentMethod,
        deliveryFee,
        discount,
        fulfillmentType,
        items: item ? [item] : [],
        warnings: [],
        sourceRows: [i + 1],
      };
      orderMap.set(key, group);
      orderList.push(group);
    }
  });

  return { groups: orderList, errors, totalRows: rawRows.length };
}

// ── Product matching ──────────────────────────────────────────────────────────

async function buildProductMap(restaurantId: string): Promise<Map<string, { id: string; categoryId: string | null; categoryName: string | null }>> {
  const items = await prisma.menuItem.findMany({
    where:  { category: { restaurantId } },
    select: {
      id:   true,
      name: true,
      category: { select: { id: true, name: true } },
    },
  });
  const map = new Map<string, { id: string; categoryId: string | null; categoryName: string | null }>();
  for (const item of items) {
    map.set(normalizeProductName(item.name), {
      id:           item.id,
      categoryId:   item.category?.id ?? null,
      categoryName: item.category?.name ?? null,
    });
  }
  return map;
}

function matchProduct(
  name: string,
  productMap: Map<string, { id: string; categoryId: string | null; categoryName: string | null }>,
): { id: string; categoryId: string | null; categoryName: string | null } | null {
  const normalized = normalizeProductName(name);
  const exact = productMap.get(normalized);
  if (exact) return exact;
  // Fuzzy: check if any key contains or is contained by the normalized name
  for (const [key, val] of productMap) {
    if (key.includes(normalized) || normalized.includes(key)) return val;
  }
  return null;
}

// ── Public service ────────────────────────────────────────────────────────────

export class OrderImportService {
  static async process(
    restaurantId: string,
    rawRows: Record<string, string>[],
    mapping: OrderFieldMapping,
    dryRun: boolean,
    filename = "",
  ): Promise<OrderImportPreview | OrderImportResult> {

    const { groups, errors, totalRows } = groupRowsIntoOrders(rawRows, mapping);

    // Build product map (used for matching in both preview and execute)
    const productMap = await buildProductMap(restaurantId);

    // ── Gather product match stats ────────────────────────────────────────────

    const unmatchedNameCount = new Map<string, number>(); // name → count
    let productsMatched = 0;
    let productsUnmatched = 0;
    let warningRows = 0;

    for (const group of groups) {
      for (const item of group.items) {
        if (!item.productName) continue;
        const match = matchProduct(item.productName, productMap);
        if (match) {
          productsMatched++;
        } else {
          productsUnmatched++;
          unmatchedNameCount.set(item.productName, (unmatchedNameCount.get(item.productName) ?? 0) + 1);
          group.warnings.push(`Produto não encontrado: "${item.productName}"`);
        }
      }
      if (group.warnings.length > 0) warningRows++;
    }

    // ── Check existing customers ──────────────────────────────────────────────
    const phones = [...new Set(groups.map((g) => g.customerPhone))];
    const existingCustomers = phones.length > 0
      ? await prisma.customer.findMany({
          where:  { restaurantId, phone: { in: phones } },
          select: { phone: true },
        })
      : [];
    const existingPhoneSet = new Set(existingCustomers.map((c) => c.phone));

    const newCustomers      = phones.filter((p) => !existingPhoneSet.has(p)).length;
    const existingCustCount = phones.filter((p) =>  existingPhoneSet.has(p)).length;

    // ── Check duplicate orders (already imported) ─────────────────────────────
    const ikeys = groups.map((g) =>
      makeIdempotencyKey(restaurantId, g.customerPhone, g.orderDate, g.orderTotal, g.items.map((i) => i.productName ?? ""))
    );
    const existingOrders = ikeys.length > 0
      ? await prisma.order.findMany({
          where:  { idempotencyKey: { in: ikeys } },
          select: { idempotencyKey: true },
        })
      : [];
    const existingIkeySet = new Set(existingOrders.map((o) => o.idempotencyKey));
    const duplicateOrders = ikeys.filter((k) => existingIkeySet.has(k)).length;

    const unmatchedList = [...unmatchedNameCount.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([name, count]) => ({ name, count }));

    // ── Dry run — return preview ──────────────────────────────────────────────
    if (dryRun) {
      const validRows = groups.reduce((s, g) => s + g.sourceRows.length, 0);
      const sampleOrders = groups.slice(0, 8).map((g, idx) => ({
        phone:     g.customerPhone,
        date:      g.orderDate.toISOString().slice(0, 10),
        total:     g.orderTotal,
        itemCount: g.items.length,
        status:    existingIkeySet.has(ikeys[idx] ?? "") ? "duplicate" as const
                 : g.warnings.length > 0                  ? "warning"   as const
                 :                                           "new"       as const,
      }));

      return {
        totalRows,
        validRows,
        errorRows:         errors.length,
        warningRows,
        uniqueOrders:      groups.length,
        newCustomers,
        existingCustomers: existingCustCount,
        productsMatched,
        productsUnmatched,
        duplicateOrders,
        errors:            errors.slice(0, 20),
        warnings:          groups.flatMap((g) => g.warnings).slice(0, 20),
        unmatchedProducts: unmatchedList.slice(0, 30),
        sampleOrders,
      } satisfies OrderImportPreview;
    }

    // ── Execute import ────────────────────────────────────────────────────────

    // Create ImportJob record
    const importJob = await prisma.importJob.create({
      data: {
        restaurantId,
        type:      "orders",
        filename,
        status:    "IMPORTING",
        totalRows,
      },
      select: { id: true },
    });

    let createdCustomers  = 0;
    let updatedCustomers  = 0;
    let createdOrders     = 0;
    let createdItems      = 0;
    let skippedDuplicates = 0;
    const unmatchedRevenue = new Map<string, number>();

    const affectedCustomerIds = new Set<string>();

    // Process each order group
    const BATCH_SIZE = 20;
    for (let gi = 0; gi < groups.length; gi += BATCH_SIZE) {
      const batch = groups.slice(gi, gi + BATCH_SIZE);

      for (const group of batch) {
        const ikey = makeIdempotencyKey(
          restaurantId,
          group.customerPhone,
          group.orderDate,
          group.orderTotal,
          group.items.map((i) => i.productName ?? ""),
        );

        // Skip duplicates
        if (existingIkeySet.has(ikey)) {
          skippedDuplicates++;
          continue;
        }

        try {
          const result = await prisma.$transaction(async (tx) => {
            // Upsert customer
            const customer = await tx.customer.upsert({
              where:  { phone_restaurantId: { phone: group.customerPhone, restaurantId } },
              create: {
                restaurantId,
                name:  group.customerName ?? "Sem nome",
                phone: group.customerPhone,
                email: group.customerEmail ?? null,
              },
              update: {
                // Only fill missing fields
                ...(group.customerName ? { name: group.customerName } : {}),
                ...(group.customerEmail ? { email: group.customerEmail } : {}),
              },
              select: { id: true, name: true },
            });

            // Build order items with product matching
            const itemsData = group.items.map((item) => {
              const match = item.productName ? matchProduct(item.productName, productMap) : null;
              if (!match && item.productName) {
                unmatchedRevenue.set(
                  item.productName,
                  (unmatchedRevenue.get(item.productName) ?? 0) + item.itemTotal,
                );
              }
              return {
                menuItemId:   match?.id ?? null,
                name:         item.productName ?? "Item importado",
                price:        new Decimal(item.unitPrice),
                quantity:     item.quantity,
                total:        new Decimal(item.itemTotal > 0 ? item.itemTotal : item.unitPrice * item.quantity),
                categoryId:   match?.categoryId ?? null,
                categoryName: item.productCategory ?? match?.categoryName ?? null,
                notes:        item.itemNotes ?? null,
              };
            });

            const orderTotal = group.orderTotal;
            const subtotal   = Math.max(0, orderTotal - group.deliveryFee + group.discount);

            const order = await tx.order.create({
              data: {
                restaurantId,
                customerId:    customer.id,
                status:        "CONFIRMED",
                type:          group.fulfillmentType === "PICKUP" ? "PICKUP"
                             : group.fulfillmentType === "DINE_IN" ? "DINE_IN"
                             : "DELIVERY",
                source:        "import",
                importedAt:    group.orderDate,   // store real historical date
                subtotal:      new Decimal(subtotal),
                deliveryFee:   new Decimal(group.deliveryFee),
                discount:      new Decimal(group.discount),
                total:         new Decimal(orderTotal),
                idempotencyKey: ikey,
                items:         itemsData.length > 0 ? { create: itemsData } : undefined,
              },
              select: { id: true },
            });

            // Create payment record if method known
            if (group.paymentMethod) {
              const methodMap: Record<string, string> = {
                PIX: "PIX", CASH: "CASH", DEBIT_CARD: "DEBIT_CARD",
                CREDIT_CARD: "CREDIT_CARD", CARD_MACHINE: "CARD_MACHINE", ONLINE: "ONLINE",
              };
              const dbMethod = methodMap[group.paymentMethod] ?? "CASH";
              await tx.payment.create({
                data: {
                  orderId:     order.id,
                  method:      dbMethod as "PIX" | "CASH" | "DEBIT_CARD" | "CREDIT_CARD" | "CARD_MACHINE" | "ONLINE",
                  status:      "PAID",
                  amount:      new Decimal(orderTotal),
                  paymentMode: "PAY_ON_DELIVERY",
                },
              });
            }

            return { customerId: customer.id, orderId: order.id, itemCount: itemsData.length, isNew: !existingPhoneSet.has(group.customerPhone) };
          });

          affectedCustomerIds.add(result.customerId);
          if (result.isNew) { createdCustomers++; existingPhoneSet.add(group.customerPhone); }
          else                updatedCustomers++;
          createdOrders++;
          createdItems += result.itemCount;
        } catch (err) {
          console.error("[OrderImportService] Failed to import order group:", group.key, err);
        }
      }
    }

    // ── Rebuild CRM metrics for all affected customers ────────────────────────

    let rebuildProcessed = 0;
    let rebuildUpdated   = 0;

    for (const customerId of affectedCustomerIds) {
      try {
        await CustomerMetricsSyncService.rebuildCustomerMetrics(customerId);
        rebuildUpdated++;
      } catch (err) {
        console.error("[OrderImportService] Metrics rebuild failed for:", customerId, err);
      }
      rebuildProcessed++;
    }

    // ── Finalize ImportJob ────────────────────────────────────────────────────

    const unmatchedFinal = [...unmatchedRevenue.entries()].map(([name, revenue]) => ({
      name,
      count:   unmatchedNameCount.get(name) ?? 1,
      revenue: Math.round(revenue * 100) / 100,
    }));

    await prisma.importJob.update({
      where: { id: importJob.id },
      data: {
        status:           "COMPLETED",
        validRows:        groups.length,
        errorRows:        errors.length,
        warningRows,
        createdCustomers,
        updatedCustomers,
        createdOrders,
        createdItems,
        skippedDuplicates,
        unmatchedProducts: unmatchedFinal.length,
        completedAt:       new Date(),
        reportJson: {
          errors:            errors.slice(0, 50),
          unmatchedProducts: unmatchedFinal.slice(0, 50),
        } as object,
      },
    });

    return {
      totalRows,
      createdCustomers,
      updatedCustomers,
      createdOrders,
      createdItems,
      skippedDuplicates,
      errorRows: errors.length,
      unmatchedProducts: unmatchedFinal,
      rebuildSummary: { customersProcessed: rebuildProcessed, customersUpdated: rebuildUpdated },
    } satisfies OrderImportResult;
  }
}
