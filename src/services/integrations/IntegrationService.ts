/**
 * IntegrationService
 *
 * Unified service for all external integrations in Foocci.
 *
 * Providers:
 *   - "whatsapp"    → bridges to existing EvolutionConfigService
 *   - "stone"       → IntegrationConfig row (configBlob encrypted JSON)
 *   - "mercadopago" → IntegrationConfig row
 *
 * Security: every method is scoped to restaurantId. ConfigBlob is stored
 * AES-256-GCM encrypted. Views returned to the API layer never contain
 * plaintext secrets — only masked previews.
 */

import { prisma } from "@/lib/prisma";
import { encrypt, decrypt, maskSecret } from "@/lib/crypto";
import { validateSumUpCredentials } from "@/lib/sumup";
import { EvolutionConfigService } from "@/services/evolution/EvolutionConfigService";
import { EvolutionClient, EvolutionApiError } from "@/lib/evolution/EvolutionClient";
import { serviceOk, serviceFail, ServiceResult } from "@/types";
import { SaiposIntegrationService } from "@/services/integrations/SaiposIntegrationService";
import type {
  IntegrationProvider,
  StoneConfigInput,
  MercadoPagoConfigInput,
  OpenAIConfigInput,
  SaiposConfigInput,
  SumUpConfigInput,
} from "@/validators/integrations";

// ── Public view type (safe for API responses) ─────────────────────────────────

export interface IntegrationView {
  provider: string;
  status:   "unconfigured" | "configured" | "active" | "error" | "pending_validation";
  isActive: boolean;
  lastTestedAt: string | null;
  lastError:    string | null;
  /** Visible fields — non-secrets plain, secrets masked. */
  fields: Record<string, string | null>;
}

export interface TestResult {
  success: boolean;
  message: string;
  debug?:  unknown; // populated by Saipos test for safe on-screen diagnostics
}

// ── Internal raw config shapes ────────────────────────────────────────────────

interface StoneRaw   { environment: string; clientId: string; clientSecret: string }
interface MpRaw      { environment: string; accessToken: string; publicKey?: string }
interface OpenAIRaw  { apiKey: string }
interface SaiposRaw  {
  environment:     string;
  apiKey:          string;
  idPartner:       string;
  codStore:        string;
  autoSendOrders:  boolean;
  syncCatalog:     boolean;
  paymentMappings: Record<string, number>;
}
interface SumupRaw   {
  environment:     string;
  apiKey:          string;
  merchantCode:    string;
  maxInstallments: number;
}

type AnyRaw = StoneRaw | MpRaw | OpenAIRaw | SaiposRaw | SumupRaw;

// ── Helpers ───────────────────────────────────────────────────────────────────

function encodeConfig(raw: AnyRaw): string {
  return encrypt(JSON.stringify(raw));
}

function decodeConfig<T>(blob: string): T {
  return JSON.parse(decrypt(blob)) as T;
}

/** Race a promise against a timeout so a hung Evolution never stalls the page. */
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error("timeout")), ms)),
  ]);
}

function maskView(raw: AnyRaw, provider: IntegrationProvider): Record<string, string | null> {
  if (provider === "stone") {
    const r = raw as StoneRaw;
    return {
      environment:         r.environment,
      clientId:            r.clientId,
      clientSecretPreview: maskSecret(r.clientSecret),
    };
  }
  if (provider === "mercadopago") {
    const r = raw as MpRaw;
    return {
      environment:         r.environment,
      accessTokenPreview:  maskSecret(r.accessToken),
      // Public Key is not a secret (it ships to the browser) — show it in full.
      publicKey:           r.publicKey || null,
    };
  }
  if (provider === "saipos") {
    const r = raw as SaiposRaw;
    return {
      environment:      r.environment,
      apiKeyPreview:    maskSecret(r.apiKey),
      idPartner:        r.idPartner,
      codStore:         r.codStore,
      autoSendOrders:   String(r.autoSendOrders),
      syncCatalog:      String(r.syncCatalog),
      paymentMappings:  JSON.stringify(r.paymentMappings ?? {}),
    };
  }
  if (provider === "sumup") {
    const r = raw as SumupRaw;
    return {
      environment:      r.environment,
      apiKeyPreview:    maskSecret(r.apiKey),
      merchantCode:     r.merchantCode,          // not a secret
      maxInstallments:  String(r.maxInstallments ?? 1),
    };
  }
  // openai
  const r = raw as OpenAIRaw;
  return { apiKeyPreview: maskSecret(r.apiKey) };
}

