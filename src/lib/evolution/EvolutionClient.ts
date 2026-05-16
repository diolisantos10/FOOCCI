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
  base64: string | null;  // data:image/png;base64,... or null if already connected
  code:   string | null;
  instanceState?: "open" | "close" | "connecting";
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
   * Evolution v2 returns a FLAT response when QR is ready:
   *   { base64: "data:image/png;base64,...", code: "2@...", pairingCode: null, count: 1 }
   * When connected it returns:
   *   { instance: { instanceName, state: "open" } }
   *
   * Evolution v1 used a nested qrcode field — we support both.
   */
  async getQRCode(config: EvolutionConfigSnapshot): Promise<InstanceQRCode> {
    const raw = await request<{
      // Evolution v2 — flat
      base64?:      string;
      code?:        string;
      pairingCode?: string | null;
      count?:       number;
      // Evolution v1 — nested
      qrcode?: { base64?: string; code?: string };
      // Connected state
      instance?: { state?: string; instanceName?: string } | string;
    }>(config, "GET", `/instance/connect/${config.instanceName}`);

    const nested       = typeof raw.instance === "object" ? raw.instance : null;
    const instanceState = (nested?.state) as InstanceQRCode["instanceState"];

    return {
      base64: raw.base64 ?? raw.qrcode?.base64 ?? null,
      code:   raw.code   ?? raw.qrcode?.code   ?? null,
      instanceState,
    };
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
