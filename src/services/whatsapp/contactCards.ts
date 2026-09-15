import { normalizePhoneBR, isValidPhoneBR } from "@/lib/crm/normalizePhone";

export interface CommercialContactCard {
  name: string;
  phone: string;
  organization?: string | null;
  title?: string | null;
  email?: string | null;
}

export interface MetaContactPayload {
  messaging_product: "whatsapp";
  recipient_type: "individual";
  to: string;
  type: "contacts";
  contacts: Array<{
    name: { formatted_name: string; first_name: string };
    phones: Array<{ phone: string; type: "WORK"; wa_id: string }>;
    org?: { company?: string; title?: string };
    emails?: Array<{ email: string; type: "WORK" }>;
  }>;
}

function digits(raw: string): string | null {
  const normalized = normalizePhoneBR(raw);
  return normalized && isValidPhoneBR(normalized) ? normalized : null;
}

/** Payload oficial de cartão de contato da Meta Cloud API. */
export function buildMetaContactPayload(to: string, card: CommercialContactCard): MetaContactPayload {
  const phone = digits(card.phone);
  if (!phone) throw new Error("INVALID_CONTACT_PHONE");
  const name = card.name.trim();
  if (!name) throw new Error("INVALID_CONTACT_NAME");
  const company = card.organization?.trim();
  const title = card.title?.trim();
  const email = card.email?.trim();
  return {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to,
    type: "contacts",
    contacts: [{
      name: { formatted_name: name, first_name: name },
      phones: [{ phone, type: "WORK", wa_id: phone }],
      ...((company || title) ? { org: { ...(company ? { company } : {}), ...(title ? { title } : {}) } } : {}),
      ...(email ? { emails: [{ email, type: "WORK" }] } : {}),
    }],
  };
}

/**
 * Extrai cartões recebidos no webhook. O chamador persiste o novo decisor no CRM
 * e registra quem fez a indicação; receber o cartão nunca qualifica o remetente.
 */
export function extractInboundContactCards(rawMessage: unknown): CommercialContactCard[] {
  const message = rawMessage as { contacts?: Array<{ name?: { formatted_name?: string; first_name?: string }; phones?: Array<{ phone?: string; wa_id?: string }>; org?: { company?: string; title?: string }; emails?: Array<{ email?: string }> }> };
  return (message.contacts ?? []).flatMap((c) => {
    const rawPhone = c.phones?.[0]?.wa_id ?? c.phones?.[0]?.phone ?? "";
    const phone = digits(rawPhone);
    const name = (c.name?.formatted_name ?? c.name?.first_name ?? "").trim();
    if (!phone || !name) return [];
    return [{ name, phone, organization: c.org?.company ?? null, title: c.org?.title ?? null, email: c.emails?.[0]?.email ?? null }];
  });
}
