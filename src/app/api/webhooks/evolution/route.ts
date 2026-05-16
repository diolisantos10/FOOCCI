/**
 * POST /api/webhooks/evolution
 *
 * Single public endpoint that receives all Evolution API webhook events.
 * This route is intentionally NOT authenticated (no JWT required) — it is
 * protected instead by HMAC-SHA256 signature verification on the request body.
 *
 * Evolution sends:
 *   Header: x-evolution-webhook-secret (plain token) or can use HMAC.
 *   We verify against the per-restaurant webhookSecret stored encrypted in DB.
 *
 * Response: always 200 OK within ~3s (Evolution retries on non-200).
 * Processing is synchronous in Phase 3; Phase 4 can move to a queue.
 */

import { NextRequest, NextResponse } from "next/server";
import { WebhookParserService } from "@/services/evolution/WebhookParserService";
import { WebhookProcessorService } from "@/services/evolution/WebhookProcessorService";
import { EvolutionConfigService } from "@/services/evolution/EvolutionConfigService";
import { prisma } from "@/lib/prisma";
import { createHmac, timingSafeEqual } from "crypto";

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: unknown;
  let rawBody: string;

  try {
    rawBody = await req.text();
    body = JSON.parse(rawBody);
  } catch {
    // Always return 200 to prevent Evolution from retrying malformed payloads.
    console.warn("[webhook/evolution] Invalid JSON body");
    return NextResponse.json({ received: true }, { status: 200 });
  }

  // Extract instanceName from the payload to look up per-restaurant webhookSecret
  const instanceName = extractInstanceName(body);
  if (!instanceName) {
    console.warn("[webhook/evolution] Missing instance name in payload");
    return NextResponse.json({ received: true }, { status: 200 });
  }

  // Verify webhook authenticity
  let configResult: Awaited<ReturnType<typeof EvolutionConfigService.findRestaurantByInstance>>;
  try {
    configResult = await EvolutionConfigService.findRestaurantByInstance(instanceName);
  } catch (err) {
    // decrypt() throws if ENCRYPTION_KEY is missing/wrong — log and absorb.
    console.error("[webhook/evolution] Config lookup failed (check ENCRYPTION_KEY):", err);
    return NextResponse.json({ received: true }, { status: 200 });
  }

  if (!configResult.ok) {
    // Unknown instance — respond 200 to avoid error loops but do not process.
    console.warn(`[webhook/evolution] Unknown instance: ${instanceName}`);
    return NextResponse.json({ received: true }, { status: 200 });
  }

  const { webhookSecret, isActive, restaurantId } = configResult.data;
  if (!verifySignature(req, rawBody, webhookSecret)) {
    console.warn(`[webhook/evolution] Signature mismatch for instance: ${instanceName}`);
    // Return 200 to not leak whether the instance exists.
    return NextResponse.json({ received: true }, { status: 200 });
  }

  // Config was inactive but received a valid (authenticated) webhook.
  if (!isActive) {
    console.log(`[webhook/evolution] Accepting event from inactive instance — will reactivate on connection.update open: ${instanceName}`);
  }

  // Extract sanitized log metadata (no content, no secrets)
  const logMeta = extractLogMeta(body);

  // Parse and process
  let accepted = false;
  let ignored  = false;
  let processingError: string | null = null;

  try {
    const event = WebhookParserService.parse(body);
    const result = await WebhookProcessorService.process(event);

    accepted = true;
    ignored  = !result.handled;

    if (!result.handled) {
      console.debug("[webhook/evolution] Event not handled:", result.detail);
    }
  } catch (err) {
    // Log but do not propagate — Evolution must receive 200 to stop retrying.
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error("[webhook/evolution] Processing error:", errMsg);
    processingError = errMsg.slice(0, 200);
    accepted = true; // reached processing stage — auth passed
  }

  // Async diagnostic log — fire and forget, never blocks the 200 response
  void logWebhookEvent({
    restaurantId,
    instanceName,
    eventName: logMeta.eventName,
    bodyKeys:  logMeta.bodyKeys,
    dataKeys:  logMeta.dataKeys,
    messageId: logMeta.messageId,
    remoteJidMasked: logMeta.remoteJidMasked,
    direction: logMeta.direction,
    accepted,
    ignored,
    error: processingError,
  });

  return NextResponse.json({ received: true }, { status: 200 });
}

// ─── helpers ─────────────────────────────────────────────────

function extractInstanceName(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const raw = body as Record<string, unknown>;
  return (raw.instance as string) ?? null;
}