function dbRowToView(row: {
  provider: string;
  configBlob: string;
  isActive: boolean;
  lastTestedAt: Date | null;
  lastError: string | null;
}): IntegrationView {
  const provider = row.provider as IntegrationProvider;
  let fields: Record<string, string | null> = {};
  try {
    const raw = decodeConfig<AnyRaw>(row.configBlob);
    fields = maskView(raw, provider);
  } catch {
    // decryption failed — config corrupt, treat as error
  }

  // isActive drives status; lastError now stores any test message (success or failure).
  // [PENDING_VALIDATION] prefix means Saipos returned errorCode 902 — credentials pending approval.
  const status: IntegrationView["status"] =
    row.isActive ? "active" :
    !row.lastTestedAt ? "unconfigured" :
    (row.provider === "saipos" && row.lastError?.startsWith("[PENDING_VALIDATION]"))
      ? "pending_validation" : "error";

  return {
    provider,
    status,
    isActive:     row.isActive,
    lastTestedAt: row.lastTestedAt?.toISOString() ?? null,
    lastError:    row.lastError,
    fields,
  };
}

// ── Service ───────────────────────────────────────────────────────────────────

export class IntegrationService {

  // ── list all integration views for a restaurant ─────────────────────────────

  static async listViews(restaurantId: string): Promise<IntegrationView[]> {
    // WhatsApp (EvolutionConfig)
    const waView = await IntegrationService.getView("whatsapp", restaurantId);

    // Other providers from IntegrationConfig
    const rows = await prisma.integrationConfig.findMany({
      where: { restaurantId },
      select: {
        provider: true, configBlob: true, isActive: true,
        lastTestedAt: true, lastError: true,
      },
    });

    const otherViews = rows.map(dbRowToView);

    // Ensure all known providers appear, even if not yet configured
    const configuredProviders = new Set(otherViews.map((v) => v.provider));
    const unconfigured: IntegrationView[] = (["stone", "mercadopago", "openai", "saipos", "sumup"] as IntegrationProvider[])
      .filter((p) => !configuredProviders.has(p))
      .map((p) => ({
        provider:     p,
        status:       "unconfigured" as const,
        isActive:     false,
        lastTestedAt: null,
        lastError:    null,
        fields:       {},
      }));

    return [waView.ok ? waView.data : waUnconfigured(), ...otherViews, ...unconfigured];
  }

  // ── get single view ──────────────────────────────────────────────────────────

  static async getView(
    provider: "whatsapp" | IntegrationProvider,
    restaurantId: string
  ): Promise<ServiceResult<IntegrationView>> {
    if (provider === "whatsapp") {
      const result = await EvolutionConfigService.getView(restaurantId);
      if (!result.ok) {
        if (result.status === 404) return serviceOk(waUnconfigured());
        return serviceFail(result.error, result.status);
      }
      const v = result.data;
      const hasMinimalConfig = !!v.instanceName && !!v.baseUrl;
      const fields = {
        instanceName:         v.instanceName,
        baseUrl:              v.baseUrl,
        apiKeyPreview:        v.apiKeyPreview,
        webhookSecretPreview: v.webhookSecretPreview,
      };

      // Not active / not minimally configured → no need to reach Evolution.
      if (!v.isActive || !hasMinimalConfig) {
        return serviceOk({
          provider:     "whatsapp",
          status:       hasMinimalConfig ? "configured" : "unconfigured",
          isActive:     v.isActive,
          lastTestedAt: null,
          lastError:    null,
          fields,
        });
      }

      // Active config: NEVER trust isActive alone. isActive only means "a config
      // row exists and was activated" — it stays true after the WhatsApp session
      // drops. Query the LIVE connection state so the badge can't claim
      // "Conectado" while the instance is actually "close" (the reported bug:
      // status shows connected but messages get no reply).
      const live = await IntegrationService._liveWhatsAppStatus(restaurantId);
      return serviceOk({
        provider:     "whatsapp",
        status:       live.status,
        isActive:     v.isActive,
        lastTestedAt: null,
        lastError:    live.lastError,
        fields,
      });
    }

    const row = await prisma.integrationConfig.findUnique({
      where: { restaurantId_provider: { restaurantId, provider } },
    });
    if (!row) {
      return serviceOk({
        provider, status: "unconfigured", isActive: false,
        lastTestedAt: null, lastError: null, fields: {},
      });
    }
    return serviceOk(dbRowToView(row));
  }

