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
 *   Auth (v2.5)  : https://order-api.saipos.com/auth  (always, env-independent)
 *   Homologation : https://homolog-order-api.saipos.com  (non-auth endpoints)
 *   Production   : https://order-api.saipos.com          (non-auth endpoints)
 *
 * Auth body: { idPartner, secret }
 *   idPartner — store-specific ID within the sales channel
 *   secret    — partner/channel-level secret, same across all stores of the partner;
 *               provided by Saipos after credentialing (NOT the store API password)
 */

import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/crypto";
import { isGuestIdentifier } from "@/lib/guest";
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

// ── Payment mapping value — supports legacy numeric codes and full v2.5 object mappings ──────────

export interface SaiposPaymentMappingObject {
  code:        string | number; // Saipos payment type code e.g. "DIN", "CRE", "PARTNER_PAYMENT"
  complement?: string;          // e.g. "PIX", "VISA", "MASTER" for card/pix complement
  type?:       "ONLINE" | "OFFLINE";
  change_for?: number;          // cents; relevant for cash payments
}

// Accepts: numeric legacy code | string code | full object
export type SaiposPaymentMappingValue = number | string | SaiposPaymentMappingObject;

export interface SaiposRaw {
  environment:     string;   // "HOMOLOGATION" | "PRODUCTION"
  // apiKey stores the Saipos partner/channel secret (v2.5 field name: "secret").
  // This is NOT the store-level API password. It is the unique partner/channel secret
  // provided by the Saipos team after partner credentialing — identical for all stores
  // integrated by the same partner. Sent as { secret: apiKey } in /auth body.
  apiKey:          string;
  // idPartner is store-specific: each store connected to the sales channel gets a
  // different idPartner. Sent as { idPartner } in /auth body.
  idPartner:       string;
  // codStore is the numeric store code on the Saipos platform.
  codStore:        string;
  autoSendOrders:  boolean;
  syncCatalog:     boolean;
  // paymentMappings: maps Foocci PaymentMethod to Saipos payment type.
  // Accepts numeric (legacy), string code, or full object with complement/type/change_for.
  paymentMappings: Record<string, SaiposPaymentMappingValue>;
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
  responseStatus:          number | null;
  responseStatusText:      string | null;
  responseContentType:     string | null;
  responseBodyType:        "json" | "html" | "text" | "empty" | "unknown" | null;
  responseBodyEmpty:       boolean | null;
  responseBodyPreviewSafe: string | null;   // ≤300 chars, only for non-JSON bodies
  responseCorrelationId:   string | null;   // x-request-id / correlation-id header
  responseServerHeader:    string | null;
  responseDateHeader:      string | null;
  responseBodyKeys:        string[] | null; // keys present in the JSON response body
  responseErrorCode:       string | number | null;
  responseErrorMessage:    string | null;
}

// ── Saipos v2.5 payload types ─────────────────────────────────────────────────

interface SaiposCustomer {
  id:               string | number; // Foocci customerId or -1 for unidentified guest
  name:             string;
  phone:            string;
  email?:           string;
  document_number?: string;          // CPF or CNPJ without punctuation
  localizer?:       string;
}

// order_method is an object in v2.5 — NOT a plain string
interface SaiposOrderMethodDelivery {
  mode:                "DELIVERY";
  delivery_by:         "PARTNER" | "RESTAURANT";
  delivery_fee:        number;  // cents
  scheduled:           boolean;
  delivery_date_time?: string;  // ISO-8601; only when scheduled=true
  pickupCode?:         string;
}

interface SaiposOrderMethodTakeout {
  mode:                "TAKEOUT";
  scheduled:           boolean;
  // delivery_date_time: v2.5 docs list this as required for TAKEOUT.
  // For unscheduled immediate pickups we fall back to created_at so Saipos
  // always receives a value. If Saipos rejects this, omit and re-test.
  delivery_date_time:  string;
  pickupCode?:         string;
}

interface SaiposOrderMethodTicket {
  mode: "TICKET";
}

type SaiposOrderMethod =
  | SaiposOrderMethodDelivery
  | SaiposOrderMethodTakeout
  | SaiposOrderMethodTicket;

