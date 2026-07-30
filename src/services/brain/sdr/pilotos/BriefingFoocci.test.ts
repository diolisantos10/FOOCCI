/**
 * O briefing da Foocci passa pela mesma régua de qualquer cliente.
 *
 * O valor deste teste não é "o arquivo compila": é impedir os dois jeitos de
 * estragar um briefing sem ninguém perceber — inventar um campo que a ficha
 * não tem, e deixar essencial sem nem perguntar. Os dois passariam batido numa
 * revisão de olho; aqui quebram.
 */

import { describe, it, expect } from "vitest";

import {
  avaliarSondagem,
  CAMPOS_DA_FICHA,
  CATALOGO_DE_SERVICOS,
} from "../../oficina/Sondagem";
import { gerarPlano } from "../PlanoDeMidia";
import {
  briefingFoocci,
  PENDENTES,
  RESPOSTAS,
  SEGUNDO_CICLO,
  SERVICOS,
} from "./BriefingFoocci";

const HOJE = new Date("2026-07-30T12:00:00Z");
const CHAVES_DA_FICHA = new Set(CAMPOS_DA_FICHA.map((c) => c.chave));

describe("briefing da Foocci — nada inventado", () => {
  it("toda resposta cai num campo que a ficha realmente tem", () => {
    const forasteiras = Object.keys(RESPOSTAS).filter((c) => !CHAVES_DA_FICHA.has(c));
    expect(forasteiras, `campo que não existe na ficha: ${forasteiras.join(", ")}`).toEqual([]);
  });

  it("toda resposta aponta para uma fonte", () => {
    for (const [chave, r] of Object.entries(RESPOSTAS)) {
      expect(r.valor.trim().length, `${chave} sem valor`).toBeGreaterThan(0);
      expect(r.fonte.trim().length, `${chave} sem fonte`).toBeGreaterThan(0);
    }
  });

  it("pendência é campo real e não está respondido ao mesmo tempo", () => {
    for (const p of PENDENTES) {
      expect(CHAVES_DA_FICHA.has(p.chave), `${p.chave} não existe na ficha`).toBe(true);
      expect(RESPOSTAS[p.chave], `${p.chave} está em PENDENTES e em RESPOSTAS`).toBeUndefined();
      expect(p.porqueNaoSei.trim().length).toBeGreaterThan(0);
    }
  });

  it("nenhum campo essencial ficou sem ser perguntado", () => {
    const avaliacao = avaliarSondagem(briefingFoocci());
    expect(
      avaliacao.naoPerguntado.filter((p) => p.essencial).map((p) => p.chave),
      "essencial que ninguém perguntou — é o pecado que a Sondagem existe para pegar",
    ).toEqual([]);
  });
});

describe("briefing da Foocci — os serviços do lançamento", () => {
  it("todo serviço contratado existe no catálogo", () => {
    for (const s of SERVICOS) {
      expect(CATALOGO_DE_SERVICOS.some((c) => c.chave === s.chave), `${s.chave} fora do catálogo`).toBe(true);
    }
  });

  it("todo serviço tem origem do insumo definida e nada pendente", () => {
    const avaliacao = avaliarSondagem(briefingFoocci());
    for (const s of avaliacao.servicos) {
      expect(s.origemDoInsumo, `${s.nome} sem origem — o plano prometeria material sem dono`).not.toBeNull();
      expect(s.pendencias.map((p) => p.chave), `${s.nome} com pendência`).toEqual([]);
    }
  });

  it("story é o único que depende de material do cliente, e tem dono declarado", () => {
    const story = SERVICOS.find((s) => s.chave === "story");
    expect(story?.origemDoInsumo).toBe("misto");
    expect(story?.quemExecuta?.trim().length ?? 0).toBeGreaterThan(0);
  });

  it("o que ficou para o segundo ciclo está fora do contratado, não escondido dentro", () => {
    for (const s of SEGUNDO_CICLO) {
      expect(CATALOGO_DE_SERVICOS.some((c) => c.chave === s.chave)).toBe(true);
      expect(SERVICOS.some((c) => c.chave === s.chave), `${s.chave} não devia estar contratado`).toBe(false);
      expect(s.falta.trim().length).toBeGreaterThan(0);
    }
  });
});

describe("briefing da Foocci — a proposta pode sair", () => {
  it("libera a proposta e declara o que falta em vez de esconder", () => {
    const avaliacao = avaliarSondagem(briefingFoocci());
    expect(avaliacao.podePropor).toBe(true);
    expect(avaliacao.aguardandoCliente.map((p) => p.chave).sort()).toEqual(
      PENDENTES.map((p) => p.chave).sort(),
    );
  });

  it("o plano nasce na segunda do lançamento, com data em toda linha", () => {
    const plano = gerarPlano({ estado: briefingFoocci(), semanas: 4, hoje: HOJE });
    expect(plano.liberado).toBe(true);
    expect(plano.inicio).toBe("2026-08-03");
    expect(plano.linhas.length).toBeGreaterThan(0);
    for (const l of plano.linhas) {
      expect(l.data >= "2026-08-03" && l.data <= (plano.fim ?? "")).toBe(true);
      expect(l.diaDaSemana.length).toBeGreaterThan(3);
    }
  });

  it("as peças que dependem do dono vêm marcadas e viram aviso", () => {
    const plano = gerarPlano({ estado: briefingFoocci(), semanas: 4, hoje: HOJE });
    const doCliente = plano.linhas.filter((l) => l.dependeDoCliente);
    expect(doCliente.length).toBeGreaterThan(0);
    expect(doCliente.every((l) => l.servico === "story")).toBe(true);
    expect(plano.avisos.some((a) => /dependem de material/i.test(a))).toBe(true);
  });

  it("as seis perguntas sem resposta vão impressas no rodapé", () => {
    const plano = gerarPlano({ estado: briefingFoocci(), semanas: 4, hoje: HOJE });
    expect(plano.pendenciasDeclaradas).toHaveLength(PENDENTES.length);
    expect(plano.avisos.some((a) => /sem resposta do cliente/i.test(a))).toBe(true);
  });

  it("legenda roda o período inteiro em vez de virar linha de calendário", () => {
    const plano = gerarPlano({ estado: briefingFoocci(), semanas: 4, hoje: HOJE });
    expect(plano.continuos.map((c) => c.servico)).toContain("legenda");
    expect(plano.linhas.some((l) => l.servico === "legenda")).toBe(false);
  });
});
