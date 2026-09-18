/**
 * ⛔ A MESMA PESSOA NÃO RECEBE DUAS VEZES — nem com dois lotes SIMULTÂNEOS.
 *
 * ── POR QUE DOIS LOTES AO MESMO TEMPO É O CASO QUE IMPORTA ──────────────────
 *
 * Um clique repetido, duas instâncias do app, dois comandos em sequência rápida
 * — foi exatamente assim que BUON GUSTO recebeu a mesma mensagem 16 vezes. O
 * defeito não é de descuido: é ler o estado e só depois escrever. Duas rodadas
 * leem o mesmo zero e mandam as duas.
 *
 * Este teste roda as duas rodadas DE VERDADE, entrelaçadas pelo `await`, contra
 * um banco que RECUSA a segunda gravação como o Postgres recusa. A trava usada
 * é `reservarEnvio`, a mesma que está em produção.
 */

import { describe, it, expect } from "vitest";
import { bancoDeProva } from "../bancoDeProva";
import { reservarEnvio } from "../travaDeRepeticao";
import { dispararUmLote } from "./executar";
import type { PortaDeEnvio, ResultadoDoEnvio } from "./portaDeEnvio";

type Linha = Record<string, unknown>;

const AGORA = new Date("2026-09-18T09:00:00.000Z");
const ANTES = new Date("2026-09-01T09:00:00.000Z");

const QUANTOS = 30;

function base() {
  const siteLead: Linha[] = [];
  const leadMensagem: Linha[] = [];
  for (let i = 1; i <= QUANTOS; i++) {
    const id = `lead-${i}`;
    const telefone = `5511${String(970000000 + i)}`;
    siteLead.push({
      id,
      nome: `Restaurante ${i}`,
      whatsapp: telefone,
      whatsappDigits: telefone,
      restaurante: `Restaurante ${i}`,
      stage: "DISPONIVEL_PARA_PROSPECCAO",
      optOutAt: null,
      empresaId: null,
      contatoId: null,
      fonte: "LISTA_PROSPECCAO",
    });
    leadMensagem.push({
      id: `m-${i}`,
      leadId: id,
      direcao: "SAIDA",
      ocorreuEm: ANTES,
      texto: "o panfleto antigo",
    });
  }
  return bancoDeProva({ siteLead, leadMensagem });
}

/** Registra TUDO que a Meta teria recebido. É esta lista que o teste audita. */
function portaQueRegistra(db: ReturnType<typeof bancoDeProva>) {
  const naMeta: Array<{ telefone: string; conteudo: string }> = [];

  const mandar = async (leadId: string, conteudo: string): Promise<ResultadoDoEnvio> => {
    const lead = (await db.siteLead.findUnique({ where: { id: leadId } })) as Linha | null;
    const telefone = (lead?.whatsapp as string) ?? "";

    const reserva = await reservarEnvio(db as never, {
      telefone,
      conteudo,
      natureza: "abordagem",
      leadId,
      origem: "teste de dois lotes simultâneos",
      agora: AGORA,
    });
    if (!reserva.liberado) {
      return { enviado: false, motivo: reserva.motivo, detalhe: reserva.detalhe };
    }

    naMeta.push({ telefone, conteudo });
    return { enviado: true, mensagemId: `m-${naMeta.length}` };
  };

  const porta: PortaDeEnvio = {
    aplicaTravaDeRepeticao: true,
    porTemplate: (leadId) => mandar(leadId, "foocci_contato_inicial_01|Restaurante"),
    naJanela: (leadId, texto) => mandar(leadId, texto),
  };

  return { porta, naMeta };
}

describe("⛔ ninguém recebe duas vezes", () => {
  it("dois lotes SIMULTÂNEOS: cada número recebe no máximo UMA mensagem", async () => {
    const db = base();
    const { porta, naMeta } = portaQueRegistra(db);

    // ⚠️ 1 ms de diferença é o caso RUIM de propósito: com o mesmo instante os
    // dois lotes teriam o mesmo `loteId` e a chave única da execução resolveria
    // sozinha. Com instantes diferentes, quem tem de segurar é a TRAVA.
    const [a, b] = await Promise.all([
      dispararUmLote(db as never, { porta, tamanho: QUANTOS, agora: AGORA, quemDisparou: "lote A" }),
      dispararUmLote(db as never, {
        porta,
        tamanho: QUANTOS,
        agora: new Date(AGORA.getTime() + 1),
        quemDisparou: "lote B",
      }),
    ]);

    const rodaram = [a, b].filter((r) => r.rodou).length;
    expect(rodaram, "pelo menos um dos dois tem de ter rodado").toBeGreaterThan(0);

    // ⭐ A prova: nenhum número aparece duas vezes na lista do que bateu na Meta.
    const porNumero = new Map<string, number>();
    for (const m of naMeta) porNumero.set(m.telefone, (porNumero.get(m.telefone) ?? 0) + 1);

    const repetidos = [...porNumero.entries()].filter(([, n]) => n > 1);
    console.info(
      `[dois lotes] mensagens na Meta: ${naMeta.length} | números distintos: ${porNumero.size} | repetidos: ${repetidos.length}`,
    );
    expect(repetidos).toEqual([]);
    expect(naMeta.length).toBeLessThanOrEqual(QUANTOS);

    // E a recusa NÃO é silêncio: ela fica escrita, com motivo.
    const recusas = db.tabelas.travaDeAbordagemRecusa;
    console.info(
      "[dois lotes] recusas registradas pela trava:",
      JSON.stringify([...new Set(recusas.map((r) => r.motivo))]),
    );
  }, 30_000);

  it("o mesmo texto para o mesmo número, duas vezes: a segunda é RECUSADA", async () => {
    const db = base();
    const pedido = {
      telefone: "5511970000001",
      conteudo: "Olá! Falo em nome do Foocci.",
      natureza: "abordagem" as const,
      origem: "teste",
      agora: AGORA,
    };

    const primeira = await reservarEnvio(db as never, pedido);
    expect(primeira.liberado).toBe(true);

    const segunda = await reservarEnvio(db as never, pedido);
    expect(segunda.liberado).toBe(false);
    if (!segunda.liberado) {
      // Dentro do intervalo mínimo, a trava do RITMO responde primeiro — e é
      // ela que dois processos simultâneos disputam.
      expect(["intervaloMinimo", "conteudoJaEnviado"]).toContain(segunda.motivo);
    }
    expect(db.tabelas.travaDeAbordagemRecusa.length).toBe(1);
  });

  it("⛔ nenhuma trava foi afrouxada para a campanha caber", async () => {
    const db = base();
    // 20h é o piso da casa. Um texto DIFERENTE para o mesmo número, no mesmo
    // dia, continua barrado — a campanha não ganhou exceção nenhuma.
    const primeira = await reservarEnvio(db as never, {
      telefone: "5511970000002",
      conteudo: "primeira abordagem",
      natureza: "abordagem",
      origem: "teste",
      agora: AGORA,
    });
    expect(primeira.liberado).toBe(true);

    const segunda = await reservarEnvio(db as never, {
      telefone: "5511970000002",
      conteudo: "outro texto, mesmo dia",
      natureza: "abordagem",
      origem: "teste",
      agora: new Date(AGORA.getTime() + 3 * 3_600_000),
    });
    expect(segunda.liberado).toBe(false);
    if (!segunda.liberado) expect(segunda.motivo).toBe("intervaloMinimo");
  });
});
