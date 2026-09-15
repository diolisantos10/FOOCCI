import { buildMetaContactPayload, extractInboundContactCards } from "./contactCards";

describe("contactCards", () => {
  it("builds a Meta contacts payload with the WhatsApp action", () => {
    const payload = buildMetaContactPayload("5511999990000", {
      name: "Marketing Santa Helena",
      phone: "(11) 98888-7777",
      organization: "Padaria Santa Helena",
      title: "Contato comercial",
    });
    expect(payload.type).toBe("contacts");
    expect(payload.contacts[0].name.formatted_name).toBe("Marketing Santa Helena");
    expect(payload.contacts[0].phones[0].wa_id).toBe("5511988887777");
  });

  it("extracts a referred decision maker from an inbound contact card", () => {
    const cards = extractInboundContactCards({
      contacts: [{
        name: { formatted_name: "Maria - Administrativo" },
        phones: [{ wa_id: "5511977776666" }],
        org: { company: "Restaurante Exemplo", title: "Administrativo" },
      }],
    });
    expect(cards).toEqual([{ name: "Maria - Administrativo", phone: "5511977776666", organization: "Restaurante Exemplo", title: "Administrativo", email: null }]);
  });

  it("ignores malformed cards instead of inventing a lead", () => {
    expect(extractInboundContactCards({ contacts: [{ name: { formatted_name: "Sem telefone" } }] })).toEqual([]);
  });
});