interface SaiposOrderItem {
  desc_item:        string;  // v2.5 field name — was "name"
  unit_price:       number;  // cents
  quantity:         number;
  integration_code: string;
  notes?:           string;
  choice_items:     SaiposChoiceItem[];
}

// Note: Saipos spells "additional" as "aditional" in their schema
interface SaiposChoiceItem {
  desc_item_choice: string;  // v2.5 field name — was "name"
  aditional_price:  number;  // cents — price of this choice on top of base
  quantity:         number;
  integration_code: string;
  notes?:           string;
}

interface SaiposPaymentType {
  code:        string | number; // Saipos payment type code e.g. "DIN", "CRE", "PARTNER_PAYMENT"
  amount:      number;          // cents
  change_for:  number;          // cents; 0 when not a cash payment requiring change
  complement?: string;          // e.g. "PIX", "VISA", "MASTER"
  type?:       "ONLINE" | "OFFLINE";
}

interface SaiposDeliveryAddress {
  street:       string;
  number:       string;
  complement:   string;
  neighborhood: string;
  city:         string;
  state:        string;
  zip_code:     string;
}

interface SaiposOrderPayload {
  order_id:        string;
  display_id:      string;
  cod_store:       string;
  created_at:      string;
  notes?:          string;
  total_discount:  number;   // cents; required, 0 when no discount
  total_increase?: number;   // cents; omit when 0
  total_amount?:   number;   // cents
  customer:        SaiposCustomer;
  order_method:    SaiposOrderMethod;
  delivery_address?: SaiposDeliveryAddress;
  items:           SaiposOrderItem[];
  payment_types:   SaiposPaymentType[];
}

// ── Default payment mappings ───────────────────────────────────────────────────
// Saipos payment type codes vary by restaurant POS configuration.
// These defaults cover the most common Brazilian payment methods.
// Restaurant admin can override via the paymentMappings config field.

