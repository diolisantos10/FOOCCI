/**
 * WhatsAppOrderingSessionService — durable session persistence.
 *
 * Owns the WhatsAppOrderingSession table. Serializes/deserializes the typed
 * session JSON at the service boundary so callers never touch raw Prisma JSON.
 *
 * No WhatsApp send here. No payment here. No order creation here.
 * Tenant-scoped: every query is filtered by restaurantId.
 */

import { prisma } from "@/lib/prisma";
import type {
  WaPersistedSession,
  WaOrderItem,
  WaUnresolvedItem,
  WaMissingQuestion,
  WaAddress,
  WaDeliveryQuote,
  WaSessionStatus,
  WaOrderStage,
  WaRuntimeMode,
} from "./types";

const ACTIVE_STATUSES: WaSessionStatus[] = [
  "ACTIVE",
  "AWAITING_CUSTOMER",
  "READY_TO_CONFIRM",
  "AWAITING_PAYMENT",
];

const DEFAULT_TTL_MS = 6 * 60 * 60 * 1000; // 6h

// ── Row → typed session ────────────────────────────────────────────────────────

type Row = {
  id: string; restaurantId: string; customerId: string | null; conversationId: string | null;
  phone: string; status: string; stage: string;
  selectedItems: unknown; unresolvedItems: unknown; missingQuestions: unknown;
  deliveryType: string | null; address: unknown; deliveryQuote: unknown;
  paymentMethod: string | null; paymentStatus: string | null;
  orderDraftId: string | null; orderId: string | null; pixPaymentId: string | null;
  mode: string; source: string; metadata: unknown;
  lastMessageAt: Date; expiresAt: Date | null; createdAt: Date; updatedAt: Date;
};

function deserialize(row: Row): WaPersistedSession {
  return {
    id:               row.id,
    restaurantId:     row.restaurantId,
    customerId:       row.customerId,
    conversationId:   row.conversationId,
    phone:            row.phone,
    status:           row.status as WaSessionStatus,
    stage:            row.stage as WaOrderStage,
    selectedItems:    (row.selectedItems    as WaOrderItem[])      ?? [],
    unresolvedItems:  (row.unresolvedItems  as WaUnresolvedItem[]) ?? [],
    missingQuestions: (row.missingQuestions as WaMissingQuestion[]) ?? [],
    deliveryType:     (row.deliveryType as WaPersistedSession["deliveryType"]) ?? null,
    address:          (row.address       as WaAddress | null) ?? null,
    deliveryQuote:    (row.deliveryQuote as WaDeliveryQuote | null) ?? null,
    paymentMethod:    (row.paymentMethod as WaPersistedSession["paymentMethod"]) ?? null,
    paymentStatus:    (row.paymentStatus as WaPersistedSession["paymentStatus"]) ?? null,
    orderDraftId:     row.orderDraftId,
    orderId:          row.orderId,
    pixPaymentId:     row.pixPaymentId,
    mode:             row.mode as WaRuntimeMode,
    source:           row.source,
    metadata:         (row.metadata as Record<string, unknown> | null) ?? null,
    lastMessageAt:    row.lastMessageAt,
    expiresAt:        row.expiresAt,
    createdAt:        row.createdAt,
    updatedAt:        row.updatedAt,
  };
}

// ── Inputs ──────────────────────────────────────────────────────────────────────

export interface FindActiveInput {
  restaurantId:    string;
  phone:           string;
  conversationId?: string | null;
}

export interface CreateSessionInput {
  restaurantId:    string;
  phone:           string;
  conversationId?: string | null;
  customerId?:     string | null;
  mode:            WaRuntimeMode;
  source?:         string;
}

export type SessionPatch = Partial<
  Pick<
    WaPersistedSession,
    | "status" | "stage" | "selectedItems" | "unresolvedItems" | "missingQuestions"
    | "deliveryType" | "address" | "deliveryQuote" | "paymentMethod" | "paymentStatus"
    | "orderDraftId" | "orderId" | "pixPaymentId" | "customerId" | "conversationId"
    | "metadata"
  >
>;

// ── Service ───────────────────────────────────────────────────────────────────