  // ── upsert config ────────────────────────────────────────────────────────────

  static async upsert(
    provider: IntegrationProvider,
    restaurantId: string,
    input: StoneConfigInput | MercadoPagoConfigInput | OpenAIConfigInput | SaiposConfigInput
  ): Promise<ServiceResult<IntegrationView>> {
    // Load existing decrypted config to preserve secrets if empty strings sent
    let existingRaw: AnyRaw | null = null;
    const existing = await prisma.integrationConfig.findUnique({
      where: { restaurantId_provider: { restaurantId, provider } },
    });
    if (existing) {
      try { existingRaw = decodeConfig<AnyRaw>(existing.configBlob); } catch { /* ignore */ }
    }

    let newRaw: AnyRaw;

    if (provider === "stone") {
      const inp = input as StoneConfigInput;
      const old = existingRaw as StoneRaw | null;
      newRaw = {
        environment:  inp.environment,
        clientId:     inp.clientId,
        clientSecret: inp.clientSecret || old?.clientSecret || "",
      };
    } else if (provider === "mercadopago") {
      const inp = input as MercadoPagoConfigInput;
      const old = existingRaw as MpRaw | null;
      newRaw = {
        environment: inp.environment,
        accessToken: inp.accessToken || old?.accessToken || "",
        publicKey:   inp.publicKey  || old?.publicKey  || "",
      };
    } else if (provider === "saipos") {
      const inp = input as SaiposConfigInput;
      const old = existingRaw as SaiposRaw | null;
      let paymentMappings: Record<string, number> = old?.paymentMappings ?? {};
      if (inp.paymentMappings) {
        try { paymentMappings = JSON.parse(inp.paymentMappings); } catch { /* keep existing */ }
      }
      newRaw = {
        environment:    inp.environment,
        apiKey:         (inp.apiKey as string) || old?.apiKey || "",
        idPartner:      inp.idPartner,
        codStore:       inp.codStore,
        autoSendOrders: Boolean(inp.autoSendOrders),
        syncCatalog:    Boolean(inp.syncCatalog),
        paymentMappings,
      };
    } else if (provider === "sumup") {
      const inp = input as SumUpConfigInput;
      const old = existingRaw as SumupRaw | null;
      newRaw = {
        environment:     inp.environment,
        apiKey:          inp.apiKey || old?.apiKey || "",
        merchantCode:    inp.merchantCode,
        maxInstallments: inp.maxInstallments ?? old?.maxInstallments ?? 1,
      };
    } else {
      // openai
      const inp = input as OpenAIConfigInput;
      const old = existingRaw as OpenAIRaw | null;
      newRaw = { apiKey: inp.apiKey || old?.apiKey || "" };
    }

    const blob = encodeConfig(newRaw);

    // Saipos lets the user explicitly control the enabled/disabled state.
    // All other providers always activate on save.
    const isActive = provider === "saipos"
      ? ((input as SaiposConfigInput).isActive ?? true)
      : true;

    const row = await prisma.integrationConfig.upsert({
      where: { restaurantId_provider: { restaurantId, provider } },
      create: {
        restaurantId,
        provider,
        configBlob: blob,
        isActive,
        lastError:  null,
      },
      update: {
        configBlob: blob,
        isActive,
        lastError:  null,
      },
    });

    return serviceOk(dbRowToView(row));
  }

  // ── disconnect ───────────────────────────────────────────────────────────────

