/**
 * SaiposIntegrationService
 *
 * Handles all communication with the Saipos Order API.
 *
 * Flow:
 *   1. Restaurant operator enables Saipos in the Integrations page.
 *   2. When an order transitions to CONFIRMED, maybeSendOrder() is called.
 *   3. The service authenticates, maps the Foocci order to Saipos payload,
 *      POSTs to Saipos, and records saiposSentAt on the order.
 *   4. Saipos sends status updates via webhook → handleWebhook().
 *
 * Credentials are stored encrypted in IntegrationConfig (provider = "saipos").
 * Auth tokens are NOT cached between calls — each send fetches a fresh token.
 * This keeps the code stateless and avoids token expiry issues.
 *
 * Saipos API base URLs:
 *   Homologation : https://homolog-order-api.saipos.com
 *   Production   : https://order-api.saipos.com
 */

import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/crypto";
import type { PaymentMethod, OrderStatus } from "@prisma/client";

// ── Structured auth error that preserves Saipos error codes ──────────────────

export class SaiposAuthError extends Error {
  constructor(
    message: string,
    public readonly errorCode: string | number | null = null,
    public readonly responseStatus: number | null = null,
  ) {
    super(message);
    this.name = "SaiposAuthError";
  }
}

// ── Internal config shape (stored encrypted as configBlob) ────────────────────

export interface SaiposRaw {
  environment:     string;   // "HOMOLOGATION" | "PRODUCTION"
  apiKey:          string;   // partner key (secret)
  idPartner:       string;
  codStore:        string;
  autoSendOrders:  boolean;
  syncCatalog:     boolean;
  paymentMappings: Record<string, number>; // PaymentMethod → Saipos payment code
}

// ── Saipos API payload types ───────────────────────────────────────────────────

interface SaiposAuthResponse {
  token: string;
}

// Safe diagnostic payload returned from auth attempts — never includes full secrets.
export interface SaiposAuthDebug {
  authUrl:              string;
  requestBodyKeys:      string[];
  idPartnerExists:      boolean;
  idPartnerLength:      number;
  idPartnerPreview:     string;
  secretExists:         boolean;
  secretLength:         number;
  secretPreview:        string;
  codStore:             string;
  environment:          string;
  responseStatus:       number | null;
  responseBodyKeys:     string[] | null; // keys present in the JSON response body
  responseErrorCode:    string | number | null;
  responseErrorMessage: string | null;
}

interface SaiposOrderItem {
  name:             string;
  unit_price:       number; // cents
  quantity:         number;
  total_price:      number; // cents
  integration_code: string;
  choice_items:     SaiposChoiceItem[];
}

interface SaiposChoiceItem {
  name:             string;
  unit_price:       number;
  quantity:         number;
  integration_code: string;
}

interface SaiposOrderPayload {
  order_id:         string;
  display_id:       string;
  cod_store:        string;
  created_at:       string;
  total_amount:     number; // cents
  customer:         { name: string; phone: string; document: string };
  order_method:     "DELIVERY" | "TAKEOUT" | "TICKET";
  delivery_address?: {
    street:       string;
    number:       string;
    complement:   string;
    neighborhood: string;
    city:         string;
    state:        string;
    zip_code:     string;
  };
  items:            SaiposOrderItem[];
  payment_types:    { name: string; code: number; amount: number }[];
}

// ── Default payment mappings ───────────────────────────────────────────────────
// Saipos payment type codes vary by restaurant POS configuration.
// These defaults cover the most common Brazilian payment methods.
// Restaurant admin can override via the paymentMappings config field.

const DEFAULT_PAYMENT_MAPPINGS: Record<string, number> = {
  CASH:          1,
  PIX:           2,
  CREDIT_CARD:   3,
  DEBIT_CARD:    4,
  CARD_MACHINE:  3,
  PIX_IN_PERSON: 2,
  ONLINE:        3,
};

// ── Saipos webhook event → Foocci OrderStatus mapping ─────────────────────────