/**
 * Verify the incoming request signature.
 *
 * Strategy 1 (preferred): HMAC-SHA256 of raw body, compared against
 *   the `x-evolution-hmac-sha256` header.
 * Strategy 2 (fallback): plain token comparison via `x-evolution-webhook-secret`.
 * Strategy 3 (additional): Authorization: Bearer <secret>
 *
 * Uses timing-safe comparison to prevent timing attacks.
 */
function verifySignature(req: NextRequest, rawBody: string, secret: string): boolean {
  // Strategy 1: HMAC
  const hmacHeader = req.headers.get("x-evolution-hmac-sha256");
  if (hmacHeader) {
    const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
    try {
      return timingSafeEqual(Buffer.from(hmacHeader, "hex"), Buffer.from(expected, "hex"));
    } catch {
      return false;
    }
  }

  // Strategy 2: plain token header (Evolution v2.x default)
  const tokenHeader = req.headers.get("x-evolution-webhook-secret");
  if (tokenHeader !== null) {
    try {
      return timingSafeEqual(
        Buffer.from(tokenHeader, "utf8"),
        Buffer.from(secret, "utf8")
      );
    } catch {
      return false;
    }
  }

  // Strategy 3: Authorization: Bearer <secret>
  const authHeader = req.headers.get("authorization") ?? "";
  if (authHeader.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    try {
      return timingSafeEqual(
        Buffer.from(token, "utf8"),
        Buffer.from(secret, "utf8")
      );
    } catch {
      return false;
    }
  }

  // No recognized auth header — reject
  return false;
}

interface LogMeta {
  eventName:       string;
  bodyKeys:        string[];
  dataKeys:        string[];
  messageId:       string | null;
  remoteJidMasked: string | null;
  direction:       string | null;
}

function extractLogMeta(body: unknown): LogMeta {
  const raw      = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const eventName = (raw.event as string | undefined) ?? "unknown";
  const bodyKeys  = Object.keys(raw);
  const data      = raw.data;
  const dataObj   = (data && typeof data === "object" && !Array.isArray(data))
    ? data as Record<string, unknown>
    : null;
  const dataKeys  = dataObj ? Object.keys(dataObj) : [];

  let messageId:       string | null = null;
  let remoteJidMasked: string | null = null;
  let direction:       string | null = null;

  if (dataObj) {
    const key = dataObj.key as Record<string, unknown> | undefined;
    if (key) {
      messageId = (key.id as string | undefined) ?? null;
      const fromMe = key.fromMe as boolean | undefined;
      direction = fromMe === true ? "OUTBOUND" : fromMe === false ? "INBOUND" : null;
      const jid = key.remoteJid as string | undefined;
      if (jid) remoteJidMasked = maskJid(jid);
    }
  }

  return { eventName, bodyKeys, dataKeys, messageId, remoteJidMasked, direction };
}

function maskJid(jid: string): string {
  const [number, domain] = jid.split("@");
  if (!number) return jid;
  const visible = number.slice(0, 4);
  const suffix  = number.length > 8 ? number.slice(-4) : "";
  const masked  = `${visible}${"*".repeat(Math.max(0, number.length - (visible.length + suffix.length)))}${suffix}`;
  return domain ? `${masked}@${domain}` : masked;
}

async function logWebhookEvent(params: {
  restaurantId:    string;
  instanceName:    string;
  eventName:       string;
  bodyKeys:        string[];
  dataKeys:        string[];
  messageId:       string | null;
  remoteJidMasked: string | null;
  direction:       string | null;
  accepted:        boolean;
  ignored:         boolean;
  error:           string | null;
}): Promise<void> {
  try {
    await prisma.evolutionWebhookEventLog.create({
      data: {
        restaurantId:    params.restaurantId,
        instanceName:    params.instanceName,
        eventName:       params.eventName,
        accepted:        params.accepted,
        ignored:         params.ignored,
        error:           params.error,
        bodyKeys:        params.bodyKeys,
        dataKeys:        params.dataKeys,
        messageId:       params.messageId,
        remoteJidMasked: params.remoteJidMasked,
        direction:       params.direction,
      },
    });

    // Keep only last 200 rows per restaurant to avoid unbounded growth
    const oldRows = await prisma.evolutionWebhookEventLog.findMany({
      where:   { restaurantId: params.restaurantId },
      orderBy: { createdAt: "desc" },
      skip:    200,
      select:  { id: true },
    });
    if (oldRows.length > 0) {
      await prisma.evolutionWebhookEventLog.deleteMany({
        where: { id: { in: oldRows.map((r) => r.id) } },
      });
    }
  } catch {
    // Never let logging failures affect webhook processing
  }
}
