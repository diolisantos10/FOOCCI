/**
 * Meta WhatsApp send policy — pure decision for whether a send is allowed and how.
 *
 * Meta's customer-service window: a business may send FREEFORM messages only within
 * 24h of the customer's last inbound message. Outside that window, business-initiated
 * messages MUST use an approved TEMPLATE. Foocci must never silently fail — if a
 * template is required but not configured, we block with META_TEMPLATE_REQUIRED.
 *
 * Vale para todo envio do Foocci: desde 04/08/2026 a Meta é o canal único, e um
 * bloqueio aqui é decisão de política — é reportado ao chamador, nunca contornado
 * por outro caminho de envio.
 */

export const META_CUSTOMER_WINDOW_MS = 24 * 60 * 60 * 1000;

export type MetaSendBlockReason =
  | "INVALID_PHONE"
  | "META_TEMPLATE_REQUIRED";

export type MetaSendDecision =
  | { allowed: true;  mode: "FREEFORM" }   // inside 24h window → plain text ok
  | { allowed: true;  mode: "TEMPLATE" }   // outside window but an approved template is available
  | { allowed: false; reason: MetaSendBlockReason; message: string };

export interface MetaSendPolicyInput {
  /** Recipient phone passed the shared validator. */
  phoneValid:    boolean;
  /** Last INBOUND message time from this customer (null = never / unknown). */
  lastInboundAt: Date | null;
  /** Whether an approved template is configured for this send. */
  hasTemplate:   boolean;
  /** Injectable clock for tests. */
  now?:          Date;
}

/** Decides if/how a Meta outbound may be sent. Pure. */
export function decideMetaSend(input: MetaSendPolicyInput): MetaSendDecision {
  if (!input.phoneValid) {
    return { allowed: false, reason: "INVALID_PHONE", message: "Telefone inválido para envio." };
  }

  const now = (input.now ?? new Date()).getTime();
  const withinWindow =
    input.lastInboundAt != null &&
    now - input.lastInboundAt.getTime() <= META_CUSTOMER_WINDOW_MS &&
    now - input.lastInboundAt.getTime() >= 0;

  if (withinWindow) return { allowed: true, mode: "FREEFORM" };

  if (input.hasTemplate) return { allowed: true, mode: "TEMPLATE" };

  return {
    allowed: false,
    reason:  "META_TEMPLATE_REQUIRED",
    message: "Para mensagens iniciadas pela empresa na Meta (fora da janela de 24h), é necessário usar um modelo aprovado.",
  };
}
