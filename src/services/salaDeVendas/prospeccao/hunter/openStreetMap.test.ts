/**
 * A LEITURA DA FONTE ABERTA — a tradução, e o que ela se recusa a inventar.
 *
 * Nada aqui toca em rede: a busca recebe um `fetch` de mentira. O que se prova
 * é a tradução (que é onde mora a regra) e a boa vizinhança com a instância
 * pública (User-Agent, e teto de insistência).
 */

import { describe, it, expect, vi } from "vitest";
import {
  buscarNaCidade,
  FonteIndisponivel,
  lerRespostaOverpass,
  montarConsultaOverpass,
  USER_AGENT_DO_HUNTER,
} from "./openStreetMap";

function resposta(elements: unknown[]) {
  return {
    ok: true,
    status: 200,
    json: async () => ({ elements }),
  } as unknown as Response;
}

describe("a consulta", () => {
  it("pede o MUNICÍPIO, e não qualquer coisa com aquele nome", () => {
    const q = montarConsultaOverpass("Goiânia");
    expect(q).toContain('area["name"="Goiânia"]');
    // Sem `admin_level=8` a área casa com bairro e com estado homônimo — e a
    // varredura devolveria outra cidade sem ninguém perceber.
    expect(q).toContain('["admin_level"="8"]');
    expect(q).toContain('["boundary"="administrative"]');
  });

  it("não deixa aspas de fora entrarem na consulta", () => {
    expect(montarConsultaOverpass('Goi"ânia')).toContain('"name"="Goiânia"');
  });
});

describe("a tradução da resposta", () => {
  it("lê nome, telefone, cidade e a identidade do ponto na fonte", () => {
    const [ficha] = lerRespostaOverpass({ elements: [
      {
        type: "node",
        id: 42,
        tags: {
          name: "Cantina da Esquina",
          amenity: "restaurant",
          phone: "+55 62 3223-5396",
          "addr:city": "Goiânia",
          "addr:street": "Rua 84",
          "addr:housenumber": "120",
        },
      },
    ] });

    expect(ficha!.nome).toBe("Cantina da Esquina");
    expect(ficha!.telefone).toBe("+55 62 3223-5396");
    expect(ficha!.cidade).toBe("Goiânia");
    expect(ficha!.endereco).toBe("Rua 84, 120");
    expect(ficha!.tipo).toBe("Restaurante");
    // A identidade na fonte é a chave de auditoria e a trava contra redescobrir
    // o mesmo ponto em toda varredura.
    expect(ficha!.idNaFonte).toBe("osm:node/42");
  });

  it("⛔ descarta ponto SEM NOME — abordar 'o restaurante' é abordar errado", () => {
    const fichas = lerRespostaOverpass({ elements: [
      { type: "node", id: 1, tags: { amenity: "restaurant", phone: "+5562999998888" } },
    ] });
    expect(fichas).toHaveLength(0);
  });

  it("pega só o PRIMEIRO telefone quando a etiqueta traz vários", () => {
    const [ficha] = lerRespostaOverpass({ elements: [
      {
        type: "node",
        id: 2,
        tags: { name: "Dois Números", amenity: "restaurant", phone: "+556232230000; +556232230001" },
      },
    ] });
    // Dois números da mesma casa abordariam a casa duas vezes.
    expect(ficha!.telefone).toBe("+556232230000");
  });

  it("prefere o WhatsApp ao telefone geral quando a fonte traz os dois", () => {
    const [ficha] = lerRespostaOverpass({ elements: [
      {
        type: "node",
        id: 3,
        tags: {
          name: "Com Zap",
          amenity: "fast_food",
          phone: "+556232230000",
          "contact:whatsapp": "+5562999997777",
        },
      },
    ] });
    expect(ficha!.telefone).toBe("+5562999997777");
    expect(ficha!.tipo).toBe("Lanchonete");
  });

  it("telefone ausente vira null — e não uma string vazia disfarçada", () => {
    const [ficha] = lerRespostaOverpass({ elements: [
      { type: "node", id: 4, tags: { name: "Sem Telefone", amenity: "restaurant", phone: "  " } },
    ] });
    expect(ficha!.telefone).toBeNull();
  });

  it("resposta sem `elements` não quebra: devolve lista vazia", () => {
    expect(lerRespostaOverpass({})).toEqual([]);
    expect(lerRespostaOverpass(null)).toEqual([]);
  });
});

describe("a boa vizinhança com a instância pública", () => {
  it("se identifica — requisição anônima é indistinguível de raspagem", async () => {
    const falso = vi.fn(async () => resposta([]));
    await buscarNaCidade("Campinas", { fetch: falso as unknown as typeof fetch, url: "https://exemplo/api" });

    const [, init] = falso.mock.calls[0] as unknown as [string, RequestInit];
    expect((init.headers as Record<string, string>)["User-Agent"]).toBe(USER_AGENT_DO_HUNTER);
  });

  it("tenta de novo quando a instância pede folga (429) — e a seguinte passa", async () => {
    const falso = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 429 })
      .mockResolvedValueOnce(resposta([{ type: "node", id: 9, tags: { name: "X", amenity: "bar" } }]));

    const fichas = await buscarNaCidade("Campinas", {
      fetch: falso as unknown as typeof fetch,
      esperar: async () => {},
    });

    expect(falso).toHaveBeenCalledTimes(2);
    expect(fichas).toHaveLength(1);
  });

  it("⛔ desiste depois do teto — insistir sem fim é como se perde o acesso de graça", async () => {
    const falso = vi.fn(async () => ({ ok: false, status: 504 }));

    await expect(
      buscarNaCidade("Campinas", {
        fetch: falso as unknown as typeof fetch,
        tentativas: 3,
        esperar: async () => {},
      }),
    ).rejects.toBeInstanceOf(FonteIndisponivel);

    expect(falso).toHaveBeenCalledTimes(3);
  });
});
