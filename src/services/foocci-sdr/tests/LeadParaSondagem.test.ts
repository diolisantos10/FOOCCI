/**
 * O dado da porta chegando à conversa.
 *
 * Contra o código antigo, TODOS estes reprovam: não existia uma única linha
 * ligando `SiteLead` a `EstadoDaSondagem`. O que se prova aqui é o contrato que
 * torna a ligação segura — só o que a pessoa escreveu, nada deduzido, e reenvio
 * não apaga entrevista em andamento.
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  sondagemDoLead,
  semearEntrevistaDoLead,
  chaveDaEntrevistaDoLead,
  clienteIdDoLead,
} from "../LeadParaSondagem";
import {
  resolverMemoriaDaEntrevista,
  resetMemoriaDaEntrevista,
} from "@/services/brain/sdr/MemoriaDaEntrevista";

const LEAD = {
  id: "l1",
  codigo: "A7K2M",
  restaurante: "Cantina da Vila",
  cidade: "Sorocaba",
  tipo: "Pizzaria",
  desafio: "Cliente não volta",
};

beforeEach(() => resetMemoriaDaEntrevista());

describe("o que o formulário respondeu, o SDR não pergunta de novo", () => {
  it("restaurante e tipo viram o que ele vende", () => {
    const e = sondagemDoLead(LEAD);
    expect(e.ficha?.o_que_vende).toContain("Cantina da Vila");
    expect(e.ficha?.o_que_vende).toContain("Pizzaria");
    expect(e.perguntadas).toContain("o_que_vende");
  });

  it("cidade vira região e o desafio vira objetivo", () => {
    const e = sondagemDoLead(LEAD);
    expect(e.ficha?.regiao).toContain("Sorocaba");
    expect(e.ficha?.objetivo).toContain("Cliente não volta");
  });

  it("todo valor carrega a fonte — quem lê sabe que é fala do cliente", () => {
    const e = sondagemDoLead(LEAD);
    for (const v of Object.values(e.ficha ?? {})) expect(v).toMatch(/formul[áa]rio do site/i);
  });
});

describe("o que NÃO se deduz", () => {
  it("quem preencheu o formulário NÃO é declarado como quem decide", () => {
    const e = sondagemDoLead({ ...LEAD });
    expect(e.ficha?.quem_decide).toBeUndefined();
    expect(e.perguntadas).not.toContain("quem_decide");
  });

  it("campo vazio não vira campo preenchido nem pergunta feita", () => {
    const e = sondagemDoLead({ id: "l2", codigo: "B1", restaurante: "  ", cidade: null, tipo: "", desafio: null });
    expect(e.ficha).toEqual({});
    expect(e.perguntadas).toEqual([]);
  });

  it("desafio ausente não é declarado como perguntado — o formulário nem sempre mostra o campo", () => {
    const e = sondagemDoLead({ id: "l3", codigo: "C1", cidade: "Bauru" });
    expect(e.perguntadas).toEqual(["regiao"]);
  });
});

describe("a gravação", () => {
  it("semeia a entrevista com a chave ligada ao #código do lead", async () => {
    expect(await semearEntrevistaDoLead(LEAD)).toBe("SEMEADA");
    const memoria = await resolverMemoriaDaEntrevista();
    const guardado = await memoria.ler(chaveDaEntrevistaDoLead(LEAD));
    expect(guardado?.ficha?.regiao).toContain("Sorocaba");
    expect(clienteIdDoLead(LEAD)).toBe("lead-a7k2m");
  });

  it("reenvio do formulário NÃO sobrescreve a entrevista em andamento", async () => {
    const memoria = await resolverMemoriaDaEntrevista();
    await memoria.gravar(chaveDaEntrevistaDoLead(LEAD), {
      ficha: { objetivo: "o que o SDR já apurou na conversa" },
      perguntadas: ["objetivo", "publico"],
      servicos: [],
    });

    expect(await semearEntrevistaDoLead(LEAD)).toBe("JA_EXISTIA");
    const depois = await memoria.ler(chaveDaEntrevistaDoLead(LEAD));
    expect(depois?.ficha?.objetivo).toBe("o que o SDR já apurou na conversa");
    expect(depois?.perguntadas).toContain("publico");
  });

  it("lead sem nenhum campo aproveitável declara SEM_DADO — nunca sucesso silencioso", async () => {
    expect(await semearEntrevistaDoLead({ id: "l9", codigo: "Z9" })).toBe("SEM_DADO");
  });

  it("a entrevista de venda não é a de restaurante nenhum", () => {
    expect(chaveDaEntrevistaDoLead(LEAD).startsWith("foocci-vendas::")).toBe(true);
  });
});
