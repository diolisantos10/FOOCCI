/**
 * Audit logger — structured console output for sensitive operations.
 *
 * Logs are written to stdout as JSON lines so Railway log aggregation
 * (or any external sink) can parse and search them easily.
 *
 * Rules:
 *   - Never log secrets, passwords, tokens, or raw payment data.
 *   - Log who did what, on which tenant, and when.
 *   - Keep meta fields minimal — IDs and status transitions only.
 */

export type AuditAction =
  // User management
  | "user.create"
  | "user.update"
  | "user.delete"
  // Auth
  | "auth.login_success"
  | "auth.login_failure"
  // Settings & integrations
  | "settings.update"
  | "integration.update"
  // Orders
  | "order.status_change"
  | "order.delete"
  // Payments
  | "payment.status_change"
  // Conversations
  | "conversation.takeover"   // AI → human
  | "conversation.assign"
  | "conversation.resolve"
  | "conversation.reopen"
  | "conversation.delete";

export interface AuditEntry {
  action: AuditAction;
  restaurantId?: string;
  /** The user who performed the action (internal staff). */
  userId?: string;
  /** The entity being acted upon (order id, user id, etc.). */
  targetId?: string;
  /** Safe, non-sensitive metadata. */
  meta?: Record<string, string | number | boolean | null | undefined>;
}

export function auditLog(entry: AuditEntry): void {
  try {
    console.log(
      JSON.stringify({
        audit: true,
        timestamp: new Date().toISOString(),
        ...entry,
      })
    );
  } catch {
    // auditLog must never throw
  }
}
