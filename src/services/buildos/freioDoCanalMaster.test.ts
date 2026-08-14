/**
 * O FREIO DO CANAL MASTER — o P0 "existe um caminho de envio sem nenhum freio".
 *
 * `docs/sdr-foocci-desenho.md` (05/08/2026) listou este caminho como P0: o canal
 * Master do Build OS envia **sem restaurante**, e até 14/08 enviava sem horário,
 * sem teto, sem descanso e sem opt-out. Era, textualmente, *"a função mais
 * parecida com o que o SDR precisa e a mais perigosa"*.
 *
 * AS DUAS METADES, em cada teste deste arquivo:
 *   1. a FALHA de antes — o abuso passava; agora é recusado ANTES da rede;
 *   2. o ACERTO — o uso legítimo continua passando, senão bastaria desligar o
 *      canal e todo teste de "não abusa" ficaria verde por engano.
 *
 * Nenhuma mensagem real sai daqui: o `fetch` é substituído.
 */

import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  sendBuildOsMetaText,
  freioDoCanalMaster,
  __resetFreioDoCanalMaster,
  RATE,
} from "./BuildOsMetaChannel";

const OPERADOR = "5511999990000";

/** Quantas vezes o canal tentou realmente falar com a Meta. */
let chamadasDeRede = 0;

beforeEach(() => {
  __resetFreioDoCanalMaster();
  chamadasDeRede = 0;
  process.env.BUILDOS_META_PHONE_NUMBER_ID = "111111111111111";
  process.env.BUILDOS_META_ACCESS_TOKEN = "token-de-teste-nao-real";
  vi.stubGlobal("fetch", vi.fn(async () => {
    chamadasDeRede++;
    return { ok: true, json: async () => ({}) } as unknown as Response;
  }));
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.BUILDOS_META_PHONE_NUMBER_ID;
  delete process.env.BUILDOS_META_ACCESS_TOKEN;
  __resetFreioDoCanalMaster();
});

describe("freio do canal Master — teto de destinos distintos", () => {
  it("a FALHA de antes: uma lista de contatos passava inteira; agora para no teto", async () => {
    // Um SDR ingênuo reaproveitando este caminho: um destino novo por lead.
    const resultados = [];
    for (let i = 0; i < RATE.maxDestinos + 3; i++) {
      resultados.push(await sendBuildOsMetaText(`5511988880${String(i).padStart(3, "0")}`, "oi"));
    }

    const aceitos = resultados.filter((r) => r.ok).length;
    expect(aceitos).toBe(RATE.maxDestinos);

    const recusado = resultados.find((r) => !r.ok);
    expect(recusado?.error).toContain("destinos distintos");
    // E a recusa é ANTES da rede: teto que ainda gasta chamada não protege o número.
    expect(chamadasDeRede).toBe(RATE.maxDestinos);
  });

  it("o ACERTO: falar VÁRIAS vezes com o MESMO operador continua livre", async () => {
    // O uso real do canal — confirmação de comando, várias por hora, um destino.
    for (let i = 0; i < RATE.maxDestinos + 10; i++) {
      const r = await sendBuildOsMetaText(OPERADOR, `confirmação ${i}`);
      expect(r.ok).toBe(true);
    }
    expect(freioDoCanalMaster().destinos).toBe(1);
  });
});

describe("freio do canal Master — teto de mensagens", () => {
  it("a FALHA de antes: um laço de retentativa mandava para sempre; agora morre no teto", async () => {
    let ultimoErro: string | undefined;
    for (let i = 0; i < RATE.maxMensagens + 5; i++) {
      const r = await sendBuildOsMetaText(OPERADOR, "retentativa");
      if (!r.ok) ultimoErro = r.error;
    }
    expect(chamadasDeRede).toBe(RATE.maxMensagens);
    expect(ultimoErro).toContain("mensagens na última hora");
  });

  it("o ACERTO: abaixo do teto, o envio acontece de verdade", async () => {
    const r = await sendBuildOsMetaText(OPERADOR, "olá");
    expect(r.ok).toBe(true);
    expect(chamadasDeRede).toBe(1);
    expect(freioDoCanalMaster()).toEqual({ mensagens: 1, destinos: 1 });
  });
});

describe("freio do canal Master — o que ele NÃO conta", () => {
  it("telefone inválido não consome cota: recusa de formato não é envio", async () => {
    const r = await sendBuildOsMetaText("123", "oi");
    expect(r.ok).toBe(false);
    expect(r.error).toBe("telefone inválido");
    expect(freioDoCanalMaster()).toEqual({ mensagens: 0, destinos: 0 });
  });

  it("canal desligado responde antes do freio, e sem gastar cota", async () => {
    delete process.env.BUILDOS_META_ACCESS_TOKEN;
    const r = await sendBuildOsMetaText(OPERADOR, "oi");
    expect(r.ok).toBe(false);
    expect(r.error).toContain("não configurado");
    expect(freioDoCanalMaster().mensagens).toBe(0);
  });
});
