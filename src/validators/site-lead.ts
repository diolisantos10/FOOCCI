import { z } from "zod";

/**
 * Validation for the public demo-request form (/site/demonstracao).
 *
 * PUBLIC endpoint — anyone on the internet can post here, so every field is
 * length-bounded. Only `nome` and `whatsapp` are required; the rest qualify the
 * lead and an owner in a hurry should not be blocked by them.
 *
 * Os campos de ORIGEM (utm*) também vêm do navegador e portanto também são
 * entrada de atacante: são limitados em tamanho e nunca chegam a uma query, só a
 * uma coluna de texto. Eles são a resposta a "qual anúncio funciona", que o
 * `origem` sozinho (a página do formulário) nunca conseguiu dar.
 */
export const createSiteLeadSchema = z.object({
  nome:        z.string().trim().min(2, "Informe seu nome").max(120),
  whatsapp:    z.string().trim().min(8, "Informe um WhatsApp válido").max(30),
  restaurante: z.string().trim().max(160).optional().or(z.literal("")),
  cidade:      z.string().trim().max(120).optional().or(z.literal("")),
  tipo:        z.string().trim().max(60).optional().or(z.literal("")),
  desafio:     z.string().trim().max(120).optional().or(z.literal("")),
  /** Legado: a página de onde o formulário foi enviado. Mantido, mas não é atribuição. */
  origem:      z.string().trim().max(200).optional().or(z.literal("")),

  // ── Origem de verdade (primeiro toque) ─────────────────────────────────────
  utmSource:   z.string().trim().max(200).optional().or(z.literal("")),
  utmMedium:   z.string().trim().max(200).optional().or(z.literal("")),
  utmCampaign: z.string().trim().max(200).optional().or(z.literal("")),
  utmContent:  z.string().trim().max(200).optional().or(z.literal("")),
  utmTerm:     z.string().trim().max(200).optional().or(z.literal("")),
  clickId:     z.string().trim().max(200).optional().or(z.literal("")),
  landingPath: z.string().trim().max(200).optional().or(z.literal("")),
  referrer:    z.string().trim().max(200).optional().or(z.literal("")),
});

export type CreateSiteLeadInput = z.infer<typeof createSiteLeadSchema>;
