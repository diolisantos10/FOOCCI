/**
 * InstagramSendClient — manual outbound text via the Meta Graph API.
 *
 * Hard safety: NEVER performs a real network send when (a) running under tests
 * (NODE_ENV=test / VITEST), (b) no Page Access Token is provided, or (c) the
 * caller asks for dryRun. In those cases it returns a clear dry-run result and
 * makes no HTTP call. Errors from Meta are caught and returned, never thrown.
 *
 * v1 sends TEXT only. The token is passed in already-decrypted by the channel
 * service and is never logged.
 */

import type { InstagramSendResult } from "./types";

/** Facebook-Login (Page access token) connections send via the Facebook Graph. */
export const GRAPH_FACEBOOK_BASE = "https://graph.facebook.com/v21.0";
/** Instagram-Login (IG user access token) connections send via the Instagram Graph. */
export const GRAPH_INSTAGRAM_BASE = "https://graph.instagram.com/v21.0";

function isTestEnv(): boolean {
  return process.env.NODE_ENV === "test" || process.env.VITEST === "true" || !!process.env.VITEST_WORKER_ID;
}

export interface SendTextInput {
  recipientId: string; // IGSID
  text: string;
  pageAccessToken: string | null;
  /** Graph base — Instagram-Login connections pass GRAPH_INSTAGRAM_BASE. Defaults to Facebook. */
  graphBase?: string;
  /** Force a dry-run (no HTTP) regardless of env. */
  dryRun?: boolean;
}

export async function sendInstagramText(input: SendTextInput): Promise<InstagramSendResult> {
  const dryRun = input.dryRun === true || isTestEnv();
  const base = input.graphBase ?? GRAPH_FACEBOOK_BASE;

  if (!input.pageAccessToken) {
    return { ok: false, sent: false, dryRun: true, externalMessageId: null,
      error: null, reason: "Instagram não configurado para envio (token ausente)." };
  }
  if (dryRun) {
    return { ok: true, sent: false, dryRun: true, externalMessageId: null,
      error: null, reason: "dry-run — nenhum envio real ao Instagram." };
  }

  try {
    const res = await fetch(`${base}/me/messages?access_token=${encodeURIComponent(input.pageAccessToken)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ recipient: { id: input.recipientId }, message: { text: input.text } }),
    });
    const body = (await res.json().catch(() => ({}))) as { message_id?: string; error?: { message?: string } };
    if (!res.ok || body.error) {
      return { ok: false, sent: false, dryRun: false, externalMessageId: null,
        error: (body.error?.message ?? `HTTP ${res.status}`).slice(0, 300),
        reason: "Falha ao enviar pelo Instagram." };
    }
    return { ok: true, sent: true, dryRun: false, externalMessageId: body.message_id ?? null, error: null, reason: null };
  } catch (err) {
    const message = err instanceof Error ? err.message.slice(0, 300) : "erro de rede";
    return { ok: false, sent: false, dryRun: false, externalMessageId: null, error: message,
      reason: "Falha de rede ao enviar pelo Instagram." };
  }
}

export interface ReplyCommentInput {
  commentId: string; // the IG comment id being replied to
  text: string;
  pageAccessToken: string | null;
  /** Graph base — Instagram-Login connections pass GRAPH_INSTAGRAM_BASE. Defaults to Facebook. */
  graphBase?: string;
  /** Force a dry-run (no HTTP) regardless of env. */
  dryRun?: boolean;
}

/**
 * Posts a PUBLIC reply under an Instagram comment (visible on the post), via
 * `POST /{ig-comment-id}/replies`. Same hard safety as sendInstagramText: never
 * touches the network under tests, without a token, or on dryRun. The new reply
 * comment id (when Meta returns it) is surfaced as externalMessageId.
 */
export async function replyToInstagramComment(input: ReplyCommentInput): Promise<InstagramSendResult> {
  const dryRun = input.dryRun === true || isTestEnv();
  const base = input.graphBase ?? GRAPH_FACEBOOK_BASE;

  if (!input.pageAccessToken) {
    return { ok: false, sent: false, dryRun: true, externalMessageId: null,
      error: null, reason: "Instagram não configurado para envio (token ausente)." };
  }
  if (dryRun) {
    return { ok: true, sent: false, dryRun: true, externalMessageId: null,
      error: null, reason: "dry-run — nenhuma resposta real publicada no Instagram." };
  }

  try {
    const res = await fetch(`${base}/${encodeURIComponent(input.commentId)}/replies?access_token=${encodeURIComponent(input.pageAccessToken)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: input.text }),
    });
    const body = (await res.json().catch(() => ({}))) as { id?: string; error?: { message?: string } };
    if (!res.ok || body.error) {
      return { ok: false, sent: false, dryRun: false, externalMessageId: null,
        error: (body.error?.message ?? `HTTP ${res.status}`).slice(0, 300),
        reason: "Falha ao responder o comentário no Instagram." };
    }
    return { ok: true, sent: true, dryRun: false, externalMessageId: body.id ?? null, error: null, reason: null };
  } catch (err) {
    const message = err instanceof Error ? err.message.slice(0, 300) : "erro de rede";
    return { ok: false, sent: false, dryRun: false, externalMessageId: null, error: message,
      reason: "Falha de rede ao responder o comentário no Instagram." };
  }
}
