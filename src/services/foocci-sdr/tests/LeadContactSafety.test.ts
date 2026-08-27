/**
 * O portão de contato do SDR da Foocci — as duas metades de cada trava.
 *
 * Cada bloco prova DUAS coisas, porque uma só não prova nada:
 *   1. a trava reprova o caso que ela existe para reprovar;
 *   2. o caso legítimo AINDA PASSA — senão bastaria reprovar sempre, e um portão
 *      que reprova tudo é indistinguível de um portão quebrado.
 *
 * A trava que dá nome ao arquivo é a primeira: **não sei = NÃO**. Ela é a resposta
 * ao P0 de `docs/sdr-foocci-desenho.md` — o portão do CRM aprovava por omissão
 * quando não havia `customerId`, e um lead do site nunca tem um.
 */

import { describe, it, expect } from "vitest";
import {
  avaliarContatoDeLead,
  bloqueioPassaSozinho,
  foraDaJanela,
  agendaLocal,
  telefonePlausivel,
  REGRA,
  type LeadSafetyInput,
} from "../LeadContactSafety";

/** Quarta-feira, 5 de junho de 2026, 12h em São Paulo (15h UTC). */
const QUARTA_MEIO_DIA = new Date("2026-06-03T15:00:00Z");

function base(over: Partial<LeadSafetyInput> = {}): LeadSafetyInput {
  return {
    telefone: "+5511999990000",
    optOutAt: null,
    consentimentoEm: new Date("2026-06-01T12:00:00Z"), // 2 dias antes
    tentativas: 0,
    ultimoContatoEm: null,
    historicoConhecido: true,
    canalPronto: true,
    agora: QUARTA_MEIO_DIA,
    ...over,
  };
}

describe("não sei = NÃO — a armadilha que o portão do CRM tinha", () => {
  it("REPROVA quando o histórico não foi apurado, mesmo com tudo zerado", () => {
    const d = avaliarContatoDeLead(base({ historicoConhecido: false }));
    expect(d.sendable).toBe(false);
    expect(d.reason).toBe("HISTORICO_DESCONHECIDO");
  });

  it("REPROVA quando não há registro de consentimento", () => {
    const d = avaliarContatoDeLead(base({ consentimentoEm: null }));
    expect(d.reason).toBe("CONSENTIMENTO_DESCONHECIDO");
  });

  it("a outra metade: com histórico apurado e consentimento registrado, libera", () => {
    const d = avaliarContatoDeLead(base());
    expect(d.sendable).toBe(true);
    expect(d.reason).toBeNull();
  });
});

describe("silêncio pedido é inviolável e vem primeiro", () => {
  it("REPROVA quem pediu para parar", () => {
    const d = avaliarContatoDeLead(base({ optOutAt: new Date("2026-05-01T00:00:00Z") }));
    expect(d.reason).toBe("LEAD_OPT_OUT");
  });

  it("nenhum outro motivo encobre o opt-out — nem falta de telefone, nem horário", () => {
    // Se a ordem estivesse errada, o log diria "fora do horário" para alguém que
    // pediu silêncio, e a fila tentaria de novo às 9h da manhã seguinte.
    const d = avaliarContatoDeLead(base({
      optOutAt: new Date("2026-05-01T00:00:00Z"),
      telefone: null,
      historicoConhecido: false,
      agora: new Date("2026-06-03T05:00:00Z"), // 2h da manhã em SP
    }));
    expect(d.reason).toBe("LEAD_OPT_OUT");
  });

  it("e o opt-out NUNCA passa sozinho com o tempo", () => {
    expect(bloqueioPassaSozinho("LEAD_OPT_OUT")).toBe(false);
    expect(bloqueioPassaSozinho("FORA_DA_JANELA")).toBe(true);
  });
});

