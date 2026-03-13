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
  baseUrl: string;       // decrypted
  apiKey: string;        // decrypted
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
   */
  async getInstanceStatus(config: EvolutionConfigSnapshot): Promise<InstanceStatus> {
    return request<InstanceStatus>(
      config,
      "GET",
      `/instance/connectionState/${config.instanceName}`
    );
  },
};
