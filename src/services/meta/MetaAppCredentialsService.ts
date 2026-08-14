/**
 * App-level Meta credentials — read/write for the ONE Foocci app inside Meta.
 *
 * Why this exists: `Foocci Whats` serves WhatsApp AND Instagram at the same time, and its
 * credentials lived only as Railway env vars. Changing them meant a deploy plus someone
 * with Railway access. This service moves them into the database, encrypted, so they can
 * be managed from the admin screen.
 *
 * THE RESOLUTION ORDER IS DELIBERATE: database first, env var second.
 *   - a saved value overrides the env var
 *   - an empty/missing row changes nothing, so deploying this cannot break production
 *
 * Secrets are AES-256-GCM encrypted at rest and NEVER returned in plaintext by any API —
 * `getMasked()` is what the screen gets. Only server-side callers use `getResolved()`.
 */

import { prisma } from "@/lib/prisma";
import { encrypt, decrypt, maskSecret } from "@/lib/crypto";

const SINGLETON_ID = "singleton";

/** Plaintext credentials, server-side only. Never serialize this to a response. */
export interface ResolvedMetaAppCredentials {
  appId?:               string;
  appSecret?:           string;
  configId?:            string;
  coexistenceConfigId?: string;
  webhookVerifyToken?:  string;
  graphVersion?:        string;
  igAppId?:             string;
  igAppSecret?:         string;
  igWebhookVerifyToken?: string;
  systemUserToken?:     string;
}

/** Which source a given field actually came from — the screen shows this. */
export type CredentialSource = "db" | "env" | "missing";

/** Safe view for the admin screen: masked secrets + where each value came from. */
export interface MaskedMetaAppCredentials {
  appId:               string | null;
  appSecretPreview:    string | null;
  configId:            string | null;
  coexistenceConfigId: string | null;
  webhookVerifyTokenPreview: string | null;
  graphVersion:        string | null;
  igAppId:             string | null;
  igAppSecretPreview:  string | null;
  igWebhookVerifyTokenPreview: string | null;
  systemUserTokenPreview: string | null;
  sources: Record<string, CredentialSource>;
  lastTestAt:    string | null;
  lastTestOk:    boolean | null;
  lastTestError: string | null;
  updatedAt:     string | null;
  updatedBy:     string | null;
}

/** Fields the admin screen may write. All optional — only sent fields are changed. */
export interface SaveMetaAppCredentialsInput {
  appId?:               string;
  appSecret?:           string;
  configId?:            string;
  coexistenceConfigId?: string;
  webhookVerifyToken?:  string;
  graphVersion?:        string;
  igAppId?:             string;
  igAppSecret?:         string;
  igWebhookVerifyToken?: string;
  systemUserToken?:     string;
  updatedBy?:           string;
}

/**
 * Decrypts a stored value, returning undefined if the key is wrong or the value is
 * corrupt. A bad row must degrade to "fall back to env", never throw and take down
 * every caller — losing the WhatsApp send path because one secret failed to decrypt
 * would be a protection more destructive than the problem it prevents.
 */
function safeDecrypt(stored: string | null | undefined): string | undefined {
  if (!stored) return undefined;
  try {
    return decrypt(stored);
  } catch {
    console.error("[MetaAppCredentials] decrypt failed — falling back to env for this field");
    return undefined;
  }
}

/** Encrypts, or returns undefined for blank input so "leave unchanged" stays possible. */
function encryptIfPresent(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  return encrypt(trimmed);
}

