/**
 * O PISO DO FRIO — "Cliente frio" vai de 60 a 120 dias, e acaba onde
 * "Cliente perdido" começa.
 *
 * O cabeçalho de `src/lib/crm-segments.ts` sempre prometeu o piso ("up to
 * lostMinDays"), mas a consulta que de fato manda mensagem pedia só
 * "60+ dias". Resultado medido na tela do CEO: 3.037 perdidos DENTRO de 3.172
 * frios — todo cliente perdido recebia também a mensagem de frio, que é a
 * mensagem errada para o estágio dele.
 *
 * Estes testes provam o piso nos três lugares onde a definição vivia:
 * a fonte (`crm-segments`), a prévia (`CrmAudienceService`) e o raio-x
 * (`jornadaDeEstagios`).
 */

import { describe, it, expect } from "vitest";
import {
  buildCutoffs,
  DEFAULT_SEGMENT_CONFIG,
  coldWhere,
  lostWhere,
  isCold,
  isLost,
} from "@/lib/crm-segments";
import {
  estagiosDoCliente,
  type ClienteParaClassificar,
} from "../raioX/jornadaDeEstagios";

const AGORA = new Date("2026-09-18T12:00:00.000Z");
const CORTES = buildCutoffs(DEFAULT_SEGMENT_CONFIG, AGORA);
const DIA = 86_400_000;

const haDias = (dias: number) => new Date(AGORA.getTime() - dias * DIA);

function pediuHa(dias: number): ClienteParaClassificar {
  return {
    id: "c1",
    totalOrders: 3,
    importedOrderCount: null,
    lastOrderAt: haDias(dias),
    importedLastOrderAt: null,
    isGuest: false,
    isActive: true,
    crmContactable: true,
    phone: "+5511999999999",
  };
}

const estagios = (c: ClienteParaClassificar) =>
  estagiosDoCliente(c, CORTES, DEFAULT_SEGMENT_CONFIG, AGORA);

describe("frio e perdido são mutuamente excludentes", () => {
  it("quem não pede há 200 dias é SÓ perdido — nunca frio", () => {
    const e = estagios(pediuHa(200));
    expect(e).toContain("recuperar-perdidos");
    expect(e).not.toContain("recuperar-frios");
  });

  it("vale para qualquer data além do corte de perdido, não é caso de borda", () => {
    for (const dias of [121, 150, 200, 365, 1000]) {
      const e = estagios(pediuHa(dias));
      expect(e, `cliente de ${dias} dias`).toContain("recuperar-perdidos");
      expect(e, `cliente de ${dias} dias`).not.toContain("recuperar-frios");
    }
  });

  it("quem está entre 60 e 120 dias continua frio, e não é perdido", () => {
    for (const dias of [61, 90, 119]) {
      const e = estagios(pediuHa(dias));
      expect(e, `cliente de ${dias} dias`).toContain("recuperar-frios");
      expect(e, `cliente de ${dias} dias`).not.toContain("recuperar-perdidos");
    }
  });
});

describe("os predicados da fonte única concordam com a escada", () => {
  it("isCold aplica teto e piso; isLost começa onde o frio acaba", () => {
    expect(isCold(haDias(90), CORTES)).toBe(true);
    expect(isCold(haDias(45), CORTES)).toBe(false);   // ainda morno
    expect(isCold(haDias(200), CORTES)).toBe(false);  // já perdido
    expect(isLost(haDias(200), CORTES)).toBe(true);
    expect(isLost(haDias(90), CORTES)).toBe(false);
  });

  it("o fragmento de consulta do frio carrega o piso do perdido", () => {
    const frio = coldWhere(CORTES);
    for (const perna of frio.OR) {
      const janela = "lastOrderAt" in perna && perna.lastOrderAt
        ? perna.lastOrderAt
        : perna.importedLastOrderAt!;
      expect(janela.gte).toEqual(CORTES.lostCutoff);
      expect(janela.lt).toEqual(CORTES.warmCutoff);
    }
    expect(lostWhere(CORTES).OR[0].lastOrderAt!.lt).toEqual(CORTES.lostCutoff);
  });
});
