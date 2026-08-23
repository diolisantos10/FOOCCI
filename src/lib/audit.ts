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
  | "order.item_replaced"
  // Payments
  | "payment.status_change"
  // Conversations
  | "conversation.takeover"   // AI → human
  | "conversation.assign"
  | "conversation.resolve"
  | "conversation.reopen"
  | "conversation.delete"
  // Build OS (internal admin)
  | "buildos.bootstrap"
  // Cofre de credenciais de infraestrutura (Admin → Credenciais).
  // `read` é o que importa: um token do Railway é chave-mestra, e leitura de
  // chave-mestra sem trilha é risco cego. `meta` carrega o motivo (`purpose`) e,
  // no máximo, os 4 últimos caracteres — nunca o token.
  | "infra_credential.save"
  | "infra_credential.save_rejected"
  | "infra_credential.delete"
  | "infra_credential.read"
  // Teto de contatos do CRM alterado pelo ADMINISTRADOR do sistema (não pelo
  // lojista, na tela dele). É dinheiro: o teto governa quantas pessoas novas o
  // CRM pode abordar. Mudança sem trilha aqui é mudança que ninguém consegue
  // explicar depois — por isso o `meta` carrega o valor ANTES e o DEPOIS.
  | "crm.contact_budget_update"
  | "crm.contact_budget_update_rejected";

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
