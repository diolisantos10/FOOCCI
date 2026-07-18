/**
 * metaMedia — server-side download of inbound WhatsApp media from the Meta Cloud API.
 *
 * Meta stores inbound media by ID. Fetching the bytes is a two-step, token-authenticated
 * flow the browser can't do (the media URL requires the app's access token):
 *   1. GET /{media-id}            → { url, mime_type, ... }
 *   2. GET {url} (Bearer token)   → the raw bytes
 *
 * The access token never reaches the client — only the decrypted bytes do (streamed by
 * the authenticated /api/chat/messages/[id]/attachment proxy).
 */

import { MetaConfigService } from "./MetaConfigService";
import { metaGraphUrl } from "./metaFlag";

export interface MetaMediaResult {
  ok:        boolean;
  buffer?:   Buffer;
  mimeType?: string | null;
  error?:    string;
}

/** Downloads an inbound media object by its Meta media id for the given restaurant. */
export async function downloadMetaMedia(restaurantId: string, mediaId: string): Promise<MetaMediaResult> {
  const cfg = await MetaConfigService.getResolved(restaurantId);
  if (!cfg) return { ok: false, error: "Meta não conectado" };

  try {
    // Step 1: resolve the temporary, token-scoped download URL for this media id.
    const metaRes = await fetch(metaGraphUrl(mediaId), {
      headers: { Authorization: `Bearer ${cfg.accessToken}` },
    });
    if (!metaRes.ok) return { ok: false, error: `media lookup ${metaRes.status}` };
    const meta = (await metaRes.json().catch(() => ({}))) as { url?: string; mime_type?: string };
    if (!meta.url) return { ok: false, error: "media url missing" };

    // Step 2: fetch the bytes (the URL host is a Meta/FB CDN, still token-authenticated).
    const binRes = await fetch(meta.url, { headers: { Authorization: `Bearer ${cfg.accessToken}` } });
    if (!binRes.ok) return { ok: false, error: `media download ${binRes.status}` };
    const arrayBuf = await binRes.arrayBuffer();

    return {
      ok:       true,
      buffer:   Buffer.from(arrayBuf),
      mimeType: meta.mime_type ?? binRes.headers.get("content-type"),
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "download failed" };
  }
}
