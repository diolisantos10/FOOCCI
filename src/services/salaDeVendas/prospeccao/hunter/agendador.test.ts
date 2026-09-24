/**
 * ⛔ A PROVA DE QUE A MÁQUINA ESTÁ LIGADA.
 *
 * O defeito que esta obra conserta não foi "faltava código de descoberta": foi
 * a fila vazia às 9h. Uma descoberta perfeita que ninguém chama deixaria a
 * rodada concluindo `filaAcabou` exatamente como antes — por isso o teste que
 * mais importa neste arquivo é o último: **alguém chama isto sozinho**.
 *
 * Nada aqui fala com a fonte aberta nem com banco de verdade.
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));

import {
  AgendadorDaDescoberta,
  ehHoraDaVarredura,
  horaDaVarredura,
  reservarVarreduraDoDia,
} from "./agendador";
import { horaDaRodada } from "../agendador";

// 24/09/2026 é quinta-feira. São Paulo é UTC-3.
const QUINTA_7H_SP = new Date("2026-09-24T10:00:00Z");
const QUINTA_7H30_SP = new Date("2026-09-24T10:30:00Z");
const QUINTA_9H_SP = new Date("2026-09-24T12:00:00Z");
const SABADO_7H_SP = new Date("2026-09-26T10:00:00Z");

afterEach(() => AgendadorDaDescoberta.stop());

describe("a hora da varredura", () => {
  it("7h de São Paulo por padrão; a variável troca; lixo volta ao padrão", () => {
    expect(horaDaVarredura({})).toBe(7);
    expect(horaDaVarredura({ FOOCCI_HUNTER_HORA: "6" })).toBe(6);
    expect(horaDaVarredura({ FOOCCI_HUNTER_HORA: "25" })).toBe(7);
    expect(horaDaVarredura({ FOOCCI_HUNTER_HORA: "cedo" })).toBe(7);
  });

  it("⭐ e ela é ANTES da rodada de abordagem — senão a fila só serve amanhã", () => {
    expect(horaDaVarredura({})).toBeLessThan(horaDaRodada({}));
  });

  it("é hora nos 60 minutos das 7h, em dia útil — e não fora deles", () => {
    expect(ehHoraDaVarredura(QUINTA_7H_SP, 7)).toBe(true);
    expect(ehHoraDaVarredura(QUINTA_7H30_SP, 7)).toBe(true);
    expect(ehHoraDaVarredura(QUINTA_9H_SP, 7)).toBe(false);
    expect(ehHoraDaVarredura(SABADO_7H_SP, 7)).toBe(false);
  });
});

/** Um `prospeccao_config` de mentira, com a reserva do jeito do Postgres. */
function bancoComConfig(
  inicial: { ultimaDescobertaAutomaticaEm: Date | null; ultimaDescobertaAutomaticaPor: string | null } | null,
) {
  const linha = inicial ? { ...inicial } : null;
  return {
    linha: () => linha,
    db: {
      prospeccaoConfig: {
        updateMany: vi.fn(
          async ({ where, data }: { where: { OR: Array<Record<string, unknown>> }; data: Record<string, unknown> }) => {
            if (!linha) return { count: 0 };
            const corte = (where.OR[1] as { ultimaDescobertaAutomaticaEm: { lt: Date } })
              .ultimaDescobertaAutomaticaEm.lt;
            const livre =
              linha.ultimaDescobertaAutomaticaEm === null ||
              linha.ultimaDescobertaAutomaticaEm < corte;
            if (!livre) return { count: 0 };
            linha.ultimaDescobertaAutomaticaEm = data.ultimaDescobertaAutomaticaEm as Date;
            linha.ultimaDescobertaAutomaticaPor = data.ultimaDescobertaAutomaticaPor as string;
            return { count: 1 };
          },
        ),
        findUnique: vi.fn(async () => linha),
      },
    } as never,
  };
}

