import { z } from "zod";

// ─── Conversation list query ──────────────────────────────────

export const conversationListQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  status: z.enum(["OPEN", "BOT", "HUMAN", "RESOLVED"]).optional(),
  assignedTo: z.string().optional(),
  search: z.string().max(100).optional(),
});

export type ConversationListQuery = z.infer<typeof conversationListQuerySchema>;

// ─── Conversation PATCH (status transitions + assignment) ────

export const patchConversationSchema = z
  .object({
    action: z.enum(["assign", "unassign", "resolve", "reopen"]),
    userId: z.string().optional(), // required when action === "assign"
  })
  .refine(
    (d) => d.action !== "assign" || (d.action === "assign" && !!d.userId),
    { message: "userId is required when action is 'assign'", path: ["userId"] }
  );

export type PatchConversationInput = z.infer<typeof patchConversationSchema>;

// ─── Send outbound message ────────────────────────────────────

export const sendMessageSchema = z.object({
  content: z.string().min(1).max(4096),
  type: z.enum(["TEXT", "IMAGE", "AUDIO", "DOCUMENT"]).default("TEXT"),
  mediaUrl: z.string().url().optional(),
});

export type SendMessageInput = z.infer<typeof sendMessageSchema>;

// ─── Message list query (cursor-based pagination) ────────────

export const messageListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  before: z.string().optional(), // cursor: sentAt ISO string of oldest loaded message
});

export type MessageListQuery = z.infer<typeof messageListQuerySchema>;
