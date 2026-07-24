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

/** A normalized inbound Instagram/Messenger message (channel-agnostic shape). */
export interface NormalizedInstagramMessage {
  // "MESSENGER" when the webhook object is "page" (Facebook Page DM); the message shape
  // is identical, only the channel tag and downstream labeling differ.
  channel: "INSTAGRAM_DIRECT" | "MESSENGER";
  instagramAccountId: string | null; // recipient business/page account id (Page id for Messenger)
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

/**
 * A normalized inbound Instagram COMMENT on a post (channel `comments` webhook).
 * Distinct from a DM: it lives on a media/post and is replied to PUBLICLY via
 * the Graph API (POST /{commentId}/replies), not the messaging API.
 */
export interface NormalizedInstagramComment {
  kind: "comment";
  instagramAccountId: string | null; // entry[].id — the business IG account
  commentId: string;                 // value.id — the reply target
  mediaId: string | null;            // value.media.id — the post it's on
  parentCommentId: string | null;    // value.parent_id — set when it replies to a comment
  fromUserId: string;                // value.from.id — commenter's scoped id
  fromUsername: string | null;       // value.from.username
  text: string;                      // value.text
  timestamp: number;                 // epoch ms (entry[].time)
  isEcho: boolean;                   // comment authored BY the business itself — skip
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
  /** True when Meta rejected the token (OAuthException / code 190) — the channel
   *  service uses this to flag "reconnect needed" instead of failing silently. */
  authError?: boolean;
}