  static async disconnect(
    provider: IntegrationProvider,
    restaurantId: string
  ): Promise<ServiceResult<void>> {
    await prisma.integrationConfig.updateMany({
      where: { restaurantId, provider },
      data:  { isActive: false, lastError: null },
    });
    return serviceOk(undefined);
  }

  // ── test connection ──────────────────────────────────────────────────────────

  static async test(
    provider: "whatsapp" | IntegrationProvider,
    restaurantId: string
  ): Promise<ServiceResult<TestResult>> {
    if (provider === "whatsapp") {
      return IntegrationService._testWhatsApp(restaurantId);
    }

    const row = await prisma.integrationConfig.findUnique({
      where: { restaurantId_provider: { restaurantId, provider } },
    });
    if (!row) {
      return serviceOk({ success: false, message: "Integração não configurada." });
    }

    let result: TestResult;
    try {
      const raw = decodeConfig<AnyRaw>(row.configBlob);
      if (provider === "stone")            result = await IntegrationService._testStone(raw as StoneRaw);
      else if (provider === "mercadopago") result = await IntegrationService._testMercadoPago(raw as MpRaw);
      else if (provider === "saipos")      result = await IntegrationService._testSaipos(restaurantId);
      else if (provider === "sumup")       result = await IntegrationService._testSumUp(raw as SumupRaw);
      else                                 result = await IntegrationService._testOpenAI(raw as OpenAIRaw);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro desconhecido";
      result = { success: false, message: `Erro ao testar: ${msg}` };
    }

    // For Saipos 902, prefix lastError with [PENDING_VALIDATION] so dbRowToView can detect it.
    const pendingValidation = (result as { _pendingValidation?: boolean })._pendingValidation === true;
    const storedError = pendingValidation
      ? `[PENDING_VALIDATION] ${result.message}`
      : result.message;

    // Persist test outcome — always store the message so UI can show it on reopen
    await prisma.integrationConfig.update({
      where: { restaurantId_provider: { restaurantId, provider } },
      data: {
        lastTestedAt: new Date(),
        lastError:    storedError,
        isActive:     result.success,
      },
    });

    return serviceOk(result);
  }

  // ── private test helpers ─────────────────────────────────────────────────────

  /**
   * Live WhatsApp connection status — the SOURCE OF TRUTH for the badge.
   * Only reports "active" (→ "Conectado") when the Evolution instance is
   * genuinely "open". A dropped/closed session maps to "error", and an
   * in-progress link to "pending_validation" (→ "Aguardando conexão"). A
   * verification failure never claims connected.
   */
  private static async _liveWhatsAppStatus(
    restaurantId: string,
  ): Promise<{ status: IntegrationView["status"]; lastError: string | null }> {
    const snap = await EvolutionConfigService.getSnapshot(restaurantId);
    if (!snap.ok) return { status: "error", lastError: "WhatsApp não configurado." };
    try {
      const status = await withTimeout(EvolutionClient.getInstanceStatus(snap.data), 6000);
      if (status.state === "open") return { status: "active", lastError: null };
      if (status.state === "connecting") {
        return { status: "pending_validation", lastError: "Conectando — escaneie o QR code para finalizar." };
      }
      return { status: "error", lastError: "WhatsApp desconectado. Reconecte escaneando o QR code." };
    } catch {
      return { status: "error", lastError: "Não foi possível verificar a conexão com o WhatsApp no momento." };
    }
  }

  private static async _testWhatsApp(restaurantId: string): Promise<ServiceResult<TestResult>> {
    const snap = await EvolutionConfigService.getSnapshot(restaurantId);
    if (!snap.ok) {
      if (snap.status === 404)
        return serviceOk({ success: false, message: "WhatsApp não configurado." });
      return serviceOk({ success: false, message: snap.error });
    }
    try {
      const status = await EvolutionClient.getInstanceStatus(snap.data);
      const connected = status.state === "open";
      return serviceOk({
        success: connected,
        message: connected ? "Instância conectada com sucesso." : "Instância não conectada (verifique o QR code).",
      });
    } catch (err) {
      if (err instanceof EvolutionApiError && err.status === 404) {
        return serviceOk({
          success: false,
          message: "Instância não encontrada no servidor Evolution. Verifique o campo 'Nome da instância' nas configurações avançadas.",
        });
      }
      return serviceOk({ success: false, message: "Não foi possível alcançar o servidor Evolution. Verifique a URL e a API Key." });
    }
  }

