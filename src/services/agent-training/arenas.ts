/**
 * External arenas surfaced inside the Treinamento IA admin — hermetic simulators
 * that live outside this stack but are part of the same training story. Linked,
 * not duplicated: the Training Center remains the 24h loop; each arena proves a
 * specific agent without sending anything real.
 */

export interface ExternalArena {
  id: string;
  label: string;
  href: string;
  description: string;
}

export const WHATSAPP_TEXT_ORDER_ARENA: ExternalArena = {
  id: "whatsapp-text-order",
  label: "WhatsApp · Pedido por Texto",
  href: "/admin/agents/whatsapp",
  description:
    "Arena segura para validar o anotador de pedido sem enviar WhatsApp, sem criar pedido e sem gerar Pix.",
};

export const EXTERNAL_ARENAS: ExternalArena[] = [WHATSAPP_TEXT_ORDER_ARENA];
