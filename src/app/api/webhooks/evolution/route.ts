/**
 * POST /api/webhooks/evolution
 *
 * Single public endpoint that receives all Evolution API webhook events.
 * NOT authenticated via JWT — protected by HMAC-SHA256 or plain-token
 * signature verification on the request body.
 *
 * DIAGNOSTIC CONTRACT: every incoming request is logged to
 * EvolutionWebhookEventLog BEFORE any rejection, even if auth fails.
 * This proves whether Evolution is sending webhooks at all.
 *
 * Response: always 200 OK (Evolution retries on non-200).
 */

import { NextRequest, NextResponse } from "next/server";
import { WebhookParserService } from "@/services/evolution/WebhookParserService";
import { WebhookProcessorService } from "@/services/evolution/WebhookProcessorService";
import { EvolutionConfigService } from "@/services/evolution/EvolutionConfigService";
import { prisma } from "@/lib/prisma";
import { createHmac, timingSafeEqual } from "crypto";

export async function POST(req: NextRequest): Promise<NextResponse> {
  let rawBody: string;
  let body: unknown;

  try {
    rawBody = await req.text();
    body = JSON.parse(rawBody);
  } catch {
    console.warn("[webhook/evolution] Invalid JSON body");
    return NextResponse.json({ received: true }, { status: 200 });
  }

  // Extract metadata immediately — used for logging at every exit point
  const instanceName = extractInstanceName(body);
  const logMeta      = extractLogMeta(body);

  if (!instanceName) {
    console.warn("[webhook/evolution] Missing instance name in payload");
    void persistLog(null, "unknown", logMeta, false, false, "missing_instance_name");
    return NextResponse.json({ received: true }, { status: 200 });
  }

  // Config lookup
  let restaurantId: string | null = null;
  let webhookSecret = "";
  let isActive = false;

  try {
    const configResult = await EvolutionConfigService.findRestaurantByInstance(instanceName);
    if (!configResult.ok) {
      console.warn(`[webhook/evolution] Unknown instance: ${instanceName}`);
      void persistLog(null, instanceName, logMeta, false, false, "unknown_instance");
      return NextResponse.json({ received: true }, { status: 200 });
    }
    restaurantId  = configResult.data.restaurantId;
    webhookSecret = configResult.data.webhookSecret;
    isActive      = configResult.data.isActive;
  } catch (err) {
    console.error("[webhook/evolution] Config lookup failed (check ENCRYPTION_KEY):", err);
    void persistLog(null, instanceName, logMeta, false, false, "config_lookup_error");
    return NextResponse.json({ received: true }, { status: 200 });
  }

  // Signature verification
  if (!verifySignature(req, rawBody, webhookSecret)) {
    console.warn(`[webhook/evolution] Signature mismatch for instance: ${instanceName}`);
    void persistLog(restaurantId, instanceName, logMeta, false, false, "signature_mismatch");
    return NextResponse.json({ received: true }, { status: 200 });
  }

  if (!isActive) {
    console.log(`[webhook/evolution] Inactive instance, accepting: ${instanceName}`);
  }

  // Parse and process
  let accepted = false;
  let ignored  = false;
  let processingError: string | null = null;

  try {
    const event  = WebhookParserService.parse(body);
    const result = await WebhookProcessorService.process(event);
    accepted = true;
    ignored  = !result.handled;
    if (!result.handled) {
      console.debug("[webhook/evolution] Event not handled:", result.detail);
    }
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error("[webhook/evolution] Processing error:", errMsg);
    processingError = errMsg.slice(0, 200);
    accepted = true;
  }

  void persistLog(restaurantId, instanceName, logMeta, accepted, ignored, processingError);

  return NextResponse.json({ received: true }, { status: 200 });
}

// ─── helpers ─────────────────────────────────────────────────

/**
 * Extract the instance name from the payload.
 *
 * Evolution v2.3.7 with webhookByEvents=false sends:
 *   { event: "messages.upsert", instance: "sushicazza", data: {...} }
 *
 * Some configurations may nest: { instance: { instanceName: "..." } }
 * or use a top-level instanceName field.
 */
function extractInstanceName(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const raw = body as Record<string, unknown>;

  if (typeof raw.instance === "string" && raw.instance) return raw.instance;

  if (raw.instance && typeof raw.instance === "object") {
    const inst = raw.instance as Record<string, unknown>;
    if (typeof inst.instanceName === "string" && inst.instanceName) return inst.instanceName;
  }

  if (typeof raw.instanceName === "string" && raw.instanceName) return raw.instanceName;

  return null;
}

/**
 * Verify the incoming request signature.
 *
 * Strategy 1: HMAC-SHA256 via x-evolution-hmac-sha256 header.
 * Strategy 2: plain token via x-evolution-webhook-secret header.
 * Strategy 3: plain token via x-evolution-secret header (alternate name).
 * Strategy 4: Authorization: Bearer <secret>.
 *
 * Timing-safe comparison to prevent timing attacks.
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

  // Strategy 2: plain token (Evolution v2.x default header name)
  const tokenHeader = req.headers.get("x-evolution-webhook-secret");
  if (tokenHeader !== null) {
    try {
      return timingSafeEqual(Buffer.from(tokenHeader, "utf8"), Buffer.from(secret, "utf8"));
    } catch {
      return false;
    }
  }

  // Strategy 3: alternate plain-token header used by some Evolution builds
  const altHeader = req.headers.get("x-evolution-secret");
  if (altHeader !== null) {
    try {
      return timingSafeEqual(Buffer.from(altHeader, "utf8"), Buffer.from(secret, "utf8"));
    } catch {
      return false;
    }
  }

  // Strategy 4: Authorization: Bearer <secret>
  const authHeader = req.headers.get("authorization") ?? "";
  if (authHeader.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    try {
      return timingSafeEqual(Buffer.from(token, "utf8"), Buffer.from(secret, "utf8"));
    } catch {
      return false;
    }
  }

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
  const raw       = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
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

function persistLog(
  restaurantId:    string | null,
  instanceName:    string,
  logMeta:         LogMeta,
  accepted:        boolean,
  ignored:         boolean,
  error:           string | null
): Promise<void> {
  return logWebhookEvent({
    restaurantId,
    instanceName,
    eventName:       logMeta.eventName,
    bodyKeys:        logMeta.bodyKeys,
    dataKeys:        logMeta.dataKeys,
    messageId:       logMeta.messageId,
    remoteJidMasked: logMeta.remoteJidMasked,
    direction:       logMeta.direction,
    accepted,
    ignored,
    error,
  });
}

async function logWebhookEvent(params: {
  restaurantId:    string | null;
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

    // Keep only last 200 rows per restaurant (or per instance if restaurantId null)
    if (params.restaurantId) {
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
    }
  } catch {
    // Never let logging failures affect webhook processing
  }
}