  private static async _testStone(raw: StoneRaw): Promise<TestResult> {
    if (!raw.clientId || !raw.clientSecret) {
      return { success: false, message: "Configuração incompleta (Client ID ou Secret em falta)." };
    }
    const tokenUrl =
      raw.environment === "production"
        ? "https://accounts.openfinance.io/auth/realms/stone_account/protocol/openid-connect/token"
        : "https://sandbox-accounts.openfinance.io/auth/realms/stone_account/protocol/openid-connect/token";

    try {
      const res = await fetch(tokenUrl, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type:    "client_credentials",
          client_id:     raw.clientId,
          client_secret: raw.clientSecret,
        }),
        signal: AbortSignal.timeout(8000),
      });
      if (res.ok) return { success: true, message: "Credenciais Stone válidas." };
      if (res.status === 401 || res.status === 400)
        return { success: false, message: "Credenciais inválidas (Client ID ou Secret incorretos)." };
      return { success: false, message: `Stone retornou HTTP ${res.status}.` };
    } catch {
      return { success: false, message: "Não foi possível alcançar a Stone. Verifique sua conexão." };
    }
  }

  private static async _testMercadoPago(raw: MpRaw): Promise<TestResult> {
    if (!raw.accessToken) {
      return { success: false, message: "Access Token não configurado." };
    }
    try {
      const res = await fetch("https://api.mercadopago.com/users/me", {
        headers: { Authorization: `Bearer ${raw.accessToken}` },
        signal: AbortSignal.timeout(8000),
      });
      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        const name = (data as Record<string, string>).first_name ?? "";
        return { success: true, message: `Conectado${name ? ` como ${name}` : ""}.` };
      }
      if (res.status === 401)
        return { success: false, message: "Access Token inválido ou expirado." };
      return { success: false, message: `Mercado Pago retornou HTTP ${res.status}.` };
    } catch {
      return { success: false, message: "Não foi possível alcançar o Mercado Pago." };
    }
  }

  private static async _testSumUp(raw: SumupRaw): Promise<TestResult> {
    const r = await validateSumUpCredentials({ apiKey: raw.apiKey, merchantCode: raw.merchantCode });
    return { success: r.ok, message: r.message };
  }

  private static async _testOpenAI(raw: OpenAIRaw): Promise<TestResult> {
    if (!raw.apiKey) {
      return { success: false, message: "API Key não configurada." };
    }
    try {
      const res = await fetch("https://api.openai.com/v1/models", {
        headers: { Authorization: `Bearer ${raw.apiKey}` },
        signal: AbortSignal.timeout(8000),
      });
      if (res.ok) return { success: true, message: "API Key válida. Conexão com OpenAI estabelecida." };
      if (res.status === 401) return { success: false, message: "API Key inválida ou revogada." };
      if (res.status === 429) return { success: false, message: "Limite de requisições atingido. A chave é válida." };
      return { success: false, message: `OpenAI retornou HTTP ${res.status}.` };
    } catch {
      return { success: false, message: "Não foi possível alcançar a OpenAI. Verifique sua conexão." };
    }
  }

  private static async _testSaipos(restaurantId: string): Promise<TestResult & { _pendingValidation?: boolean }> {
    const result = await SaiposIntegrationService.testConnection(restaurantId);
    const debug  = result.debug as Record<string, unknown> | undefined;
    const is902  = !result.success && String(debug?.responseErrorCode) === "902";
    return { ...result, _pendingValidation: is902 };
  }

}

// ── helpers ───────────────────────────────────────────────────────────────────

function waUnconfigured(): IntegrationView {
  return {
    provider:     "whatsapp",
    status:       "unconfigured",
    isActive:     false,
    lastTestedAt: null,
    lastError:    null,
    fields:       {},
  };
}