describe("insistência — teto duro de uma abertura e um lembrete", () => {
  it("REPROVA na terceira tentativa", () => {
    const d = avaliarContatoDeLead(base({ tentativas: REGRA.maxTentativas }));
    expect(d.reason).toBe("TETO_DE_TENTATIVAS");
    expect(d.detail).toContain(String(REGRA.maxTentativas));
  });

  it("o lembrete (2ª tentativa) ainda passa, respeitado o descanso", () => {
    const d = avaliarContatoDeLead(base({
      tentativas: 1,
      ultimoContatoEm: new Date("2026-05-30T12:00:00Z"), // 4 dias antes
    }));
    expect(d.sendable).toBe(true);
  });

  it("REPROVA o lembrete cedo demais — descanso de 48h", () => {
    const d = avaliarContatoDeLead(base({
      tentativas: 1,
      ultimoContatoEm: new Date("2026-06-03T09:00:00Z"), // 6h antes
    }));
    expect(d.reason).toBe("DESCANSO_ATIVO");
  });
});

describe("consentimento tem prazo — 90 dias", () => {
  it("REPROVA um formulário de oito meses", () => {
    const d = avaliarContatoDeLead(base({ consentimentoEm: new Date("2025-10-01T12:00:00Z") }));
    expect(d.reason).toBe("CONSENTIMENTO_VENCIDO");
  });

  it("no limite do prazo ainda passa; um dia depois, não", () => {
    const dentro = new Date(QUARTA_MEIO_DIA.getTime() - (REGRA.consentimentoDias - 1) * 86_400_000);
    const fora = new Date(QUARTA_MEIO_DIA.getTime() - (REGRA.consentimentoDias + 1) * 86_400_000);
    expect(avaliarContatoDeLead(base({ consentimentoEm: dentro })).sendable).toBe(true);
    expect(avaliarContatoDeLead(base({ consentimentoEm: fora })).reason).toBe("CONSENTIMENTO_VENCIDO");
  });

  it("data no futuro é dado corrompido, não consentimento novíssimo", () => {
    const d = avaliarContatoDeLead(base({ consentimentoEm: new Date("2027-01-01T00:00:00Z") }));
    expect(d.reason).toBe("CONSENTIMENTO_DESCONHECIDO");
  });
});

describe("janela de abordagem — 9h às 20h, dias úteis, horário de São Paulo", () => {
  it("o fuso é de São Paulo, não do servidor", () => {
    // 23h UTC de quarta = 20h em SP → fora. Se alguém trocasse por getHours()
    // no servidor (UTC), este caso passaria a liberar às 20h da noite.
    expect(agendaLocal(new Date("2026-06-03T23:00:00Z")).hora).toBe(20);
    expect(foraDaJanela(new Date("2026-06-03T23:00:00Z"))).toBe(true);
  });

  it("REPROVA de madrugada e no fim de semana", () => {
    expect(avaliarContatoDeLead(base({ agora: new Date("2026-06-03T05:00:00Z") })).reason).toBe("FORA_DA_JANELA");
    // Sábado, 6 de junho de 2026, meio-dia em SP.
    expect(avaliarContatoDeLead(base({ agora: new Date("2026-06-06T15:00:00Z") })).reason).toBe("FORA_DA_JANELA");
  });

  it("⭐ a última hora atendida é a das 19h — às 20h a Sala fecha", () => {
    // ── A FRONTEIRA MUDOU EM 27/08/2026 ────────────────────────────────────
    //
    // Decisão do CEO: *"a gente não pode colocar os agentes falando com as
    // pessoas depois das oito da noite. Faz um intervalo das nove da manhã às
    // oito da noite."*
    //
    // Antes disto o limite era 19h — e havia uma discordância silenciosa: o
    // banco já guardava `horaFim: 20` como padrão e o código usava 19. Dois
    // números que discordam não aparecem em teste nenhum; aparecem num cliente
    // que escreveu às 19h30 e não foi respondido.
    //
    // ⚠️ A fronteira é onde moram os erros de um-a-mais, e os DOIS lados dela
    // estão guardados de propósito: 19h dentro, 20h fora. Só o primeiro
    // passaria com `fimHora: 21`; só o segundo passaria com 20. Juntos, fixam
    // o número.

    // 22h UTC = 19h SP (sexta 5/6/2026) → DENTRO. É a última hora de trabalho.
    expect(
      avaliarContatoDeLead(base({ agora: new Date("2026-06-05T22:00:00Z") })).sendable,
      "19h deveria ser atendido — é a última hora da janela",
    ).toBe(true);

    // 23h UTC = 20h SP → FORA. Às oito em ponto ninguém atende mais.
    expect(
      avaliarContatoDeLead(base({ agora: new Date("2026-06-05T23:00:00Z") })).reason,
      "20h deveria estar fechado",
    ).toBe("FORA_DA_JANELA");

    // E a abertura, que não mudou: 8h fora, 9h dentro.
    expect(avaliarContatoDeLead(base({ agora: new Date("2026-06-05T11:00:00Z") })).reason).toBe(
      "FORA_DA_JANELA",
    );
    expect(avaliarContatoDeLead(base({ agora: new Date("2026-06-05T12:00:00Z") })).sendable).toBe(
      true,
    );
  });
});

