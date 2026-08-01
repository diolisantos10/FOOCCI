import { z } from "zod";

/**
 * Validation for the public demo-request form (/site/demonstracao).
 *
 * PUBLIC endpoint — anyone on the internet can post here, so every field is
 * length-bounded. Only `nome` and `whatsapp` are required; the rest qualify the
 * lead and an owner in a hurry should not be blocked by them.
 */
export const createSiteLeadSchema = z.object({
  nome:        z.string().trim().min(2, "Informe seu nome").max(120),
  whatsapp:    z.string().trim().min(8, "Informe um WhatsApp válido").max(30),
  restaurante: z.string().trim().max(160).optional().or(z.literal("")),
  cidade:      z.string().trim().max(120).optional().or(z.literal("")),
  tipo:        z.string().trim().max(60).optional().or(z.literal("")),
  desafio:     z.string().trim().max(120).optional().or(z.literal("")),
  origem:      z.string().trim().max(200).optional().or(z.literal("")),
});

export type CreateSiteLeadInput = z.infer<typeof createSiteLeadSchema>;
