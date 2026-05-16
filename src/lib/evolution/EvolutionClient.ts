/**
 * Evolution API HTTP client.
 *
 * Stateless — receives decrypted config at call time.
 * All public methods throw `EvolutionApiError` on non-2xx responses
 * so callers can handle them uniformly.
 *
 * Note: No text content is generated here. All message content is
 * supplied by callers (human agents or, in Phase 4, the AI layer with
 * per-restaurant brand configuration). This client is intentionally
 * brand-agnostic.
 */

import { extractEvolutionQr, isCountOnlyResponse } from "./extractQr";

export interface EvolutionConfigSnapshot {
  instanceName: string;
  baseUrl: string;         // decrypted
  apiKey: string;          // decrypted
  webhookSecret?: string;  // decrypted — only provided when needed
}

export class EvolutionApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: unknown,
    message: string
  ) {
    super(message);
    this.name = "EvolutionApiError";
  }
}

export type EvolutionMessageType = "text" | "image" | "audio" | "document";

export interface SendTextResult {
  key: {
    remoteJid: string;
    id: string;         // Evolution / WhatsApp message ID
    fromMe: boolean;
  };
  status: string;
}

export interface SendMediaResult extends SendTextResult {
  mediaUrl: string;
}

export interface InstanceStatus {
  state: "open" | "close" | "connecting";
  instance: string;
}

export interface InstanceQRCode {
  base64:      string | null;
  code:        string | null;
  pairingCode: string | null;  // 8-digit pairing code (alternative to QR image)
  foundIn:     string | null;  // field path where base64 was found
  instanceState?: "open" | "close" | "connecting";
  countOnly?:  boolean;        // true when Evolution returns { count: N } — QR still generating
}

export interface CreateInstanceInput {
  instanceName: string;
  integration?: string;
  webhookUrl?: string;
  webhookByEvents?: boolean;
  webhookEvents?: string[];
  webhookSecret?: string;
}

// ─── helpers ─────────────────────────────────────────────────

function buildUrl(base: string, path: string): string {
  return `${base.replace(/\/$/, "")}${path}`;
}

