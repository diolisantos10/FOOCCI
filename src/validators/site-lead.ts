import { z } from "zod";
import { whatsappBrValido, MENSAGEM_WHATSAPP_INVALIDO } from "@/lib/whatsapp-br";

/**
 * Validation for the public demo-request form (`DemoForm`, hoje na última seção de
 * /site/precos — a página /site/demonstracao foi eliminada em 06/08).
 *
 * PUBLIC endpoint — anyone on the internet can post here, so every field is
 * length-bounded. Only `nome` and `whatsapp` are required; the rest qualify the
 * lead and an owner in a hurry should not be blocked by them.
 *
 * ⚠️ O `whatsapp` era `min(8)` — OITO CARACTERES QUAISQUER. "não tenho" passava,
 * e a tela de sucesso confirmava: "vamos chamar você no WhatsApp não tenho".
 * Ninguém conseguia chamar, e a pessoa ficava esperando. Agora a forma do número
 * é conferida aqui, no SERVIDOR — a mesma checagem roda no formulário para a
 * pessoa ver o erro antes de enviar, mas essa é conveniência; a trava é esta.
 * A regra inteira, com a lista de quem passa e quem não passa, está em
 * `src/lib/whatsapp-br.ts`.
 *
 * Os campos de ORIGEM (utm*) também vêm do navegador e portanto também são
 * entrada de atacante: são limitados em tamanho e nunca chegam a uma query, só a
 * uma coluna de texto. Eles são a resposta a "qual anúncio funciona", que o
 * `origem` sozinho (a página do formulário) nunca conseguiu dar.
 */
export const createSiteLeadSchema = z.object({
  nome:        z.string().trim().min(2, "Informe seu nome").max(120),
  whatsapp:    z.string().trim().min(1, "Informe seu WhatsApp").max(30)
                 .refine(whatsappBrValido, MENSAGEM_WHATSAPP_INVALIDO),
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
