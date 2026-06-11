/**
 * Instagram Direct — shared types for the channel foundation (v1).
 *
 * v1 scope: connect channel, receive inbound, persist Customer/Conversation/
 * Message, show in the Central, allow MANUAL operator reply. NO AI auto-reply,
 * NO real send in tests, tokens never stored/logged in plaintext.
 */

/** Connection behaviour. */
export type InstagramMode = "DISABLED" | "RECEIVE_ONLY" | "REPLY_ONLY" | "FULL";
export const INSTAGRAM_MODES: InstagramMode[] = ["DISABLED", "RECEIVE_ONLY", "REPLY_ONLY", "FULL"];

/** Who is routed into the flow. */
export type InstagramScope = "TEST_ACCOUNT_ONLY" | "RESTAURANT_WIDE";
export const INSTAGRAM_SCOPES: InstagramScope[] = ["TEST_ACCOUNT_ONLY", "RESTAURANT_WIDE"];

/** A normalized inbound Instagram message (channel-agnostic shape). */
export interface NormalizedInstagramMessage {
  channel: "INSTAGRAM_DIRECT";
  instagramAccountId: string | null; // recipient business/page account id
  pageId: string | null;
  senderId: string; // IGSID — the customer's scoped user id
  recipientId: string | null;
  messageId: string; // external message id (idempotency key)
  text: string | null;
  attachments: NormalizedAttachment[];
  timestamp: number; // epoch ms
  rawType: "text" | "attachment" | "echo" | "delivery" | "read" | "reaction" | "unsupported";
  isEcho: boolean; // message sent BY the business (outbound echo) — never duplicated as inbound
}

export interface NormalizedAttachment {
  type: string; // image | video | audio | file | share | story_mention | ...
  url?: string; // media URL when present (not downloaded in v1)
}

/** Result of attempting a manual reply (never throws on operational failure). */
export interface InstagramSendResult {
  ok: boolean;
  sent: boolean; // true only when a real send succeeded
  dryRun: boolean; // true when no real API call was made (mode/test/missing token)
  externalMessageId: string | null;
  error: string | null;
  /** Why nothing was sent, in operator language. */
  reason: string | null;
}