const DEFAULT_PAYMENT_MAPPINGS: Record<string, SaiposPaymentMappingValue> = {
  CASH:          { code: "DIN",             type: "OFFLINE", change_for: 0 },
  PIX:           { code: "PARTNER_PAYMENT", complement: "PIX",    type: "ONLINE",  change_for: 0 },
  CREDIT_CARD:   { code: "CRE",             type: "OFFLINE", change_for: 0 },
  DEBIT_CARD:    { code: "DEB",             type: "OFFLINE", change_for: 0 },
  CARD_MACHINE:  { code: "CRE",             type: "OFFLINE", change_for: 0 },
  PIX_IN_PERSON: { code: "PARTNER_PAYMENT", complement: "PIX",    type: "OFFLINE", change_for: 0 },
  ONLINE:        { code: "PARTNER_PAYMENT", complement: "ONLINE",  type: "ONLINE",  change_for: 0 },
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

// Auth endpoint is fixed to the v2.5 production host regardless of environment.
// Non-auth endpoints (orders, catalog, etc.) still honour the environment field.
const SAIPOS_AUTH_URL = "https://order-api.saipos.com/auth";

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

function resolvePayment(
  mappingValue: SaiposPaymentMappingValue,
  amount: number,
): SaiposPaymentType {
  if (typeof mappingValue === "number") {
    // Legacy numeric code — restaurants that configured mappings before v2.5 migration
    return { code: mappingValue, amount, change_for: 0 };
  }
  if (typeof mappingValue === "string") {
    return { code: mappingValue, amount, change_for: 0 };
  }
  return {
    code:       mappingValue.code,
    amount,
    change_for: mappingValue.change_for ?? 0,
    ...(mappingValue.complement !== undefined && { complement: mappingValue.complement }),
    ...(mappingValue.type       !== undefined && { type:       mappingValue.type }),
  };
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
    const authUrl    = SAIPOS_AUTH_URL;
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
      responseStatus:          null,
      responseStatusText:      null,
      responseContentType:     null,
      responseBodyType:        null,
      responseBodyEmpty:       null,
      responseBodyPreviewSafe: null,
      responseCorrelationId:   null,
      responseServerHeader:    null,
      responseDateHeader:      null,
      responseBodyKeys:        null,
      responseErrorCode:       null,
      responseErrorMessage:    null,
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
        headers: {
          "Content-Type": "application/json",
          "Accept":       "application/json",
        },
        body:    JSON.stringify(body),
        signal:  AbortSignal.timeout(10_000),
      });
      const text = await res.text().catch(() => "");
      debug.responseStatus     = res.status;
      debug.responseStatusText = res.statusText ?? null;
      debug.responseContentType = res.headers.get("content-type");
      debug.responseCorrelationId =
        res.headers.get("x-request-id") ??
        res.headers.get("request-id") ??
        res.headers.get("x-correlation-id") ??
        res.headers.get("correlation-id") ??
        null;
      debug.responseServerHeader = res.headers.get("server");
      debug.responseDateHeader   = res.headers.get("date");
      debug.responseBodyEmpty    = !text;

      const ct = debug.responseContentType ?? "";
      if (!text) {
        debug.responseBodyType = "empty";
      } else if (ct.includes("application/json") || text.trimStart().startsWith("{") || text.trimStart().startsWith("[")) {
        debug.responseBodyType = "json";
      } else if (ct.includes("text/html") || text.trimStart().startsWith("<")) {
        debug.responseBodyType = "html";
      } else if (ct.includes("text/plain")) {
        debug.responseBodyType = "text";
      } else {
        debug.responseBodyType = "unknown";
      }

      // Safe preview for non-JSON bodies only (JSON keys captured separately below)
      if (debug.responseBodyType !== "json") {
        debug.responseBodyPreviewSafe = text.slice(0, 300) || null;
      }

      try {
        const parsed = JSON.parse(text) as Record<string, unknown>;
        const { code, message, bodyKeys } = extractSaiposError(parsed);
        debug.responseBodyKeys     = bodyKeys;
        debug.responseErrorCode    = code;
        debug.responseErrorMessage = message;
      } catch { /* response body is not JSON */ }

      // Specific 403 messages; generic fallback for other errors with no body message
      if (!res.ok && !debug.responseErrorMessage) {
        if (res.status === 403) {
          debug.responseErrorMessage = debug.responseBodyEmpty
            ? "HTTP 403 returned by Saipos with empty response body."
            : "Falha na autenticação Saipos (HTTP 403): acesso negado pela Saipos no endpoint v2.5. Verifique se o parceiro/credencial está liberado para autenticação em https://order-api.saipos.com/auth.";
        } else {
          debug.responseErrorMessage = "Mensagem de erro não retornada pela Saipos.";
        }
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
        codStore: "", environment: "", responseStatus: null, responseStatusText: null,
        responseContentType: null, responseBodyType: null, responseBodyEmpty: null,
        responseBodyPreviewSafe: null, responseCorrelationId: null,
        responseServerHeader: null, responseDateHeader: null, responseBodyKeys: null,
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
        codStore: "", environment: "", responseStatus: null, responseStatusText: null,
        responseContentType: null, responseBodyType: null, responseBodyEmpty: null,
        responseBodyPreviewSafe: null, responseCorrelationId: null,
        responseServerHeader: null, responseDateHeader: null, responseBodyKeys: null,
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
    if (!raw.apiKey)      missing.push("secret (partner/channel secret)");

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
      id:          string;
      customerId:  string;
      type:        string;
      total:       unknown;
      subtotal:    unknown;
      deliveryFee: unknown;
      discount:    unknown;
      createdAt:   Date;
      notes:       string | null;
      customer: {
        name:      string;
        phone:     string | null;
        email?:    string | null;
        document?: string | null;
        isGuest?:  boolean;
      };
      deliveryAddress: {
        street: string; number: string; complement: string | null;
        neighborhood: string; city: string; state: string; zipCode: string;
      } | null;
      items: Array<{
        name:       string;
        price:      unknown;
        quantity:   number;
        total:      unknown;
        notes?:     string | null;
        addonsJson: unknown;
        menuItem:   { saiposIntegrationCode: string | null } | null;
      }>;
      payment: { method: PaymentMethod; amount: unknown } | null;
    },
    raw: SaiposRaw
  ): { payload: SaiposOrderPayload; warnings: string[] } {
    const warnings: string[] = [];
    const mappings = { ...DEFAULT_PAYMENT_MAPPINGS, ...raw.paymentMappings };

    // Build customer
    const isGuest = order.customer.isGuest ?? isGuestIdentifier(order.customer.phone ?? "");
    const customerId: string | number = isGuest ? -1 : order.customerId;
    const customerPhone = (!order.customer.phone || isGuestIdentifier(order.customer.phone))
      ? ""
      : order.customer.phone;
    if (!customerPhone) {
      warnings.push("Cliente sem telefone — phone enviado como string vazia.");
    }
    const customer: SaiposCustomer = { id: customerId, name: order.customer.name, phone: customerPhone };
    if (order.customer.email)    customer.email           = order.customer.email;
    if (order.customer.document) customer.document_number = order.customer.document;

    // Build order_method as v2.5 object (not a plain string)
    let orderMethod: SaiposOrderMethod;
    if (order.type === "DELIVERY") {
      orderMethod = {
        mode:         "DELIVERY",
        delivery_by:  "RESTAURANT",
        delivery_fee: toCents(order.deliveryFee),
        scheduled:    false,
      };
    } else if (order.type === "PICKUP") {
      orderMethod = {
        mode:               "TAKEOUT",
        scheduled:          false,
        delivery_date_time: order.createdAt.toISOString(),
      };
    } else {
      // DINE_IN or any unknown type
      orderMethod = { mode: "TICKET" };
    }

    // Map items using v2.5 field names
    const items: SaiposOrderItem[] = order.items.map((item) => {
      const integrationCode = item.menuItem?.saiposIntegrationCode ?? "";
      if (!integrationCode) {
        warnings.push(`Item "${item.name}" sem saiposIntegrationCode — enviado sem código PDV.`);
      }
      if (item.addonsJson != null) {
        warnings.push(`Item "${item.name}" tem addonsJson mas choice_items não está implementado — complementos não enviados.`);
      }
      const mapped: SaiposOrderItem = {
        desc_item:        item.name,
        unit_price:       toCents(item.price),
        quantity:         item.quantity,
        integration_code: integrationCode,
        choice_items:     [],
      };
      if (item.notes) mapped.notes = item.notes;
      return mapped;
    });

    // Map payment
    const paymentMethod = order.payment?.method ?? "CASH";
    const mappingValue  = mappings[paymentMethod] ?? DEFAULT_PAYMENT_MAPPINGS["CASH"]!;
    if (typeof mappingValue === "number") {
      warnings.push(`Método "${paymentMethod}" usa código numérico legado (${mappingValue}) — considere migrar para string v2.5.`);
    }
    const paymentTypes: SaiposPaymentType[] = [
      resolvePayment(mappingValue, toCents(order.total)),
    ];

    const payload: SaiposOrderPayload = {
      order_id:       order.id,
      display_id:     shortDisplayId(order.id),
      cod_store:      raw.codStore,
      created_at:     order.createdAt.toISOString(),
      total_discount: toCents(order.discount),
      customer,
      order_method:   orderMethod,
      items,
      payment_types:  paymentTypes,
    };

    if (order.notes) payload.notes = order.notes;

    if (order.type === "DELIVERY" && order.deliveryAddress) {
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
        customer:        { select: { name: true, phone: true, email: true, document: true, isGuest: true } },
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
      const msg          = err instanceof Error ? err.message : String(err);
      const is902        = err instanceof SaiposAuthError && String(err.errorCode) === "902";
      const is403        = err instanceof SaiposAuthError && err.responseStatus === 403;
      const saiposStatus = is902 ? "PENDING_SAIPOS_VALIDATION"
                         : is403 ? "AUTH_BLOCKED_403"
                         : "FAILED";
      const errorCode    = err instanceof SaiposAuthError
        ? (err.errorCode ? String(err.errorCode) : err.responseStatus ? String(err.responseStatus) : "")
        : "";
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
      const is403     = err instanceof SaiposAuthError && err.responseStatus === 403;
      const status    = is902 ? "PENDING_SAIPOS_VALIDATION" : is403 ? "AUTH_BLOCKED_403" : "FAILED";
      const errorCode = err instanceof SaiposAuthError
        ? (err.errorCode ? String(err.errorCode) : err.responseStatus ? String(err.responseStatus) : "")
        : "";
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
