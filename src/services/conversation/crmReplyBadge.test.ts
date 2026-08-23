/**
 * A ETIQUETA "RESPOSTA CRM" QUE APARECIA EM TUDO.
 *
 * O que o CEO viu na Central de Conversas: 10 de 10 conversas visíveis com a
 * etiqueta "Resposta CRM" — inclusive a da Larissia, abordada pela última vez em
 * julho, cujo movimento de ontem foi navegar no cardápio ("PRATOS QUENTES",
 * "LÁMEN") com o robô respondendo. A regra, nas palavras dele:
 *
 *   "Resposta CRM é só quando ela responde após ser abordada por alguma
 *    mensagem de CRM."
 *
 * A etiqueta antiga não perguntava nem uma coisa nem outra:
 *   • "foi abordada?" era respondido pelo `contextType` da conversa — campo
 *     único, gravado no envio, que NUNCA expira (só some quando o cliente
 *     compra). Abordado em julho = etiquetado em agosto, setembro, sempre;
 *   • "respondeu?" era respondido por "existe QUALQUER mensagem de entrada nesta
 *     conversa" — sem olhar a data, então até mensagem ANTERIOR ao envio contava.
 *
 * Uma etiqueta que aparece em tudo não classifica nada.
 *
 * Este arquivo trava a regra nova pelos dois lados: o caso da Larissia deixa de
 * ser resposta de CRM, e a resposta de verdade continua sendo.
 */

import { describe, it, expect } from "vitest";
import { crmReplyAt, isCrmReply, CRM_REPLY_WINDOW_DAYS } from "./crmReplyBadge";

const dia = (iso: string) => new Date(iso);

describe("crmReplyAt — a regra do dono", () => {
  it("O CASO LARISSIA: abordada em julho, mexeu no cardápio ontem → NÃO é resposta CRM", () => {
    const r = crmReplyAt({
      lastCrmSentAt: dia("2026-07-17T14:00:00Z"),
      lastInboundAt: dia("2026-08-22T22:41:00Z"),
    });
    expect(r).toBeNull();
  });

  it("respondeu duas horas depois de ser abordada → É resposta CRM, com a data", () => {
    const inbound = dia("2026-08-22T16:00:00Z");
    const r = crmReplyAt({
      lastCrmSentAt: dia("2026-08-22T14:00:00Z"),
      lastInboundAt: inbound,
    });
    expect(r).toEqual(inbound);
  });

  it("nunca foi abordada pelo CRM → nada que ela escreva vira resposta de CRM", () => {
    expect(isCrmReply({
      lastCrmSentAt: null,
      lastInboundAt: dia("2026-08-22T16:00:00Z"),
    })).toBe(false);
  });

  it("foi abordada e nunca escreveu → não respondeu", () => {
    expect(isCrmReply({
      lastCrmSentAt: dia("2026-08-22T14:00:00Z"),
      lastInboundAt: null,
    })).toBe(false);
  });

  it("escreveu ANTES da abordagem → é conversa dela, não resposta à campanha", () => {
    expect(isCrmReply({
      lastCrmSentAt: dia("2026-08-22T14:00:00Z"),
      lastInboundAt: dia("2026-08-22T09:00:00Z"),
    })).toBe(false);
  });

  it("a janela de resposta tem borda: dentro conta, um minuto depois não", () => {
    const envio = dia("2026-08-01T12:00:00Z");
    const janelaMs = CRM_REPLY_WINDOW_DAYS * 86_400_000;

    const naBorda = new Date(envio.getTime() + janelaMs);
    expect(isCrmReply({ lastCrmSentAt: envio, lastInboundAt: naBorda })).toBe(true);

    const passouDaBorda = new Date(envio.getTime() + janelaMs + 60_000);
    expect(isCrmReply({ lastCrmSentAt: envio, lastInboundAt: passouDaBorda })).toBe(false);
  });

  it("a janela é a MESMA já usada para atribuir resposta a campanha (7 dias)", () => {
    // Duas réguas diferentes para a mesma pergunta seria outro jeito de a tela
    // mentir. Ver markCrmReplyIfApplicable em AgentRoutingService.
    expect(CRM_REPLY_WINDOW_DAYS).toBe(7);
  });

  it("mensagem no mesmo instante do envio não conta como resposta", () => {
    const t = dia("2026-08-22T14:00:00Z");
    expect(isCrmReply({ lastCrmSentAt: t, lastInboundAt: t })).toBe(false);
  });
});