async function request<T>(
  config: EvolutionConfigSnapshot,
  method: string,
  path: string,
  body?: unknown
): Promise<T> {
  const url = buildUrl(config.baseUrl, path);

  const res = await fetch(url, {
    method,
    headers: {
      "Content-Type": "application/json",
      apikey: config.apiKey,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    let responseBody: unknown;
    try {
      responseBody = await res.json();
    } catch {
      responseBody = await res.text();
    }
    throw new EvolutionApiError(
      res.status,
      responseBody,
      `Evolution API ${method} ${path} → HTTP ${res.status}`
    );
  }

  return res.json() as Promise<T>;
}

// ─── public API ──────────────────────────────────────────────

export const EvolutionClient = {
  /**
   * Send a plain-text WhatsApp message.
   * `to` must be E.164 without the `+` prefix (e.g. "5511999990000").
   */
  async sendTextMessage(
    config: EvolutionConfigSnapshot,
    to: string,
    text: string
  ): Promise<SendTextResult> {
    return request<SendTextResult>(
      config,
      "POST",
      `/message/sendText/${config.instanceName}`,
      { number: to, text }
    );
  },

  /**
   * Send a media message (image, audio, document).
   * `mediaUrl` must be a publicly accessible URL.
   */
  async sendMediaMessage(
    config: EvolutionConfigSnapshot,
    to: string,
    mediaType: "image" | "audio" | "document",
    mediaUrl: string,
    caption?: string
  ): Promise<SendMediaResult> {
    return request<SendMediaResult>(
      config,
      "POST",
      `/message/sendMedia/${config.instanceName}`,
      { number: to, mediatype: mediaType, media: mediaUrl, caption: caption ?? "" }
    );
  },

  /**
   * Fetch the current connection state of the Evolution instance.
   *
   * Evolution v2 returns: { instance: { instanceName, state } }
   * Evolution v1 returns: { state, instance }
   * We normalise both.
   */
  async getInstanceStatus(config: EvolutionConfigSnapshot): Promise<InstanceStatus> {
    const raw = await request<{
      state?:    string;
      instance?: { instanceName?: string; state?: string } | string;
    }>(config, "GET", `/instance/connectionState/${config.instanceName}`);

    // v2: { instance: { state: "open" } }   v1: { state: "open", instance: "name" }
    const nested = typeof raw.instance === "object" ? raw.instance : null;
    const state  = (nested?.state ?? raw.state ?? "close") as InstanceStatus["state"];
    return { state, instance: config.instanceName };
  },

  /**
   * List all instances on the Evolution server.
   */
  async fetchInstances(config: EvolutionConfigSnapshot): Promise<unknown[]> {
    const raw = await request<unknown[] | { instances?: unknown[] }>(
      config, "GET", "/instance/fetchInstances"
    );
    return Array.isArray(raw) ? raw : (raw as { instances?: unknown[] }).instances ?? [];
  },

  /**
   * Fetch the QR code for the instance.
   *
   * Tries GET /instance/connect first (primary endpoint), then falls back to
   * GET /instance/qrcode and GET /qrcode/base64 for Evolution versions where
   * the connect endpoint returns only { count: N } while generating a new QR.
   */
  async getQRCode(config: EvolutionConfigSnapshot): Promise<InstanceQRCode> {
    const raw = await request<Record<string, unknown>>(
      config, "GET", `/instance/connect/${config.instanceName}`
    );

    const nested = typeof raw.instance === "object" && raw.instance !== null
      ? (raw.instance as Record<string, unknown>)
      : null;
    const instanceState = (nested?.["state"]) as InstanceQRCode["instanceState"];

    const extracted = extractEvolutionQr(raw);

    if (extracted.base64 || extracted.pairingCode) {
      return { base64: extracted.base64, code: extracted.code, pairingCode: extracted.pairingCode, foundIn: extracted.foundIn, instanceState };
    }

    // { count: N } — Evolution is generating a new QR; flag it explicitly
    if (isCountOnlyResponse(raw)) {
      return { base64: null, code: null, pairingCode: null, foundIn: null, instanceState, countOnly: true };
    }

    // Fallback: try alternative endpoints used by some Evolution versions
    for (const altPath of [
      `/instance/qrcode/${config.instanceName}`,
      `/qrcode/base64/${config.instanceName}`,
    ]) {
      try {
        const altRaw = await request<Record<string, unknown>>(config, "GET", altPath);
        const altEx  = extractEvolutionQr(altRaw);
        if (altEx.base64 || altEx.pairingCode) {
          return { base64: altEx.base64, code: altEx.code, pairingCode: altEx.pairingCode, foundIn: `${altPath}:${altEx.foundIn}`, instanceState };
        }
      } catch {
        // endpoint not supported by this Evolution version — continue
      }
    }

    return { base64: null, code: null, pairingCode: null, foundIn: null, instanceState };
  },

  /**
   * Restart the Evolution instance — moves it from "close" back to "connecting"
   * so a new QR code is generated.
   */
  async restartInstance(config: EvolutionConfigSnapshot): Promise<void> {
    await request<unknown>(config, "PUT", `/instance/restart/${config.instanceName}`);
  },

  /**
   * Logout the WhatsApp account from the instance — disconnects the linked
   * phone number and moves the instance to "close" state.
   */
  async logoutInstance(config: EvolutionConfigSnapshot): Promise<void> {
    await request<unknown>(config, "DELETE", `/instance/logout/${config.instanceName}`);
  },

  /**
   * Permanently delete an Evolution instance and all its data.
   */
  async deleteInstance(config: EvolutionConfigSnapshot): Promise<unknown> {
    return request<unknown>(config, "DELETE", `/instance/delete/${config.instanceName}`);
  },

  /**
   * Configure (or update) the webhook on an existing instance.
   * Does NOT touch the WhatsApp session — only updates webhook routing.
   *
   * Tries the nested { webhook: {...} } shape (Evolution v2.x standard) first.
   * Falls back to flat body if the server returns HTTP 400.
   */
  async setWebhook(
    config: EvolutionConfigSnapshot,
    webhookUrl: string,
    events: string[],
    secret?: string
  ): Promise<unknown> {
    const fields: Record<string, unknown> = {
      enabled:         true,
      url:             webhookUrl,
      webhookByEvents: true,
      webhookBase64:   false,
      events,
    };
    if (secret) fields.secret = secret;

    try {
      return await request<unknown>(
        config, "POST", `/webhook/set/${config.instanceName}`, { webhook: fields }
      );
    } catch (err) {
      if (err instanceof EvolutionApiError && err.status === 400) {
        return await request<unknown>(
          config, "POST", `/webhook/set/${config.instanceName}`, fields
        );
      }
      throw err;
    }
  },

  /**
   * Create a new Evolution instance with webhook configuration.
   */
  async createInstance(
    config: EvolutionConfigSnapshot,
    input: CreateInstanceInput
  ): Promise<unknown> {
    const body: Record<string, unknown> = {
      instanceName: input.instanceName,
      integration:  input.integration ?? "WHATSAPP-BAILEYS",
      qrcode:       true,   // ensure QR is generated on connect
    };

    if (input.webhookUrl) {
      body.webhook = {
        url:        input.webhookUrl,
        byEvents:   input.webhookByEvents ?? true,
        base64:     false,
        events:     input.webhookEvents ?? ["MESSAGES_UPSERT", "MESSAGES_UPDATE", "CONNECTION_UPDATE"],
      };
      if (input.webhookSecret) {
        body.webhook = { ...body.webhook as object, secret: input.webhookSecret };
      }
    }

    return request<unknown>(config, "POST", "/instance/create", body);
  },
};
