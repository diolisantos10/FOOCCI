/**
 * A verdade de um cliente de agência é o briefing.
 *
 * Antes disto a Oficina não escrevia UMA peça para cliente de agência: só havia
 * adapter de RESTAURANT, a verdade vinha vazia e o juiz reprovava — corretamente
 * — com "anexe os fatos do banco, senão a IA inventa". A esteira da Dioli
 * parava na produção, sempre.
 *
 * O que estes testes protegem não é o formato do snapshot: é a regra de que
 * nada aqui é inventado. Campo que o cliente não respondeu vira pendência com
 * a pergunta original, nunca um valor plausível.
 */

import { describe, it, expect } from "vitest";

import { snapshotDoBriefing } from "./AgencyKnowledgeAdapter";
import { briefingFoocci } from "../sdr/pilotos/BriefingFoocci";
import type { EstadoDaSondagem } from "../oficina/Sondagem";

describe("o briefing vira verdade", () => {
  const snap = snapshotDoBriefing("foocci", briefingFoocci());

  it("o que o cliente vende chega como products — sem isso a peça sai genérica", () => {
    expect(snap.truthSources.products?.length ?? 0).toBeGreaterThan(0);
    expect(JSON.stringify(snap.truthSources.products)).toMatch(/restaurante/i);
  });

  it("as proibições do cliente chegam como política, não como sugestão", () => {
    const policies = JSON.stringify(snap.truthSources.policies);
    expect(policies).toMatch(/PROIBIÇÕES DO CLIENTE/);
    expect(policies).toMatch(/chatbot/i);
  });

  it("cada serviço contratado declara de onde vem o material", () => {
    const policies = (snap.truthSources.policies ?? []) as string[];
    expect(policies.some((p) => /a agência produz o material/.test(p))).toBe(true);
    expect(policies.some((p) => /NÃO definida/.test(p))).toBe(false);
  });

  it("o público chega — é para quem a peça fala", () => {
    expect(snap.truthSources.customers?.length ?? 0).toBeGreaterThan(0);
  });

  it("a completude herda a régua do SDR: destravar produção é terminar a entrevista", () => {
    expect(snap.completenessScore).toBeGreaterThan(0);
    expect(snap.completenessScore).toBeLessThanOrEqual(1);
  });
});

describe("o que falta aparece como pergunta, nunca como palpite", () => {
  const snap = snapshotDoBriefing("foocci", briefingFoocci());

  it("as pendências vêm com a pergunta original", () => {
    expect(snap.missingContext.length).toBeGreaterThan(0);
    expect(snap.missingContext.some((m) => /Quais redes você tem/.test(m))).toBe(true);
  });

  it("campo sem resposta NÃO vira valor inventado", () => {
    // redes_sociais é justamente o que ninguém sabe — não pode ter virado @algo
    const tudo = JSON.stringify(snap.truthSources);
    expect(tudo).not.toMatch(/@foocci/i);
    expect(tudo).not.toMatch(/instagram\.com/i);
  });

  it("briefing vazio não produz verdade nenhuma, e diz por quê", () => {
    const vazio: EstadoDaSondagem = {};
    const s = snapshotDoBriefing("cliente_novo", vazio);

    expect(Object.keys(s.truthSources)).toHaveLength(0);
    expect(s.completenessScore).toBe(0);
    expect(s.safetyNotes.some((n) => /sondagem ainda não fechou/i.test(n))).toBe(true);
    expect(s.safetyNotes.some((n) => /não declarou proibições/i.test(n))).toBe(true);
  });

  it("serviço sem origem de material é denunciado, não maquiado", () => {
    const s = snapshotDoBriefing("x", {
      ficha:    { o_que_vende: "bolo" },
      servicos: [{ chave: "reels", origemDoInsumo: null }],
    });
    expect((s.truthSources.policies as string[]).some((p) => /NÃO definida/.test(p))).toBe(true);
  });
});