describe("⛔ a reserva atômica — nunca duas varreduras no mesmo dia", () => {
  it("a primeira reserva; a segunda é recusada com o nome de quem levou", async () => {
    const { db } = bancoComConfig({ ultimaDescobertaAutomaticaEm: null, ultimaDescobertaAutomaticaPor: null });

    const primeira = await reservarVarreduraDoDia(db, QUINTA_7H_SP, "agendador interno");
    expect(primeira.reservou).toBe(true);

    const segunda = await reservarVarreduraDoDia(db, QUINTA_7H30_SP, "cron de contingência");
    expect(segunda.reservou).toBe(false);
    if (!segunda.reservou) {
      expect(segunda.motivo).toBe("jaVarreuHoje");
      expect(segunda.detalhe).toContain("agendador interno");
    }
  });

  it("sem configuração nenhuma, ninguém varre — e o motivo é dito", async () => {
    const { db } = bancoComConfig(null);
    const r = await reservarVarreduraDoDia(db, QUINTA_7H_SP, "agendador interno");
    expect(r.reservou).toBe(false);
    if (!r.reservou) expect(r.motivo).toBe("semConfiguracao");
  });
});

describe("o tique", () => {
  it("fora da hora não varre nada", async () => {
    const varrer = vi.fn();
    const { db } = bancoComConfig({ ultimaDescobertaAutomaticaEm: null, ultimaDescobertaAutomaticaPor: null });
    const t = await AgendadorDaDescoberta.tick({ agora: QUINTA_9H_SP, db, varrer: varrer as never, hora: 7 });
    expect(t.decisao).toBe("foraDaHora");
    expect(varrer).not.toHaveBeenCalled();
  });

  it("na hora, reserva e varre — e o resumo traz quantos entraram na fila", async () => {
    const { db } = bancoComConfig({ ultimaDescobertaAutomaticaEm: null, ultimaDescobertaAutomaticaPor: null });
    const varrer = vi.fn(async () => ({
      cidades: ["Goiânia"],
      cidadesQueFalharam: [],
      encontrados: 400,
      entraramNaFila: 41,
      descartes: {},
      importacaoId: "imp1",
    }));

    const t = await AgendadorDaDescoberta.tick({ agora: QUINTA_7H_SP, db, varrer: varrer as never, hora: 7 });

    expect(t.decisao).toBe("varreu");
    expect(t.varredura?.entraramNaFila).toBe(41);
    expect(varrer).toHaveBeenCalledTimes(1);
  });

  it("a varredura que quebra não apaga o rastro — a decisão é 'quebrou', com o detalhe", async () => {
    const { db } = bancoComConfig({ ultimaDescobertaAutomaticaEm: null, ultimaDescobertaAutomaticaPor: null });
    const varrer = vi.fn(async () => {
      throw new Error("a fonte caiu");
    });
    const t = await AgendadorDaDescoberta.tick({ agora: QUINTA_7H_SP, db, varrer: varrer as never, hora: 7 });
    expect(t.decisao).toBe("quebrou");
    expect(t.detalhe).toContain("a fonte caiu");
  });
});

/**
 * ⛔⛔ O TESTE QUE GUARDA O DEFEITO INTEIRO.
 *
 * Máquina construída e desligada é o defeito que esta casa mais repete: o
 * serviço existe, o teste passa, e a fila continua vazia porque nada dispara.
 * Estes dois testes reprovam exatamente essa versão — a que tem a descoberta
 * pronta e ninguém chamando.
 */
describe("⛔ alguém chama isto sozinho", () => {
  const raiz = join(__dirname, "..", "..", "..", "..", "..");

  it("o agendador é ligado no boot do servidor", () => {
    const boot = readFileSync(join(raiz, "src", "instrumentation.ts"), "utf8");
    expect(boot).toContain("hunter/agendador");
    // ⚠️ A CHAMADA, e não a menção. `toContain` casaria com a linha COMENTADA —
    // que é exatamente como um agendador é desligado sem ninguém perceber.
    expect(boot).toMatch(/^\s*AgendadorDaDescoberta\.start\(\);$/m);
  });

  it("e há um cron de contingência, agendado de verdade, chamando a rota", () => {
    const fluxo = readFileSync(join(raiz, ".github", "workflows", "prospeccao-descoberta.yml"), "utf8");
    expect(fluxo).toContain("/api/cron/prospeccao/descoberta");
    // ⚠️ `schedule` COMENTADO é o modo silencioso de desligar um cron. A linha
    // abaixo reprova exatamente isso: só passa com o agendamento vivo.
    expect(fluxo).toMatch(/^\s{4}- cron: "0 10 \* \* 1-5"$/m);
  });
});