const SAIPOS_EVENT_TO_STATUS: Record<string, string> = {
  CONFIRMED:        "CONFIRMED",
  READY_TO_DELIVER: "READY",
  DISPATCHED:       "OUT_FOR_DELIVERY",
  CONCLUDED:        "DELIVERED",
  CANCELLED:        "CANCELLED",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function apiBase(environment: string): string {
  return environment === "PRODUCTION"
    ? "https://order-api.saipos.com"
    : "https://homolog-order-api.saipos.com";
}

function toCents(decimal: unknown): number {
  return Math.round(Number(decimal) * 100);
}

// Extracts error code + message from Saipos response bodies.
// Checks top-level fields first, then nested under response.data (axios-style wrapping).
// message returns null when nothing is found; callers apply their own fallback.
function extractSaiposError(body: Record<string, unknown>): {
  code:     string | number | null;
  message:  string | null;
  bodyKeys: string[];
} {
  const nested = body.data != null && typeof body.data === "object"
    ? body.data as Record<string, unknown>
    : null;

  const code = (
    body.errorCode    ??
    body.code         ??
    body.error_code   ??
    nested?.errorCode ??
    nested?.code      ??
    nested?.error_code
  ) as string | number | null ?? null;

  const message = (
    body.errorMessage    ??
    body.message         ??
    body.error           ??
    body.mensagem        ??
    nested?.errorMessage ??
    nested?.message      ??
    nested?.error        ??
    nested?.mensagem
  ) as string | null ?? null;

  return { code, message, bodyKeys: Object.keys(body) };
}

function shortDisplayId(orderId: string): string {
  // Use last 6 chars of CUID as a short display reference, e.g. "#a1b2c3"
  return `#${orderId.slice(-6).toUpperCase()}`;
}

// ── Service ───────────────────────────────────────────────────────────────────

export class SaiposIntegrationService {

  // ── Load and decrypt config ─────────────────────────────────────────────────

  static async getDecryptedConfig(restaurantId: string): Promise<SaiposRaw | null> {
    const row = await prisma.integrationConfig.findUnique({
      where: { restaurantId_provider: { restaurantId, provider: "saipos" } },
    });
    if (!row || !row.isActive) return null;
    try {
      return JSON.parse(decrypt(row.configBlob)) as SaiposRaw;
    } catch {
      console.error("[saipos] Failed to decrypt config for restaurant", restaurantId);
      return null;
    }
  }

  // ── Auth — internal attempt (returns token + safe diagnostics) ──────────────

  private static async _attemptAuth(raw: SaiposRaw): Promise<{ token: string | null; debug: SaiposAuthDebug }> {
    const authUrl    = `${apiBase(raw.environment)}/auth`;
    const body       = { idPartner: raw.idPartner, secret: raw.apiKey };

    const debug: SaiposAuthDebug = {
      authUrl,
      requestBodyKeys:      Object.keys(body),            // ["idPartner", "secret"]
      idPartnerExists:      Boolean(raw.idPartner),
      idPartnerLength:      raw.idPartner?.length ?? 0,
      idPartnerPreview:     (raw.idPartner?.length ?? 0) >= 8
        ? `${raw.idPartner.slice(0, 4)}...${raw.idPartner.slice(-4)}`
        : "(too short)",
      secretExists:         Boolean(raw.apiKey),
      secretLength:         raw.apiKey?.length ?? 0,
      secretPreview:        (raw.apiKey?.length ?? 0) >= 4
        ? `${raw.apiKey.slice(0, 2)}...${raw.apiKey.slice(-2)}`
        : "(too short or empty)",
      codStore:             raw.codStore,
      environment:          raw.environment,
      responseStatus:       null,
      responseBodyKeys:     null,
      responseErrorCode:    null,
      responseErrorMessage: null,
    };

    console.log(
      `[saipos/auth] url=${authUrl}` +
      ` bodyKeys=${JSON.stringify(debug.requestBodyKeys)}` +
      ` idPartnerLen=${debug.idPartnerLength} idPartnerPreview=${debug.idPartnerPreview}` +
      ` secretLen=${debug.secretLength} secretPreview=${debug.secretPreview}` +
      ` codStore=${debug.codStore}`
    );

    try {
      const res  = await fetch(authUrl, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(body),
        signal:  AbortSignal.timeout(10_000),
      });
      const text = await res.text().catch(() => "");
      debug.responseStatus = res.status;

      try {
        const parsed = JSON.parse(text) as Record<string, unknown>;
        const { code, message, bodyKeys } = extractSaiposError(parsed);
        debug.responseBodyKeys     = bodyKeys;
        debug.responseErrorCode    = code;
        debug.responseErrorMessage = message;
      } catch { /* response body is not JSON */ }

      // Apply fallback message only on error responses where no message was found
      if (!res.ok && !debug.responseErrorMessage) {
        debug.responseErrorMessage = "Mensagem de erro não retornada pela Saipos.";
      }

      console.log(
        `[saipos/auth] responseStatus=${res.status}` +
        (debug.responseBodyKeys     ? ` bodyKeys=[${debug.responseBodyKeys.join(",")}]`             : "") +
        (debug.responseErrorCode    !== null ? ` errorCode=${debug.responseErrorCode}`              : "") +
        (debug.responseErrorMessage ? ` errorMessage=${debug.responseErrorMessage.slice(0, 200)}`   : "")
      );

      if (!res.ok) return { token: null, debug };

      let data: SaiposAuthResponse;
      try { data = JSON.parse(text) as SaiposAuthResponse; } catch { return { token: null, debug }; }
      return { token: data.token ?? null, debug };
    } catch (err) {
      debug.responseErrorMessage = err instanceof Error ? err.message : String(err);
      return { token: null, debug };
    }
  }

  // ── Auth — public (throws on failure; used by order-send flow) ───────────────

  static async getAuthToken(raw: SaiposRaw): Promise<string> {
    const { token, debug } = await SaiposIntegrationService._attemptAuth(raw);
    if (!token) {
      throw new SaiposAuthError(
        `Saipos auth failed (HTTP ${debug.responseStatus ?? "N/A"}): ${debug.responseErrorMessage ?? "unknown error"}`,
        debug.responseErrorCode,
        debug.responseStatus,
      );
    }
    return token;
  }

  // ── Test with a temporary secret — does NOT save anything ─────────────────

  static async testWithTempSecret(restaurantId: string, tempSecret: string): Promise<{ success: boolean; message: string; debug: SaiposAuthDebug }> {
    const row = await prisma.integrationConfig.findUnique({
      where: { restaurantId_provider: { restaurantId, provider: "saipos" } },
    });
    if (!row) {
      const debug: SaiposAuthDebug = {
        authUrl: "", requestBodyKeys: [], idPartnerExists: false, idPartnerLength: 0,
        idPartnerPreview: "", secretExists: false, secretLength: 0, secretPreview: "",
        codStore: "", environment: "", responseStatus: null, responseBodyKeys: null,
        responseErrorCode: null, responseErrorMessage: "Integração não configurada.",
      };
      return { success: false, message: "Integração Saipos não configurada.", debug };
    }

    let raw: SaiposRaw;
    try {
      raw = JSON.parse(decrypt(row.configBlob)) as SaiposRaw;
    } catch {
      const debug: SaiposAuthDebug = {
        authUrl: "", requestBodyKeys: [], idPartnerExists: false, idPartnerLength: 0,
        idPartnerPreview: "", secretExists: false, secretLength: 0, secretPreview: "",
        codStore: "", environment: "", responseStatus: null, responseBodyKeys: null,
        responseErrorCode: null, responseErrorMessage: "Configuração corrompida.",
      };
      return { success: false, message: "Falha ao ler configuração salva.", debug };
    }

    // Swap in the temp secret for this test only
    const testRaw: SaiposRaw = { ...raw, apiKey: tempSecret };
    const { token, debug } = await SaiposIntegrationService._attemptAuth(testRaw);

    if (!token) {
      return {
        success: false,
        message: `Teste com secret temporário falhou (HTTP ${debug.responseStatus ?? "N/A"}): ${debug.responseErrorMessage ?? "erro desconhecido"}`,
        debug,
      };
    }
    return { success: true, message: "Secret temporário autenticado com sucesso na Saipos.", debug };
  }

  // ── Test connection ─────────────────────────────────────────────────────────
  // Loads config directly (ignores isActive) so testing always works even when
  // the integration is disabled. Returns an explicit warning when disabled.

  static async testConnection(restaurantId: string): Promise<{ success: boolean; message: string; debug?: SaiposAuthDebug }> {
    // Load row directly — do NOT filter by isActive here
    const row = await prisma.integrationConfig.findUnique({
      where: { restaurantId_provider: { restaurantId, provider: "saipos" } },
    });

    if (!row) {
      return { success: false, message: "Integração Saipos não configurada. Salve as credenciais primeiro." };
    }

    let raw: SaiposRaw;
    try {
      raw = JSON.parse(decrypt(row.configBlob)) as SaiposRaw;
    } catch {
      return { success: false, message: "Falha ao ler credenciais salvas (configuração corrompida)." };
    }

    // Enumerate each missing field explicitly
    const missing: string[] = [];
    if (!raw.environment) missing.push("environment");
    if (!raw.idPartner)   missing.push("idPartner");
    if (!raw.codStore)    missing.push("codStore");
    if (!raw.apiKey)      missing.push("secret");

    if (missing.length > 0) {
      return {
        success: false,
        message: `Configuração incompleta — campos em falta: ${missing.join(", ")}.`,
      };
    }

    const { token, debug } = await SaiposIntegrationService._attemptAuth(raw);

    if (!token) {
      return {
        success: false,
        message: `Falha na autenticação Saipos (HTTP ${debug.responseStatus ?? "N/A"}): ${debug.responseErrorMessage ?? "erro desconhecido"}`,
        debug,
      };
    }

    const envLabel     = raw.environment === "PRODUCTION" ? "Produção" : "Homologação";
    const disabledNote = !row.isActive
      ? " Teste executado com integração desativada. Ative e salve para enviar pedidos automaticamente."
      : "";

    return {
      success: true,
      message: `Conectado ao Saipos (${envLabel}) com sucesso.${disabledNote}`,
      debug,
    };
  }

  // ── Map Foocci order to Saipos payload ──────────────────────────────────────

  static mapOrderToPayload(
    order: {
      id:           string;
      type:         string;
      total:        unknown;
      createdAt:    Date;
      notes:        string | null;
      customer:     { name: string; phone: string | null };
      deliveryAddress: {
        street: string; number: string; complement: string | null;
        neighborhood: string; city: string; state: string; zipCode: string;
      } | null;
      items: Array<{
        name:      string;
        price:     unknown;
        quantity:  number;
        total:     unknown;
        menuItem:  { saiposIntegrationCode: string | null } | null;
      }>;
      payment: { method: PaymentMethod; amount: unknown } | null;
    },
    raw: SaiposRaw
  ): { payload: SaiposOrderPayload; warnings: string[] } {
    const warnings: string[] = [];
    const mappings = { ...DEFAULT_PAYMENT_MAPPINGS, ...raw.paymentMappings };

    // Map FulfillmentType → Saipos order_method
    const methodMap: Record<string, "DELIVERY" | "TAKEOUT" | "TICKET"> = {
      DELIVERY: "DELIVERY",
      PICKUP:   "TAKEOUT",
      DINE_IN:  "TICKET",
    };
    const orderMethod = methodMap[order.type] ?? "DELIVERY";

    // Map items
    const items: SaiposOrderItem[] = order.items.map((item) => {
      const integrationCode = item.menuItem?.saiposIntegrationCode ?? "";
      if (!integrationCode) {
        warnings.push(`Item "${item.name}" não possui código de integração Saipos (saiposIntegrationCode). Enviado sem código PDV.`);
      }
      return {
        name:             item.name,
        unit_price:       toCents(item.price),
        quantity:         item.quantity,
        total_price:      toCents(item.total),
        integration_code: integrationCode,
        choice_items:     [], // extras/options not yet stored on OrderItem snapshot
      };
    });

    // Map payment
    const paymentMethod = order.payment?.method ?? "CASH";
    const paymentCode   = mappings[paymentMethod] ?? 1;
    const paymentTypes  = [{
      name:   paymentMethod,
      code:   paymentCode,
      amount: toCents(order.total),
    }];

    const payload: SaiposOrderPayload = {
      order_id:     order.id,
      display_id:   shortDisplayId(order.id),
      cod_store:    raw.codStore,
      created_at:   order.createdAt.toISOString(),
      total_amount: toCents(order.total),
      customer: {
        name:     order.customer.name,
        phone:    order.customer.phone ?? "",
        document: "",
      },
      order_method: orderMethod,
      items,
      payment_types: paymentTypes,
    };

    if (orderMethod === "DELIVERY" && order.deliveryAddress) {
      const a = order.deliveryAddress;
      payload.delivery_address = {
        street:       a.street,
        number:       a.number,
        complement:   a.complement ?? "",
        neighborhood: a.neighborhood,
        city:         a.city,
        state:        a.state,
        zip_code:     a.zipCode,
      };
    }

    return { payload, warnings };
  }

  // ── Send order to Saipos ─────────────────────────────────────────────────────

  static async createOrder(restaurantId: string, orderId: string): Promise<void> {
    const raw = await SaiposIntegrationService.getDecryptedConfig(restaurantId);
    if (!raw) throw new Error("Saipos config not found or inactive");

    // Fetch full order with all required relations
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: {
        customer:        { select: { name: true, phone: true } },
        deliveryAddress: true,
        payment:         { select: { method: true, amount: true } },
        items: {
          include: {
            menuItem: { select: { saiposIntegrationCode: true } },
          },
        },
      },
    });

    if (!order || order.restaurantId !== restaurantId) {
      throw new Error(`Order ${orderId} not found for restaurant ${restaurantId}`);
    }

    const { payload, warnings } = SaiposIntegrationService.mapOrderToPayload(order, raw);

    if (warnings.length > 0) {
      console.warn(`[saipos] Order ${orderId} mapping warnings:`, warnings);
    }

    const token = await SaiposIntegrationService.getAuthToken(raw);
    const base  = apiBase(raw.environment);

    const res = await fetch(`${base}/order`, {
      method:  "POST",
      headers: {
        "Content-Type":  "application/json",
        "Authorization": `Bearer ${token}`,
      },
      body:   JSON.stringify(payload),
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Saipos createOrder failed (HTTP ${res.status}): ${text.slice(0, 400)}`);
    }

    const data = await res.json().catch(() => ({})) as Record<string, unknown>;

    // Record successful send
    await prisma.order.update({
      where: { id: orderId },
      data: {
        saiposSentAt:  new Date(),
        saiposOrderId: (data.order_id as string | undefined) ?? orderId,
        saiposStatus:  "SENT",
        saiposError:   null,
      },
    });

    console.log(`[saipos] Order ${orderId} sent successfully. Warnings: ${warnings.length}`);
  }

  // ── Safe wrapper — checks enabled + idempotency ─────────────────────────────
  // Call this from any place where an order transitions to CONFIRMED.
  // Safe to call multiple times — skips if already sent.

  static async maybeSendOrder(restaurantId: string, orderId: string): Promise<void> {
    // Quick check: is integration enabled + autoSendOrders on?
    const row = await prisma.integrationConfig.findUnique({
      where: { restaurantId_provider: { restaurantId, provider: "saipos" } },
      select: { isActive: true, configBlob: true },
    });
    if (!row?.isActive) return;

    let raw: SaiposRaw;
    try {
      raw = JSON.parse(decrypt(row.configBlob)) as SaiposRaw;
    } catch {
      return;
    }
    if (!raw.autoSendOrders) return;

    // Idempotency: skip if already sent
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      select: { id: true, restaurantId: true, saiposSentAt: true },
    });
    if (!order || order.restaurantId !== restaurantId) return;
    if (order.saiposSentAt) return; // already sent

    const attemptAt = new Date();
    try {
      await SaiposIntegrationService.createOrder(restaurantId, orderId);
      // createOrder already writes saiposSentAt; record attempt timestamp too
      await prisma.order.update({
        where: { id: orderId },
        data: { saiposLastAttemptAt: attemptAt },
      }).catch(() => {/* non-critical */});
    } catch (err) {
      const msg            = err instanceof Error ? err.message : String(err);
      const is902          = err instanceof SaiposAuthError && String(err.errorCode) === "902";
      const saiposStatus   = is902 ? "PENDING_SAIPOS_VALIDATION" : "FAILED";
      const errorCode      = err instanceof SaiposAuthError ? String(err.errorCode ?? "") : "";
      console.error(`[saipos] Failed to send order ${orderId}:`, msg);
      await prisma.order.update({
        where: { id: orderId },
        data: {
          saiposStatus:        saiposStatus,
          saiposError:         msg.slice(0, 500),
          saiposLastErrorCode: errorCode || null,
          saiposLastAttemptAt: attemptAt,
        },
      }).catch(() => {/* non-critical */});
    }
  }

  // ── Retry sending a specific order (idempotent) ─────────────────────────────
  // Skips if order was already successfully sent (saiposSentAt is set).

  static async retryOrder(restaurantId: string, orderId: string): Promise<{ sent: boolean; message: string; saiposStatus: string }> {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      select: { id: true, restaurantId: true, saiposSentAt: true },
    });

    if (!order || order.restaurantId !== restaurantId) {
      return { sent: false, message: "Pedido não encontrado.", saiposStatus: "NOT_FOUND" };
    }

    if (order.saiposSentAt) {
      return { sent: false, message: "Pedido já foi enviado ao Saipos com sucesso.", saiposStatus: "ALREADY_SENT" };
    }

    const attemptAt = new Date();
    try {
      await SaiposIntegrationService.createOrder(restaurantId, orderId);
      await prisma.order.update({
        where: { id: orderId },
        data: { saiposLastAttemptAt: attemptAt, saiposLastErrorCode: null },
      }).catch(() => {/* non-critical */});
      return { sent: true, message: "Pedido enviado ao Saipos com sucesso.", saiposStatus: "SENT" };
    } catch (err) {
      const msg       = err instanceof Error ? err.message : String(err);
      const is902     = err instanceof SaiposAuthError && String(err.errorCode) === "902";
      const status    = is902 ? "PENDING_SAIPOS_VALIDATION" : "FAILED";
      const errorCode = err instanceof SaiposAuthError ? String(err.errorCode ?? "") : "";
      await prisma.order.update({
        where: { id: orderId },
        data: {
          saiposStatus:        status,
          saiposError:         msg.slice(0, 500),
          saiposLastErrorCode: errorCode || null,
          saiposLastAttemptAt: attemptAt,
        },
      }).catch(() => {/* non-critical */});
      return { sent: false, message: msg.slice(0, 300), saiposStatus: status };
    }
  }

  // ── Handle incoming Saipos webhook ──────────────────────────────────────────

  static async handleWebhook(payload: {
    event:     string;
    cod_store: string;
    order_id:  string;
  }): Promise<{ handled: boolean; detail: string }> {
    const { event, cod_store, order_id } = payload;

    // Resolve Foocci OrderStatus from Saipos event
    const newStatus = SAIPOS_EVENT_TO_STATUS[event];
    if (!newStatus) {
      console.log(`[saipos/webhook] Unknown event "${event}" for order ${order_id} — ignored`);
      return { handled: false, detail: `Unknown event: ${event}` };
    }

    // Find the integration config by cod_store to scope to the right restaurant
    const configs = await prisma.integrationConfig.findMany({
      where: { provider: "saipos", isActive: true },
      select: { restaurantId: true, configBlob: true },
    });

    let restaurantId: string | null = null;
    for (const cfg of configs) {
      try {
        const r = JSON.parse(decrypt(cfg.configBlob)) as SaiposRaw;
        if (r.codStore === cod_store) {
          restaurantId = cfg.restaurantId;
          break;
        }
      } catch {
        continue;
      }
    }

    if (!restaurantId) {
      console.warn(`[saipos/webhook] No active config found for cod_store "${cod_store}"`);
      return { handled: false, detail: `cod_store not found: ${cod_store}` };
    }

    // Find the Foocci order — order_id is our own order ID sent to Saipos
    const order = await prisma.order.findFirst({
      where: { id: order_id, restaurantId },
      select: { id: true, status: true },
    });

    if (!order) {
      console.warn(`[saipos/webhook] Order not found: ${order_id} (restaurant ${restaurantId})`);
      return { handled: false, detail: `Order not found: ${order_id}` };
    }

    // Validate status transition (don't force illegal transitions)
    const TRANSITIONS: Record<string, string[]> = {
      PENDING:          ["CONFIRMED", "CANCELLED"],
      AWAITING_PAYMENT: ["CONFIRMED", "CANCELLED"],
      CONFIRMED:        ["PREPARING", "READY", "CANCELLED"],
      PREPARING:        ["READY", "CANCELLED"],
      READY:            ["OUT_FOR_DELIVERY", "DELIVERED", "CANCELLED"],
      OUT_FOR_DELIVERY: ["DELIVERED", "CANCELLED"],
      DELIVERED:        [],
      CANCELLED:        [],
    };

    const allowed = TRANSITIONS[order.status] ?? [];
    if (order.status === newStatus) {
      // Already in this status — still update saiposStatus field
      await prisma.order.update({
        where: { id: order.id },
        data:  { saiposStatus: event },
      });
      return { handled: true, detail: `Already in ${newStatus}` };
    }

    if (!allowed.includes(newStatus)) {
      console.warn(`[saipos/webhook] Illegal transition ${order.status} → ${newStatus} for order ${order_id}`);
      await prisma.order.update({
        where: { id: order.id },
        data:  { saiposStatus: event },
      });
      return { handled: false, detail: `Illegal transition ${order.status} → ${newStatus}` };
    }

    // Apply the status transition
    await prisma.order.update({
      where: { id: order.id },
      data: {
        status:       newStatus as OrderStatus,
        saiposStatus: event,
        ...(newStatus === "DELIVERED" && { completedAt: new Date() }),
        ...(newStatus === "CANCELLED" && { cancelledAt: new Date() }),
      },
    });

    console.log(`[saipos/webhook] Order ${order_id}: ${order.status} → ${newStatus} (event: ${event})`);
    return { handled: true, detail: `${order.status} → ${newStatus}` };
  }

  // ── Fetch Saipos catalog (optional) ────────────────────────────────────────

  static async fetchCatalog(restaurantId: string): Promise<unknown> {
    const raw = await SaiposIntegrationService.getDecryptedConfig(restaurantId);
    if (!raw) throw new Error("Saipos config not found or inactive");

    const token = await SaiposIntegrationService.getAuthToken(raw);
    const base  = apiBase(raw.environment);

    const res = await fetch(`${base}/catalog`, {
      headers: { Authorization: `Bearer ${token}` },
      signal:  AbortSignal.timeout(15_000),
    });

    if (!res.ok) {
      throw new Error(`Saipos catalog fetch failed (HTTP ${res.status})`);
    }

    return res.json();
  }
}