export const WhatsAppOrderingSessionService = {
  /** Most recent active session for this restaurant+phone (one active per pair). */
  async findActiveSession(input: FindActiveInput): Promise<WaPersistedSession | null> {
    const now = new Date();
    const row = await prisma.whatsAppOrderingSession.findFirst({
      where: {
        restaurantId: input.restaurantId,
        phone:        input.phone,
        status:       { in: ACTIVE_STATUSES },
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
      orderBy: { lastMessageAt: "desc" },
    });
    return row ? deserialize(row as Row) : null;
  },

  /**
   * Create a new active session. Enforces "one active per phone+restaurant" by
   * expiring any existing active sessions first (atomic transaction).
   */
  async createSession(input: CreateSessionInput): Promise<WaPersistedSession> {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + DEFAULT_TTL_MS);

    const created = await prisma.$transaction(async (tx) => {
      // Expire any stale/active sessions for this phone first
      await tx.whatsAppOrderingSession.updateMany({
        where: {
          restaurantId: input.restaurantId,
          phone:        input.phone,
          status:       { in: ACTIVE_STATUSES },
        },
        data: { status: "EXPIRED" },
      });

      return tx.whatsAppOrderingSession.create({
        data: {
          restaurantId:   input.restaurantId,
          phone:          input.phone,
          conversationId: input.conversationId ?? null,
          customerId:     input.customerId ?? null,
          mode:           input.mode,
          source:         input.source ?? "admin_test",
          status:         "ACTIVE",
          stage:          "IDLE",
          lastMessageAt:  now,
          expiresAt,
        },
      });
    });

    return deserialize(created as Row);
  },

  /** Atomically patch a session and bump lastMessageAt. */
  async updateSession(sessionId: string, patch: SessionPatch): Promise<WaPersistedSession> {
    const data: Record<string, unknown> = { lastMessageAt: new Date() };

    if (patch.status            !== undefined) data.status           = patch.status;
    if (patch.stage             !== undefined) data.stage            = patch.stage;
    if (patch.selectedItems     !== undefined) data.selectedItems    = patch.selectedItems as unknown;
    if (patch.unresolvedItems   !== undefined) data.unresolvedItems  = patch.unresolvedItems as unknown;
    if (patch.missingQuestions  !== undefined) data.missingQuestions = patch.missingQuestions as unknown;
    if (patch.deliveryType      !== undefined) data.deliveryType     = patch.deliveryType;
    if (patch.address           !== undefined) data.address          = patch.address as unknown;
    if (patch.deliveryQuote     !== undefined) data.deliveryQuote    = patch.deliveryQuote as unknown;
    if (patch.paymentMethod     !== undefined) data.paymentMethod    = patch.paymentMethod;
    if (patch.paymentStatus     !== undefined) data.paymentStatus    = patch.paymentStatus;
    if (patch.orderDraftId      !== undefined) data.orderDraftId     = patch.orderDraftId;
    if (patch.orderId           !== undefined) data.orderId          = patch.orderId;
    if (patch.pixPaymentId      !== undefined) data.pixPaymentId     = patch.pixPaymentId;
    if (patch.customerId        !== undefined) data.customerId       = patch.customerId;
    if (patch.conversationId    !== undefined) data.conversationId   = patch.conversationId;
    if (patch.metadata          !== undefined) data.metadata         = patch.metadata as unknown;

    const updated = await prisma.whatsAppOrderingSession.update({
      where: { id: sessionId },
      data,
    });
    return deserialize(updated as Row);
  },

  async cancelSession(sessionId: string): Promise<void> {
    await prisma.whatsAppOrderingSession.update({
      where: { id: sessionId },
      data:  { status: "CANCELLED" },
    });
  },

  /** Marks active sessions past their TTL as EXPIRED. Returns the count. */
  async expireOldSessions(restaurantId?: string): Promise<number> {
    const now = new Date();
    const res = await prisma.whatsAppOrderingSession.updateMany({
      where: {
        ...(restaurantId ? { restaurantId } : {}),
        status:    { in: ACTIVE_STATUSES },
        expiresAt: { not: null, lt: now },
      },
      data: { status: "EXPIRED" },
    });
    return res.count;
  },

  async getSessionForAdmin(sessionId: string): Promise<WaPersistedSession | null> {
    const row = await prisma.whatsAppOrderingSession.findUnique({ where: { id: sessionId } });
    return row ? deserialize(row as Row) : null;
  },
};
