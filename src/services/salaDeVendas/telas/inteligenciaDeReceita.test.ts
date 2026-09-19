/**
 * AS MEDIÇÕES DO REVENUE SUPERVISOR (peça 13).
 *
 * ⛔ **O teste mais importante deste arquivo é o que prova que a META NÃO SAI
 * COM NÚMERO.** O desenho traz "Meta do mês R$ 600.000", "Previsão R$ 560.000"
 * e "80% da meta atingida" — três números que só existem no desenho. Se alguém
 * um dia projetar a meta a partir do ritmo do mês, estes testes caem, e é para
 * isso que eles existem: a projeção sairia daqui parecendo medição e viraria
 * decisão de dinheiro na mesa do CEO.
 */

import { describe, it, expect } from "vitest";
import { bancoDeProva } from "../bancoDeProva";
import { REGUA_DE_CHURN } from "../crm/posVenda";
import {
  clientesEmRisco,
  reativacoes,
  receitaAoLongoDoMes,
  reunioesDoPeriodo,
} from "./inteligenciaDeReceita";

const DE = new Date("2026-09-01T00:00:00Z");
const ATE = new Date("2026-09-11T00:00:00Z");
const P = { de: DE, ate: ATE };

/** `as never` é o casting que os testes desta pasta já usam para o banco de prova. */
const db = (d: Parameters<typeof bancoDeProva>[0]) => bancoDeProva(d) as never;

describe("⛔ a meta e a previsão NÃO têm fonte, e saem dizendo isso", () => {
  it("meta e previsão são sempre 'não medido', com o motivo escrito", async () => {
    const r = await receitaAoLongoDoMes(db({ leadProposta: [] }), P);

    expect(r.meta.medido).toBe(false);
    expect(r.meta.medido === false && r.meta.motivo).toContain("não existe cadastro de meta de receita");
    expect(r.previsao.medido).toBe(false);
    // A previsão cai junto: projetar contra um alvo que não existe é inventar o alvo.
    expect(r.previsao.medido === false && r.previsao.motivo).toContain("meta");
  });
});

describe("receita ao longo do mês: a curva é acumulada, e o que fechou sem preço fica visível", () => {
  it("acumula por dia e não deixa a curva cair", async () => {
    const r = await receitaAoLongoDoMes(
      db({
        leadProposta: [
          { id: "1", situacao: "ACEITA", respondidaEm: new Date("2026-09-02T10:00:00Z"), valorMensalCent: 30_000 },
          { id: "2", situacao: "ACEITA", respondidaEm: new Date("2026-09-05T10:00:00Z"), valorMensalCent: 20_000 },
          // Recusada: não entra.
          { id: "3", situacao: "RECUSADA", respondidaEm: new Date("2026-09-06T10:00:00Z"), valorMensalCent: 99_000 },
        ],
      }),
      P,
    );

    expect(r.pontos).toHaveLength(10);
    expect(r.pontos[0]!.acumuladoCents).toBe(0);
    expect(r.pontos[1]!.acumuladoCents).toBe(30_000);
    // O dia 3 e o 4 não tiveram venda: a curva SEGURA o acumulado, não zera.
    expect(r.pontos[3]!.acumuladoCents).toBe(30_000);
    expect(r.pontos[4]!.acumuladoCents).toBe(50_000);
    expect(r.pontos[9]!.acumuladoCents).toBe(50_000);
  });

  it("⚠️ proposta aceita SEM valor não vira zero na curva — sai contada à parte", async () => {
    const r = await receitaAoLongoDoMes(
      db({
        leadProposta: [
          { id: "1", situacao: "ACEITA", respondidaEm: new Date("2026-09-02T10:00:00Z"), valorMensalCent: 30_000 },
          { id: "2", situacao: "ACEITA", respondidaEm: new Date("2026-09-03T10:00:00Z"), valorMensalCent: null },
          { id: "3", situacao: "ACEITA", respondidaEm: new Date("2026-09-04T10:00:00Z"), valorMensalCent: null },
        ],
      }),
      P,
    );

    // Somá-las como zero achataria a linha e diria "fechou e não entrou dinheiro".
    expect(r.pontos[9]!.acumuladoCents).toBe(30_000);
    expect(r.aceitasSemValor).toBe(2);
  });
});

describe("reuniões: o compromisso pertence ao mês em que acontece", () => {
  it("conta pelo `comecaEm` e deixa à mostra quem ficou sem desfecho", async () => {
    const r = await reunioesDoPeriodo(
      db({
        leadCompromisso: [
          { id: "1", comecaEm: new Date("2026-09-02T10:00:00Z"), situacao: "REALIZADO" },
          { id: "2", comecaEm: new Date("2026-09-03T10:00:00Z"), situacao: "NAO_COMPARECEU" },
          { id: "3", comecaEm: new Date("2026-09-04T10:00:00Z"), situacao: "MARCADO" },
          // Fora da janela.
          { id: "4", comecaEm: new Date("2026-10-04T10:00:00Z"), situacao: "REALIZADO" },
        ],
      }),
      P,
    );

    expect(r.marcadas).toBe(3);
    expect(r.realizadas).toBe(1);
    expect(r.naoCompareceram).toBe(1);
    // Agenda cheia de compromissos que ninguém fechou depois não é operação
    // saudável: é agenda sem retorno de informação.
    expect(r.semDesfecho).toBe(1);
  });
});

describe("⛔ reativações: não há trilha da transição, e o cartão diz isso", () => {
  it("reativados é sempre 'não medido'; o vizinho que existe vem junto", async () => {
    const r = await reativacoes(
      db({
        cliente: [
          { id: "1", situacao: "INATIVO" },
          { id: "2", situacao: "INATIVO" },
          { id: "3", situacao: "ATIVO" },
        ],
      }),
    );

    expect(r.reativados.medido).toBe(false);
    expect(r.reativados.medido === false && r.reativados.motivo).toContain("TRANSIÇÃO");
    // Candidatas a reativar — que é outra coisa, e está rotulada como outra coisa.
    expect(r.aReativar).toBe(2);
  });
});

describe("clientes em risco: a régua é a da casa, e o que ninguém avaliou aparece", () => {
  it("usa o mesmo limiar que move a conta para EM_RISCO", async () => {
    const r = await clientesEmRisco(
      db({
        cliente: [
          { id: "1", situacao: "ATIVO", riscoDeChurn: REGUA_DE_CHURN.limiarDeRisco },
          { id: "2", situacao: "ATIVO", riscoDeChurn: 90 },
          { id: "3", situacao: "ATIVO", riscoDeChurn: 10 },
          // Nunca avaliada: NÃO é uma conta sem risco.
          { id: "4", situacao: "ATIVO", riscoDeChurn: null },
          { id: "5", situacao: "ATIVO", riscoDeChurn: null },
          // Cancelada: fora da base viva.
          { id: "6", situacao: "CANCELADO", riscoDeChurn: 100 },
        ],
      }),
    );

    expect(r.limiar).toBe(REGUA_DE_CHURN.limiarDeRisco);
    expect(r.emRisco).toBe(2);
    // "2 em risco" sobre 2 não avaliadas é "2 encontrados", não "2 existem".
    expect(r.semAvaliacao).toBe(2);
    expect(r.total).toBe(5);
  });
});
