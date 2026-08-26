/**
 * O INTERRUPTOR DO TA — publicar, ligar, e as duas recusas que importam.
 *
 * ── O QUE ESTE ARQUIVO GUARDA ───────────────────────────────────────────────
 *
 * Este é o código que decide se um robô passa a falar com estranhos em nome da
 * empresa. Dois defeitos aqui seriam caros de jeitos opostos:
 *
 *   · **ligar sem ficha** — o agente ficaria "ligado" na tela e calado na
 *     conversa, e ninguém entenderia por quê;
 *   · **publicar em duplicata** — cada clique viraria uma versão nova, e o
 *     número da versão deixaria de significar alguma coisa.
 */

import { describe, it, expect, vi } from "vitest";
import { lerEstadoDoTA, publicarAFicha, ligarOTA } from "./interruptor";
import { VERSAO_1 } from "./ficha";

function banco(over: {
  config?: Record<string, unknown> | null;
  ultimaVersao?: { numero: number } | null;
} = {}) {
  const config =
    over.config === null
      ? null
      : {
          id: "c1",
          ligado: false,
          versaoAtivaId: null,
          versaoAtiva: null,
          horaInicio: 9,
          horaFim: 20,
          maxSemResposta: 3,
          ...over.config,
        };

  return {
    sdrIaConfig: {
      findUnique: vi.fn().mockResolvedValue(config),
      update: vi.fn().mockResolvedValue({}),
    },
    sdrIaConfigVersao: {
      findFirst: vi.fn().mockResolvedValue(over.ultimaVersao ?? null),
      // Devolve o número que foi PEDIDO, como o banco faz. Um dublê que devolve
      // sempre 1 esconderia exatamente o defeito que o caso da numeração
      // procura — e o teste passaria com o código errado.
      create: vi.fn().mockImplementation(
        async ({ data }: { data: { numero: number } }) => ({ id: "v9", numero: data.numero }),
      ),
    },
  };
}

describe("publicar a ficha", () => {
  it("cria a versão 1 e a torna ativa", async () => {
    const db = banco();
    const r = await publicarAFicha(db as never);

    expect(r).toMatchObject({ ok: true, numero: 1, jaEstava: false });

    const dados = db.sdrIaConfigVersao.create.mock.calls[0]![0]!.data;
    expect(dados.situacao).toBe("PUBLICADA");
    expect(dados.identidade).toBe(VERSAO_1.identidade);
    // A lista de proibições vai junto: uma versão publicada sem ela seria um
    // agente sem limite declarado.
    expect(dados.proibidos).toEqual(VERSAO_1.proibidos);
    expect(dados.gatilhos).toEqual(VERSAO_1.gatilhos);

    // E a versão criada vira a ativa — publicar sem apontar não publica nada.
    expect(db.sdrIaConfig.update.mock.calls[0]![0]!.data).toEqual({ versaoAtivaId: "v9" });
  });

  it("numera a partir da última, e não recomeça do 1", async () => {
    const db = banco({ ultimaVersao: { numero: 4 } });
    const r = await publicarAFicha(db as never);

    expect(r).toMatchObject({ ok: true, numero: 5 });
  });

  it("⭐ publicar a MESMA ficha de novo não cria versão nova", async () => {
    // Sem isto, um duplo clique na tela viraria "versão 2" sem nada ter mudado —
    // e o número da versão deixaria de significar alguma coisa.
    const db = banco({
      config: {
        versaoAtiva: {
          id: "v1",
          numero: 1,
          identidade: VERSAO_1.identidade,
          notaDaVersao: VERSAO_1.notaDaVersao,
        },
      },
    });

    const r = await publicarAFicha(db as never);

    expect(r).toMatchObject({ ok: true, numero: 1, jaEstava: true });
    expect(db.sdrIaConfigVersao.create).not.toHaveBeenCalled();
  });

  it("mas ficha DIFERENTE cria versão nova", async () => {
    // A metade que passa. Sem ela, uma comparação que sempre dissesse "igual"
    // congelaria a ficha para sempre — e ninguém notaria.
    const db = banco({
      config: { versaoAtiva: { id: "v1", numero: 1, identidade: "outra coisa", notaDaVersao: "x" } },
      ultimaVersao: { numero: 1 },
    });

    const r = await publicarAFicha(db as never);

    expect(r).toMatchObject({ ok: true, numero: 2, jaEstava: false });
    expect(db.sdrIaConfigVersao.create).toHaveBeenCalledTimes(1);
  });

  it("sem configuração no ambiente, recusa dizendo qual é o caso", async () => {
    const db = banco({ config: null });
    expect(await publicarAFicha(db as never)).toEqual({ ok: false, causa: "semConfig" });
  });
});

describe("ligar o agente", () => {
  it("⭐ ligar SEM ficha publicada é recusado", async () => {
    // O caso que carrega o arquivo. Sem esta recusa, o agente apareceria
    // "ligado" na tela e continuaria calado na conversa — e o dono concluiria
    // que o sistema não funciona.
    const db = banco({ config: { versaoAtivaId: null } });
    const r = await ligarOTA(db as never, true);

    expect(r).toEqual({ ok: false, causa: "semVersaoPublicada" });
    expect(db.sdrIaConfig.update).not.toHaveBeenCalled();
  });

  it("com ficha publicada, liga", async () => {
    const db = banco({ config: { versaoAtivaId: "v1" } });
    const r = await ligarOTA(db as never, true);

    expect(r).toEqual({ ok: true, ligado: true });
    expect(db.sdrIaConfig.update.mock.calls[0]![0]!.data).toEqual({ ligado: true });
  });

  it("⭐ DESLIGAR nunca exige nada", async () => {
    // Proteção que atrapalha desligar é proteção pior que o problema. Se algum
    // dia o agente estiver ligado num estado estranho, desligar tem que
    // funcionar no primeiro clique.
    const db = banco({ config: { versaoAtivaId: null, ligado: true } });
    const r = await ligarOTA(db as never, false);

    expect(r).toEqual({ ok: true, ligado: false });
    expect(db.sdrIaConfig.update.mock.calls[0]![0]!.data).toEqual({ ligado: false });
  });
});

describe("ler o estado", () => {
  it("diz que falta ficha quando falta", async () => {
    const e = await lerEstadoDoTA(banco() as never);
    expect(e).toMatchObject({ ligado: false, temVersaoPublicada: false, versaoNumero: null });
  });

  it("traz a ficha publicada para a tela mostrar o que foi aprovado", async () => {
    const db = banco({
      config: {
        ligado: true,
        versaoAtiva: { numero: 3, identidade: "sou o TA", proibidos: ["não chutar"] },
      },
    });

    const e = await lerEstadoDoTA(db as never);

    expect(e).toMatchObject({
      ligado: true,
      temVersaoPublicada: true,
      versaoNumero: 3,
      identidade: "sou o TA",
      proibidos: ["não chutar"],
    });
  });

  it("ambiente sem configuração devolve null, e não um estado inventado", async () => {
    expect(await lerEstadoDoTA(banco({ config: null }) as never)).toBeNull();
  });
});
