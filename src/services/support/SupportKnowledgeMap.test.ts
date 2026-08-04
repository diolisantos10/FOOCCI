import { describe, it, expect } from "vitest";
import { matchFailureModes, FAILURE_MODES, buildKnowledgeMapContext } from "./SupportKnowledgeMap";

describe("SupportKnowledgeMap — casamento sintoma → modo de falha", () => {
  it("relato de WhatsApp que parou casa com o modo de falha do Meta inbound", () => {
    const hits = matchFailureModes("os pedidos pararam de chegar no whatsapp mas eu consigo enviar");
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.map((m) => m.subsystem)).toContain("whatsapp_meta");
  });

  it("relato de sistema fora do ar casa com exaustão de conexão do banco", () => {
    const hits = matchFailureModes("o sistema todo ficou fora do ar, erro ao abrir qualquer tela");
    expect(hits.some((m) => m.subsystem === "database")).toBe(true);
  });

  it("relato de impressora casa com o subsistema de impressão (Carteiro)", () => {
    for (const report of [
      "a impressora não está imprimindo os pedidos",
      "as comandas não saem na cozinha",
      "o carteiro parou de imprimir",
    ]) {
      const hits = matchFailureModes(report);
      expect(hits[0]?.subsystem, report).toBe("printing");
    }
  });

  it("relato de impressora NÃO casa pagamento nem outro subsistema no topo (regressão)", () => {
    const hits = matchFailureModes("minha impressora não imprime a comanda");
    expect(hits.map((m) => m.subsystem)).not.toContain("payments");
    expect(hits[0]?.subsystem).toBe("printing");
  });

  it("relato sem relação não casa nada (não força diagnóstico)", () => {
    const hits = matchFailureModes("qual o telefone do suporte");
    expect(hits.length).toBe(0);
  });

  it("todo modo de falha tem gatilhos, runbook e severidade", () => {
    for (const m of FAILURE_MODES) {
      expect(m.triggers.length, m.key).toBeGreaterThan(0);
      expect(m.runbook.length).toBeGreaterThan(0);
      expect(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).toContain(m.severity);
    }
  });

  it("o bloco de contexto do mapa é montável", () => {
    const ctx = buildKnowledgeMapContext();
    expect(ctx).toContain("MAPA DO SISTEMA FOOCCI");
    expect(ctx).toContain("MODOS DE FALHA");
  });
});

/**
 * A METADE QUE FALTAVA: provar que a pergunta LEGÍTIMA não vira incidente.
 *
 * Os cinco casos abaixo foram medidos rodando o matcher de produção em
 * 04/08/2026. Todos passavam pela regra antiga (`triggerHits*2 + palavras do
 * sintoma >= 2`), que deixava DUAS palavras quaisquer classificarem uma falha.
 * Cada um deles injetava runbook como VERDADE, disparava sonda do sistema e
 * mandava o lojista para a tela errada — a partir de uma dúvida inocente.
 *
 * Um detector só de barrar vira carimbo; por isso cada negativo aqui tem o
 * positivo correspondente logo abaixo, com o relato de falha de verdade.
 */
