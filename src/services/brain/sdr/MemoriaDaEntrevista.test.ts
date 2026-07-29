import { describe, it, expect, beforeEach } from "vitest";

import {
  chaveDaEntrevista,
  resolverMemoriaDaEntrevista,
  resetMemoriaDaEntrevista,
  setMemoriaDaEntrevista,
  type MemoriaDaEntrevista,
} from "./MemoriaDaEntrevista";
import type { EstadoDaSondagem } from "../oficina/Sondagem";

beforeEach(() => resetMemoriaDaEntrevista());

const ESTADO: EstadoDaSondagem = {
  ficha: { objetivo: "vender mais no almoço" },
  perguntadas: ["publico"],
  servicos: [{ chave: "reels", origemDoInsumo: "cliente", quemExecuta: "a dona" }],
};

describe("a entrevista sobrevive entre turnos", () => {
  it("grava e lê o estado inteiro", async () => {
    const m = await resolverMemoriaDaEntrevista();
    await m.gravar("a::b", ESTADO);
    expect(await m.ler("a::b")).toEqual(ESTADO);
  });

  it("entrevista que nunca existiu devolve null, não estado vazio", async () => {
    const m = await resolverMemoriaDaEntrevista();
    expect(await m.ler("nunca::existiu")).toBeNull();
  });

  it("o registro do que foi perguntado atravessa a gravação", async () => {
    const m = await resolverMemoriaDaEntrevista();
    await m.gravar("a::b", ESTADO);
    expect((await m.ler("a::b"))?.perguntadas).toContain("publico");
  });

  it("gravar de novo substitui, não acumula", async () => {
    const m = await resolverMemoriaDaEntrevista();
    await m.gravar("a::b", ESTADO);
    await m.gravar("a::b", { ...ESTADO, perguntadas: ["publico", "regiao"] });
    expect((await m.ler("a::b"))?.perguntadas).toEqual(["publico", "regiao"]);
  });

  it("mexer no objeto depois de gravar não muda o que está guardado", async () => {
    const m = await resolverMemoriaDaEntrevista();
    const vivo: EstadoDaSondagem = { ficha: { objetivo: "original" }, perguntadas: [], servicos: [] };
    await m.gravar("a::b", vivo);
    vivo.ficha!.objetivo = "adulterado";
    vivo.perguntadas!.push("intruso");
    const lido = await m.ler("a::b");
    expect(lido?.ficha?.objetivo).toBe("original");
    expect(lido?.perguntadas).toEqual([]);
  });

  it("apagar remove", async () => {
    const m = await resolverMemoriaDaEntrevista();
    await m.gravar("a::b", ESTADO);
    await m.apagar("a::b");
    expect(await m.ler("a::b")).toBeNull();
  });
});

describe("isolamento entre agências", () => {
  it("a chave separa agência de cliente", () => {
    expect(chaveDaEntrevista("ag1", "Padaria do João")).toBe("ag1::padaria do joão");
    expect(chaveDaEntrevista("ag1", "x")).not.toBe(chaveDaEntrevista("ag2", "x"));
  });

  it("uma agência não lê a entrevista da outra", async () => {
    const m = await resolverMemoriaDaEntrevista();
    await m.gravar(chaveDaEntrevista("ag1", "cliente"), ESTADO);
    expect(await m.ler(chaveDaEntrevista("ag2", "cliente"))).toBeNull();
  });
});

describe("a porta", () => {
  it("override explícito ganha de tudo", async () => {
    const falsa: MemoriaDaEntrevista = {
      ler: async () => ({ ficha: { objetivo: "da porta falsa" } }),
      gravar: async () => {},
      apagar: async () => {},
    };
    setMemoriaDaEntrevista(falsa);
    const m = await resolverMemoriaDaEntrevista();
    expect((await m.ler("qualquer"))?.ficha?.objetivo).toBe("da porta falsa");
  });

  it("reset volta pra memória limpa e sem override", async () => {
    const m = await resolverMemoriaDaEntrevista();
    await m.gravar("a::b", ESTADO);
    resetMemoriaDaEntrevista();
    expect(await (await resolverMemoriaDaEntrevista()).ler("a::b")).toBeNull();
  });
});
