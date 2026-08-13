/**
 * MetaConfigService — secure storage/lookup for per-restaurant Meta WhatsApp
 * credentials. accessToken + webhookVerifyToken are AES-256-GCM encrypted at rest
 * (lib/crypto). The raw token is NEVER returned to the client — only masked
 * previews via getPublic().
 */

import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { encrypt, decrypt, maskSecret } from "@/lib/crypto";

export interface MetaConfigInput {
  restaurantId:        string;
  wabaId:              string;
  phoneNumberId:       string;
  displayPhoneNumber?: string | null;
  businessId?:         string | null;
  configId?:           string | null;
  accessToken:         string;        // plaintext — encrypted here
  tokenExpiresAt?:     Date | null;
  webhookVerifyToken?: string;        // plaintext — generated if absent
  coexistence?:        boolean;       // true = number is also live on the Business App (phone)
}

/** Server-only resolved config with DECRYPTED secrets. Never send to a client. */
export interface MetaConfigResolved {
  restaurantId:       string;
  wabaId:             string;
  phoneNumberId:      string;
  displayPhoneNumber: string | null;
  businessId:         string | null;
  accessToken:        string;  // decrypted
  webhookVerifyToken: string;  // decrypted
  connectionStatus:   string;
  coexistence:        boolean;
}

/** Client-safe view — masked token, no decryptable secrets. */
export interface MetaConfigPublic {
  connected:          boolean;
  connectionStatus:   string;
  displayPhoneNumber: string | null;
  wabaId:             string | null;
  phoneNumberId:      string | null;
  businessId:         string | null;
  tokenPreview:       string | null; // "EAAB...0000"
  tokenExpiresAt:     string | null; // ISO date or null (null = token never expires)
  tokenExpiringSoon:  boolean;       // true when ≤ 30 days to expiry
  lastHealthCheckAt:  string | null;
  lastError:          string | null;
  qualityRating:      string | null;
  messagingLimit:     string | null;
  metaCrmEnabled:     boolean;
  coexistence:        boolean;
}

export function generateVerifyToken(): string {
  return randomBytes(24).toString("hex");
}

/**
 * Troca ACIDENTAL de número, recusada.
 *
 * Carrega a frase pronta para o lojista em `message` — quem captura devolve ela,
 * não inventa outra. A recusa tem de dizer o CONSERTO: um alerta que só informa o
 * sintoma vira paisagem e ninguém age (guardrail 6).
 */
export class MetaNumberSwapBlockedError extends Error {
  readonly code = "META_NUMBER_SWAP_BLOCKED" as const;
  constructor(
    readonly message: string,
    readonly currentPhoneNumberId: string,
    readonly attemptedPhoneNumberId: string,
  ) {
    super(message);
    this.name = "MetaNumberSwapBlockedError";
  }
}

/**
 * Único estado em que trocar o número de um restaurante é seguro: o anterior já foi
 * explicitamente desligado.
 *
 * É uma allowlist, e isso é deliberado — FAIL-CLOSED. Status desconhecido, PENDING,
 * ERROR ou uma string nova que alguém introduza no futuro caem todos na recusa. O
 * inverso (bloquear só o que está em CONNECTED) deixaria a falha ABERTA: bastaria um
 * health-check marcar ERROR para a troca silenciosa voltar a ser possível.
 */
const SWAPPABLE_STATUSES = new Set(["DISCONNECTED"]);

