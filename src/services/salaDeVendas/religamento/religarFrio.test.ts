/**
 * O ENSAIO NÃO ESCREVE — provado com banco falso que ACUSA qualquer escrita.
 *
 * O banco abaixo não é um mock que sempre passa: toda operação que não seja
 * `count` **lança**. Se um dia alguém puser uma escrita no caminho do ensaio, o
 * teste não fica verde com um número errado — ele quebra apontando a operação.
 */

import { describe, it, expect } from "vitest";
import { religarConscienciaDoFrio, AVISO_DO_ENSAIO } from "./religarFrio";

function bancoQueAcusaEscrita(contagens: { semEmpresa: number; comSelo: number }) {
  const chamadas: string[] = [];
  const proibir = (nome: string) => () => {
    throw new Error(`ESCRITA NO ENSAIO: ${nome}`);
  };

  const siteLead = {
    count: async (args: { where?: { empresaId?: unknown; stage?: unknown } }) => {
      chamadas.push("siteLead.count");
      return args?.where?.stage === "NOVO" ? contagens.comSelo : contagens.semEmpresa;
    },
    create: proibir("siteLead.create"),
    update: proibir("siteLead.update"),
    updateMany: proibir("siteLead.updateMany"),
    upsert: proibir("siteLead.upsert"),
    findMany: proibir("siteLead.findMany"),
  };

  return {
    banco: { siteLead } as never,
    chamadas,
  };
}

describe("o religamento em ENSAIO", () => {
  it("conta e não escreve — nenhuma operação além de `count` é sequer chamada", async () => {
    const { banco, chamadas } = bancoQueAcusaEscrita({ semEmpresa: 6283, comSelo: 750 });

    const r = await religarConscienciaDoFrio(banco, { gravar: false });

    expect(r.gravou).toBe(false);
    expect(r.antes.semEmpresaLigada).toBe(6283);
    expect(r.antes.comSeloDeNovoLead).toBe(750);
    if (r.gravou === false) expect(r.aviso).toBe(AVISO_DO_ENSAIO);
    expect(chamadas).toEqual(["siteLead.count", "siteLead.count"]);
  });

  it("ensaio é o PADRÃO: sem opção nenhuma, não grava", async () => {
    const { banco } = bancoQueAcusaEscrita({ semEmpresa: 1, comSelo: 1 });
    const r = await religarConscienciaDoFrio(banco);
    expect(r.gravou).toBe(false);
  });
});
