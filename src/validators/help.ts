import { z } from "zod";

/** A lojista question sent to the in-app help assistant. */
export const sendHelpMessageSchema = z.object({
  content: z.string().trim().min(1).max(2000),
});

export type SendHelpMessageInput = z.infer<typeof sendHelpMessageSchema>;

/** The Foocci team's reply to an escalated help thread (admin side). */
export const supportReplySchema = z.object({
  content: z.string().trim().min(1).max(4000),
  authorName: z.string().trim().max(80).optional(),
});

export type SupportReplyInput = z.infer<typeof supportReplySchema>;