describe("entregabilidade e canal", () => {
  it("REPROVA sem telefone, com telefone improvável, e com canal desligado", () => {
    expect(avaliarContatoDeLead(base({ telefone: null })).reason).toBe("LEAD_SEM_TELEFONE");
    expect(avaliarContatoDeLead(base({ telefone: "  " })).reason).toBe("LEAD_SEM_TELEFONE");
    expect(avaliarContatoDeLead(base({ telefone: "12345" })).reason).toBe("LEAD_TELEFONE_INVALIDO");
    expect(avaliarContatoDeLead(base({ canalPronto: false })).reason).toBe("CANAL_INDISPONIVEL");
  });

  it("telefonePlausivel aceita o formato brasileiro com e sem DDI", () => {
    expect(telefonePlausivel("+55 11 99999-0000")).toBe(true);
    expect(telefonePlausivel("1199990000")).toBe(true);
    expect(telefonePlausivel("999")).toBe(false);
    expect(telefonePlausivel(null)).toBe(false);
  });
});

// ── A MEIA-NOITE, e o defeito que só o CI viu ────────────────────────────────
//
// 26/08/2026. Um teste da ponte do TA passou na máquina de desenvolvimento e
// reprovou no CI, na mesma data e no mesmo código. A causa: `hour12: false` não
// fixa o ciclo horário, e o motor escolhe entre 00–23 e 01–24 conforme a versão
// do ICU que veio com o Node. À meia-noite, um devolve 0 e o outro devolve 24.
//
// O estrago mora justo em quem configura a janela até as 24: `24 >= 24` fecha o
// canal, e só na virada do dia. Ninguém acharia isso lendo o código.

describe("a meia-noite é hora ZERO, em qualquer motor", () => {
  // 00:00 em São Paulo (UTC-3, sem horário de verão desde 2019).
  const MEIA_NOITE = new Date("2026-08-25T03:00:00Z");

  it("devolve 0, e nunca 24", () => {
    expect(agendaLocal(MEIA_NOITE).hora).toBe(0);
  });

  it("uma janela de 24 horas cobre a meia-noite", () => {
    // A metade que importa: era ESTE o caso que reprovava, e ele reprovava
    // dizendo apenas "esperava true, recebeu false".
    expect(foraDaJanela(MEIA_NOITE, { inicioHora: 0, fimHora: 24 })).toBe(false);
  });

  it("e a janela comercial continua excluindo a madrugada", () => {
    // Sem esta, um `hora` sempre 0 passaria no caso acima e abriria a
    // madrugada para o robô — a proteção que a janela existe para dar.
    expect(foraDaJanela(MEIA_NOITE)).toBe(true);
  });

  it("as 23h continuam sendo 23 — o ciclo não deslocou nada", () => {
    expect(agendaLocal(new Date("2026-08-26T02:00:00Z")).hora).toBe(23);
  });
});