export const MetaConfigService = {
  /**
   * Create/update a restaurant's Meta config (encrypts secrets).
   *
   * ⚠️ TRAVA: recusa trocar o `phoneNumberId` de um restaurante que já tem número
   * em uso — lança `MetaNumberSwapBlockedError` e NÃO grava nada.
   *
   * Por que a trava existe. A chave deste upsert é `restaurantId`, não o número. Sem
   * guarda, conectar um SEGUNDO número no mesmo restaurante SOBRESCREVE o primeiro:
   * `phoneNumberId`, `wabaId` e token trocados de uma vez, sem erro e sem log. O
   * número que sai deixa de ser reconhecido pelo webhook de entrada
   * (`getByPhoneNumberId` devolve null) e toda mensagem que os clientes mandarem para
   * ele passa a ser DESCARTADA em silêncio. Não é hipótese: a tela tem o botão
   * "Conectar número que está no celular" (MetaProviderCard.tsx:439) ao lado de um
   * restaurante já conectado, e um clique bastava.
   *
   * O que continua passando, de propósito — travar o que é legítimo é como esta
   * guarda viraria a próxima quebra:
   *   • MESMO número com dado novo → renovação de token, `tokenExpiresAt`, troca de
   *     WABA, reconexão. Passa em QUALQUER status; sem isso o token expira e ninguém
   *     consegue renovar, que é uma queda pior do que a que se evita (guardrail 5).
   *   • Restaurante SEM config → o primeiro número entra normalmente.
   *   • Depois de `disconnect()` ou `remove()` → a saída explícita, que existe.
   *
   * Só a substituição ACIDENTAL é bloqueada.
   */
  async upsert(input: MetaConfigInput): Promise<void> {
    // Lido cru, com `select`: `getResolved` descriptografaria os segredos e um token
    // corrompido derrubaria a GUARDA — a proteção não pode ser mais destrutiva que o
    // problema que ela evita. Aqui não se lê segredo nenhum.
    const atual = await prisma.metaWhatsAppConfig.findUnique({
      where:  { restaurantId: input.restaurantId },
      select: { phoneNumberId: true, connectionStatus: true, displayPhoneNumber: true },
    });

    if (atual) {
      const mesmoNumero = atual.phoneNumberId.trim() === input.phoneNumberId.trim();
      if (!mesmoNumero && !SWAPPABLE_STATUSES.has(atual.connectionStatus)) {
        // O rótulo humano quando existe; nunca o id da Graph, que não diz nada a quem lê.
        const numeroAtual = atual.displayPhoneNumber?.trim()
          ? `o número ${atual.displayPhoneNumber.trim()}`
          : "outro número";
        const message =
          `Este restaurante já está conectado a ${numeroAtual}. ` +
          `Conectar um número diferente agora substituiria o atual, e as mensagens enviadas para ele deixariam de chegar. ` +
          `Para trocar de número: desconecte o atual em Integrações → WhatsApp → Desconectar e só então conecte o novo.`;

        // Evidência concreta, sem segredo e sem telefone de cliente (guardrail 6).
        console.warn(
          `[MetaConfigService] troca de número RECUSADA restaurantId=${input.restaurantId} ` +
          `atual=${atual.phoneNumberId} tentado=${input.phoneNumberId} status=${atual.connectionStatus}`,
        );
        throw new MetaNumberSwapBlockedError(message, atual.phoneNumberId, input.phoneNumberId);
      }
    }

    const accessTokenEnc = encrypt(input.accessToken);
    const verifyTokenEnc = encrypt(input.webhookVerifyToken ?? generateVerifyToken());
    const data = {
      wabaId:             input.wabaId,
      phoneNumberId:      input.phoneNumberId,
      displayPhoneNumber: input.displayPhoneNumber ?? null,
      businessId:         input.businessId ?? null,
      configId:           input.configId ?? null,
      accessToken:        accessTokenEnc,
      tokenExpiresAt:     input.tokenExpiresAt ?? null,
      webhookVerifyToken: verifyTokenEnc,
      connectionStatus:   "CONNECTED",
      lastError:          null,
      // Only touch the coexistence flag when the caller states it, so a plain
      // token-refresh upsert never silently clears it.
      ...(input.coexistence !== undefined ? { coexistence: input.coexistence } : {}),
    };
    await prisma.metaWhatsAppConfig.upsert({
      where:  { restaurantId: input.restaurantId },
      create: { restaurantId: input.restaurantId, ...data },
      update: data,
    });
  },

  async getResolved(restaurantId: string): Promise<MetaConfigResolved | null> {
    const cfg = await prisma.metaWhatsAppConfig.findUnique({ where: { restaurantId } });
    return cfg ? resolve(cfg) : null;
  },

  /** Inbound webhook routing: phone_number_id → restaurant config. */
  async getByPhoneNumberId(phoneNumberId: string): Promise<MetaConfigResolved | null> {
    const cfg = await prisma.metaWhatsAppConfig.findUnique({ where: { phoneNumberId } });
    return cfg ? resolve(cfg) : null;
  },

  /** Masked, client-safe view. */
  async getPublic(restaurantId: string): Promise<MetaConfigPublic | null> {
    const cfg = await prisma.metaWhatsAppConfig.findUnique({ where: { restaurantId } });
    if (!cfg) return null;
    let tokenPreview: string | null = null;
    try { tokenPreview = maskSecret(decrypt(cfg.accessToken)); } catch { tokenPreview = "***"; }
    const expiresAt = cfg.tokenExpiresAt;
    const tokenExpiringSoon = expiresAt != null
      ? expiresAt.getTime() - Date.now() < 30 * 24 * 60 * 60 * 1000
      : false;
    return {
      connected:          cfg.connectionStatus === "CONNECTED",
      connectionStatus:   cfg.connectionStatus,
      displayPhoneNumber: cfg.displayPhoneNumber,
      wabaId:             cfg.wabaId,
      phoneNumberId:      cfg.phoneNumberId,
      businessId:         cfg.businessId,
      tokenPreview,
      tokenExpiresAt:     expiresAt?.toISOString() ?? null,
      tokenExpiringSoon,
      lastHealthCheckAt:  cfg.lastHealthCheckAt?.toISOString() ?? null,
      lastError:          cfg.lastError,
      qualityRating:      cfg.qualityRating,
      messagingLimit:     cfg.messagingLimit,
      metaCrmEnabled:     cfg.metaCrmEnabled,
      coexistence:        cfg.coexistence,
    };
  },

  async setHealth(
    restaurantId: string,
    patch: { connectionStatus?: string; lastError?: string | null; qualityRating?: string | null; messagingLimit?: string | null },
  ): Promise<void> {
    await prisma.metaWhatsAppConfig.updateMany({
      where: { restaurantId },
      data:  { ...patch, lastHealthCheckAt: new Date() },
    });
  },

  async disconnect(restaurantId: string): Promise<void> {
    await prisma.metaWhatsAppConfig.updateMany({
      where: { restaurantId },
      data:  { connectionStatus: "DISCONNECTED" },
    });
  },

  /**
   * Fully remove a restaurant's Meta config so the owner can start a clean
   * Embedded Signup from scratch (e.g. connected the wrong/test number and needs
   * to pick the real one). Deleting the row — rather than just flagging it
   * DISCONNECTED — also frees the unique phoneNumberId, so the same number can be
   * reconnected later without hitting the "já conectado em outra conta" guard.
   */
  async remove(restaurantId: string): Promise<void> {
    await prisma.metaWhatsAppConfig.deleteMany({ where: { restaurantId } });
  },
};

function resolve(cfg: {
  restaurantId: string; wabaId: string; phoneNumberId: string; displayPhoneNumber: string | null;
  businessId: string | null; accessToken: string; webhookVerifyToken: string; connectionStatus: string;
  coexistence?: boolean;
}): MetaConfigResolved {
  return {
    restaurantId:       cfg.restaurantId,
    wabaId:             cfg.wabaId,
    phoneNumberId:      cfg.phoneNumberId,
    displayPhoneNumber: cfg.displayPhoneNumber,
    businessId:         cfg.businessId,
    accessToken:        decrypt(cfg.accessToken),
    webhookVerifyToken: decrypt(cfg.webhookVerifyToken),
    connectionStatus:   cfg.connectionStatus,
    coexistence:        cfg.coexistence ?? false,
  };
}