function plainIfPresent(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

export const MetaAppCredentialsService = {
  /**
   * The resolved credentials actually in force: database value if set, otherwise the
   * env var. This is what every server-side Meta caller should read.
   */
  async getResolved(): Promise<ResolvedMetaAppCredentials> {
    let row = null;
    try {
      row = await prisma.metaAppCredentials.findUnique({ where: { id: SINGLETON_ID } });
    } catch (err) {
      // Table may not exist yet (migration not applied). Env fallback keeps prod alive.
      console.error("[MetaAppCredentials] read failed — using env only", err);
    }

    const env = process.env;
    return {
      appId:               row?.appId               ?? env.META_APP_ID ?? env.FACEBOOK_APP_ID,
      appSecret:           safeDecrypt(row?.appSecret) ?? env.META_APP_SECRET ?? env.FACEBOOK_APP_SECRET,
      configId:            row?.configId            ?? env.META_CONFIG_ID,
      // ⚠️ SEM FALLBACK PARA O `configId` COMUM, e isto é deliberado.
      // A coexistência só funciona com uma configuração de Cadastro Incorporado criada
      // com a feature "WhatsApp Business App Onboarding". Cair na configuração padrão
      // faz a tela exibir um id que NÃO serve para coexistência — e alguém lendo
      // "configurado" abriria o cadastro normal, que MIGRA o número e o tira do
      // celular do restaurante. Ausente é ausente: a tela precisa dizer "faltando".
      coexistenceConfigId: row?.coexistenceConfigId ?? env.META_COEXISTENCE_CONFIG_ID,
      webhookVerifyToken:  safeDecrypt(row?.webhookVerifyToken) ?? env.META_WEBHOOK_VERIFY_TOKEN,
      graphVersion:        row?.graphVersion        ?? env.META_GRAPH_VERSION,
      igAppId:             row?.igAppId             ?? env.INSTAGRAM_APP_ID,
      igAppSecret:         safeDecrypt(row?.igAppSecret) ?? env.INSTAGRAM_APP_SECRET,
      igWebhookVerifyToken: safeDecrypt(row?.igWebhookVerifyToken) ?? env.INSTAGRAM_WEBHOOK_VERIFY_TOKEN,
      systemUserToken:     safeDecrypt(row?.systemUserToken),
    };
  },

  /**
   * What the admin screen receives. Secrets appear only as `abcd...wxyz` previews, and
   * every field carries where it came from — so "it's configured" can never be inferred
   * from a green badge alone.
   */
  async getMasked(): Promise<MaskedMetaAppCredentials> {
    let row = null;
    try {
      row = await prisma.metaAppCredentials.findUnique({ where: { id: SINGLETON_ID } });
    } catch (err) {
      console.error("[MetaAppCredentials] read failed — using env only", err);
    }

    const env = process.env;

    const source = (dbValue: unknown, envValue: unknown): CredentialSource =>
      dbValue ? "db" : envValue ? "env" : "missing";

    const resolved = await this.getResolved();

    return {
      appId:               resolved.appId ?? null,
      appSecretPreview:    resolved.appSecret ? maskSecret(resolved.appSecret) : null,
      configId:            resolved.configId ?? null,
      coexistenceConfigId: resolved.coexistenceConfigId ?? null,
      webhookVerifyTokenPreview: resolved.webhookVerifyToken ? maskSecret(resolved.webhookVerifyToken) : null,
      graphVersion:        resolved.graphVersion ?? null,
      igAppId:             resolved.igAppId ?? null,
      igAppSecretPreview:  resolved.igAppSecret ? maskSecret(resolved.igAppSecret) : null,
      igWebhookVerifyTokenPreview: resolved.igWebhookVerifyToken ? maskSecret(resolved.igWebhookVerifyToken) : null,
      systemUserTokenPreview: resolved.systemUserToken ? maskSecret(resolved.systemUserToken) : null,
      sources: {
        appId:               source(row?.appId, env.META_APP_ID ?? env.FACEBOOK_APP_ID),
        appSecret:           source(row?.appSecret, env.META_APP_SECRET ?? env.FACEBOOK_APP_SECRET),
        configId:            source(row?.configId, env.META_CONFIG_ID),
        coexistenceConfigId: source(row?.coexistenceConfigId, env.META_COEXISTENCE_CONFIG_ID),
        webhookVerifyToken:  source(row?.webhookVerifyToken, env.META_WEBHOOK_VERIFY_TOKEN),
        graphVersion:        source(row?.graphVersion, env.META_GRAPH_VERSION),
        igAppId:             source(row?.igAppId, env.INSTAGRAM_APP_ID),
        igAppSecret:         source(row?.igAppSecret, env.INSTAGRAM_APP_SECRET),
        igWebhookVerifyToken: source(row?.igWebhookVerifyToken, env.INSTAGRAM_WEBHOOK_VERIFY_TOKEN),
        systemUserToken:     source(row?.systemUserToken, undefined),
      },
      lastTestAt:    row?.lastTestAt?.toISOString() ?? null,
      lastTestOk:    row?.lastTestOk ?? null,
      lastTestError: row?.lastTestError ?? null,
      updatedAt:     row?.updatedAt?.toISOString() ?? null,
      updatedBy:     row?.updatedBy ?? null,
    };
  },

  /**
   * Saves the fields that were sent. A field left blank is LEFT UNCHANGED rather than
   * cleared — otherwise loading a screen with masked secrets and pressing Save would
   * wipe every credential the operator could not see.
   *
   * Use `clearFields` to intentionally remove a value (falls back to env again).
   */
  async save(input: SaveMetaAppCredentialsInput, clearFields: string[] = []): Promise<void> {
    const data: Record<string, string | null> = {};

    const setPlain = (key: keyof SaveMetaAppCredentialsInput) => {
      const v = plainIfPresent(input[key] as string | undefined);
      if (v !== undefined) data[key] = v;
    };
    const setSecret = (key: keyof SaveMetaAppCredentialsInput) => {
      const v = encryptIfPresent(input[key] as string | undefined);
      if (v !== undefined) data[key] = v;
    };

    setPlain("appId");
    setPlain("configId");
    setPlain("coexistenceConfigId");
    setPlain("graphVersion");
    setPlain("igAppId");

    setSecret("appSecret");
    setSecret("webhookVerifyToken");
    setSecret("igAppSecret");
    setSecret("igWebhookVerifyToken");
    setSecret("systemUserToken");

    for (const field of clearFields) data[field] = null;

    data.updatedBy = input.updatedBy ?? "admin";

    await prisma.metaAppCredentials.upsert({
      where:  { id: SINGLETON_ID },
      create: { id: SINGLETON_ID, ...data },
      update: data,
    });
  },

  /** Records the outcome of a connection test so the screen shows real, dated state. */
  async recordTest(okResult: boolean, error?: string): Promise<void> {
    await prisma.metaAppCredentials.upsert({
      where:  { id: SINGLETON_ID },
      create: { id: SINGLETON_ID, lastTestAt: new Date(), lastTestOk: okResult, lastTestError: error ?? null },
      update: { lastTestAt: new Date(), lastTestOk: okResult, lastTestError: error ?? null },
    });
  },
};
