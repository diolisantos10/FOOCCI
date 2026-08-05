import { z } from "zod";

/**
 * A lojista question sent to the in-app help assistant.
 *
 * `content` pode vir VAZIO desde 05/08/2026 — mas só quando há anexo. "A tela
 * está assim" é um print; exigir que a pessoa escreva alguma coisa junto é
 * atrito à toa. O refino está no `.refine` abaixo, para a mensagem de erro
 * dizer exatamente o que falta.
 */
export const sendHelpMessageSchema = z
  .object({
    content: z.string().trim().max(2000).default(""),
    attachmentIds: z.array(z.string().min(1).max(64)).max(5).default([]),
  })
  .refine((v) => v.content.length > 0 || v.attachmentIds.length > 0, {
    message: "Escreva sua dúvida ou anexe um arquivo.",
  });

export type SendHelpMessageInput = z.infer<typeof sendHelpMessageSchema>;

/** The Foocci team's reply to an escalated help thread (admin side). */
export const supportReplySchema = z.object({
  content: z.string().trim().min(1).max(4000),
  authorName: z.string().trim().max(80).optional(),
});

export type SupportReplyInput = z.infer<typeof supportReplySchema>;