describe("falsos positivos medidos — pergunta inocente NÃO vira incidente", () => {
  const casos: Array<{ pergunta: string; virava: string; falhaDeVerdade: string; subsistema: string }> = [
    {
      pergunta: "como mudo o papel de parede do cardápio?",
      virava: "printing (HIGH) — pelo gatilho solto 'papel'",
      falhaDeVerdade: "a impressora não imprime, acabou o papel",
      subsistema: "printing",
    },
    {
      pergunta: "erro ao abrir a tela de cardápio",
      virava: "database (CRITICAL) — por 'erro' + 'abrir' + 'tela' do texto do sintoma",
      falhaDeVerdade: "o sistema todo está fora do ar, não abre nada",
      subsistema: "database",
    },
    {
      pergunta: "o google desconectou de novo",
      virava: "whatsapp_evolution — pelo gatilho solto 'desconectou'",
      falhaDeVerdade: "o whatsapp desconectou de novo, tá pedindo qr",
      subsistema: "whatsapp_evolution",
    },
    {
      pergunta: "as DMs do instagram pararam de chegar",
      virava: "whatsapp_meta — canal errado, diagnóstico errado",
      falhaDeVerdade: "as mensagens do whatsapp pararam de chegar",
      subsistema: "whatsapp_meta",
    },
    {
      pergunta: "posso mandar comanda por whatsapp?",
      virava: "printing (HIGH) — pelo gatilho solto 'comanda'",
      falhaDeVerdade: "as comandas não saem na cozinha",
      subsistema: "printing",
    },
  ];

  for (const c of casos) {
    it(`NÃO casa: "${c.pergunta}" (virava ${c.virava})`, () => {
      const hits = matchFailureModes(c.pergunta);
      expect(
        hits.map((m) => m.key),
        `"${c.pergunta}" não pode virar incidente`,
      ).toEqual([]);
    });

    it(`AINDA casa: "${c.falhaDeVerdade}" → ${c.subsistema}`, () => {
      const hits = matchFailureModes(c.falhaDeVerdade);
      expect(hits[0]?.subsystem, c.falhaDeVerdade).toBe(c.subsistema);
    });
  }

  it("sobreposição de palavras NUNCA classifica sozinha — sem gatilho, sem incidente", () => {
    // Todas as palavras vêm do texto do sintoma do modo de banco de dados, mas
    // nenhuma expressão de falha curada aparece.
    const hits = matchFailureModes("qual tela do sistema mostra o erro de um pedido?");
    expect(hits).toEqual([]);
  });

  it("gatilho genérico sem escopo não pesca canal errado", () => {
    // "pararam de chegar" é gatilho do Meta inbound, mas sem WhatsApp no relato
    // não dá para saber de que canal o lojista fala.
    expect(matchFailureModes("os e-mails pararam de chegar")).toEqual([]);
    expect(matchFailureModes("as mensagens do whatsapp pararam de chegar").length).toBeGreaterThan(0);
  });
});

describe("runbooks que mandam o lojista para o lugar certo", () => {
  it("campanha travada: a causa é audiência 0 / 'Ativar base', não job zumbi", () => {
    const modo = FAILURE_MODES.find((m) => m.key === "campaign_queue_stuck")!;
    const runbook = modo.runbook.join(" ");

    // A causa real e recorrente (docs/pendencias.md, seção do CRM).
    expect(modo.likelyCause).toMatch(/contactabilidade|crmContactable|audiência 0/i);
    expect(runbook).toContain("Ativar base");
    // O job travado continua no mapa — como hipótese SECUNDÁRIA, no fim.
    expect(runbook).toMatch(/job travado/i);
    expect(modo.runbook.findIndex((p) => p.includes("Ativar base"))).toBeLessThan(
      modo.runbook.findIndex((p) => /job travado/i.test(p)),
    );
  });

  it("pagamentos deixou de ser subsistema sem nenhum modo de falha", () => {
    const doSubsistema = FAILURE_MODES.filter((m) => m.subsystem === "payments");
    expect(doSubsistema.length).toBeGreaterThan(0);

    const modo = doSubsistema[0]!;
    // Runbook de LOJISTA: nomes de tela reais, e a trava de nunca confirmar
    // pagamento pela palavra do cliente.
    expect(modo.runbook.join(" ")).toContain("Vendas → Pedidos");
    expect(modo.runbook.join(" ")).toMatch(/Confirmar pagamento/);
    expect(modo.runbook.join(" ")).toMatch(/nunca confirme só pela palavra/i);
    // Confirmar dinheiro é decisão do lojista — a IA não tem ação candidata aqui.
    expect(modo.remediationAction).toBeNull();
  });

  it("relato de pix não confirmado casa com pagamentos", () => {
    const hits = matchFailureModes("o cliente pagou mas o pedido continua aguardando pagamento");
    expect(hits[0]?.subsystem).toBe("payments");
  });
});
