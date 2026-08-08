/**
 * A separação das famílias de erro da Graph — credencial × permissão × parâmetro.
 *
 * O que estes testes travam, e por quê:
 *
 * O Instagram de um cliente ficou fora do ar com a faixa dizendo "token de curta
 * duração … (code 100). Reconecte." O lojista reconectou três vezes (25/07, 04/08,
 * 05/08) e as três conexões nasceram com o mesmo defeito. A faixa estava pedindo uma
 * ação humana que não conserta nada.
 *
 * A prova de que `code 100` ali NÃO é credencial nem token vencido é medida, não
 * opinada — sondas GET puras contra o próprio endpoint da troca, em 08/08/2026,
 * documentadas no cabeçalho de `metaGraphErrorFamily.ts`: sem `client_secret`, sem
 * `access_token` e com token inválido, aquele endpoint responde **190**, não 100.
 *
 * Se alguém amanhã reclassificar 100 como credencial, ou fizer `reconnectCanFix`
 * voltar a ser `true` por padrão, estes testes reprovam.
 */

import { describe, it, expect } from "vitest";
import {
  classifyMetaGraphError,
  extractMetaCode,
  reconnectCanFixAny,
} from "../metaGraphErrorFamily";

describe("classifyMetaGraphError — as três famílias que o despacho pediu separadas", () => {
  it("190 em token de LOJISTA é CREDENCIAL e reconectar RESOLVE", () => {
    const c = classifyMetaGraphError(
      { message: "Session has expired on Wednesday, 05-Aug-26 16:00:00 PDT", code: 190, type: "OAuthException" },
      "TOKEN_DO_LOJISTA",
    );
    expect(c.family).toBe("CREDENCIAL");
    expect(c.reconnectCanFix).toBe(true);
    expect(c.ownedBy).toBe("LOJISTA");
  });

  it("190 em token de APLICATIVO é o par ID+chave errado — e aí reconectar NÃO resolve", () => {
    // A mesma família, dono diferente. Mandar o lojista reconectar por causa de uma
    // chave secreta trocada no Railway é o erro que este parâmetro existe para evitar.
    const c = classifyMetaGraphError({ message: "Invalid OAuth access token", code: 190 }, "TOKEN_DO_APLICATIVO");
    expect(c.family).toBe("CREDENCIAL");
    expect(c.reconnectCanFix).toBe(false);
    expect(c.ownedBy).toBe("CEO_META");
  });

  it("100 é PARÂMETRO — não é credencial, não é token vencido, e reconectar NÃO resolve", () => {
    // O caso exato que está na faixa vermelha de produção.
    const c = classifyMetaGraphError({ message: "Invalid parameter", code: 100, type: "OAuthException" });
    expect(c.family).toBe("PARAMETRO");
    expect(c.family).not.toBe("CREDENCIAL");
    expect(c.reconnectCanFix).toBe(false);
    expect(c.retryCanFix).toBe(false);
    expect(c.ownedBy).toBe("FOOCCI");
  });

  it("(#200) é PERMISSÃO: dono é o CEO na Meta, e a frase avisa que o app é UM só", () => {
    const c = classifyMetaGraphError({ message: "(#200) Permissions error", code: 200 });
    expect(c.family).toBe("PERMISSAO");
    expect(c.reconnectCanFix).toBe(false);
    expect(c.ownedBy).toBe("CEO_META");
    // A fronteira mais cara desta casa: permissão mexida derruba WhatsApp junto.
    expect(c.operador).toMatch(/MESMO aplicativo/i);
  });

  it("limite e indisponibilidade são os ÚNICOS que autorizam repetir", () => {
    expect(classifyMetaGraphError({ code: 4, message: "rate limit" }).retryCanFix).toBe(true);
    expect(classifyMetaGraphError({ code: 1, message: "unknown error" }).retryCanFix).toBe(true);
    expect(classifyMetaGraphError({ code: 100, message: "x" }).retryCanFix).toBe(false);
    expect(classifyMetaGraphError({ code: 200, message: "x" }).retryCanFix).toBe(false);
    expect(classifyMetaGraphError({ code: 190, message: "x" }).retryCanFix).toBe(false);
  });

  it("código não reconhecido vira DESCONHECIDA — nunca cai numa família por eliminação", () => {
    // Guardrail 1. E, sem saber, NÃO promete que reconectar resolve.
    const c = classifyMetaGraphError({ message: "algo totalmente novo", code: 99999 });
    expect(c.family).toBe("DESCONHECIDA");
    expect(c.reconnectCanFix).toBe(false);
    expect(c.retryCanFix).toBe(true); // repetir é o comportamento seguro quando não se sabe
  });

  it("preserva a evidência inteira — subcode, type e fbtrace, que eram jogados fora", () => {
    // `fbtrace_id` é a primeira coisa que o suporte da Meta pede, e o código antigo
    // guardava só `mensagem (code N)`.
    const c = classifyMetaGraphError({
      message: "Invalid parameter", code: 100, error_subcode: 33,
      type: "IGApiException", fbtrace_id: "ABC123",
    });
    expect(c.evidence).toContain("Invalid parameter");
    expect(c.evidence).toContain("code 100");
    expect(c.evidence).toContain("subcode 33");
    expect(c.evidence).toContain("type IGApiException");
    expect(c.evidence).toContain("fbtrace ABC123");
  });

  it("nenhuma frase de lojista promete reconexão quando ela não resolve", () => {
    // A regra dura do módulo, varrida de uma vez em vez de caso a caso.
    for (const code of [100, 200, 10, 4, 1, 99999]) {
      const c = classifyMetaGraphError({ message: "x", code });
      expect(c.reconnectCanFix).toBe(false);
      expect(c.lojista.toLowerCase()).not.toMatch(/reconecte|reconectar a conta resolve/);
    }
  });
});

describe("extractMetaCode — ler o que JÁ está gravado em produção", () => {
  it("lê o formato que o nosso código gravava: `… (code 100)`", () => {
    expect(extractMetaCode('a Meta respondeu: "Invalid parameter (code 100)"')).toBe(100);
  });

  it("lê o formato nativo da Meta: `(#200) Permissions error`", () => {
    expect(extractMetaCode("(#200) Permissions error")).toBe(200);
  });

  it("sem código no texto devolve null — e não inventa um", () => {
    expect(extractMetaCode("deu ruim")).toBeNull();
  });
});

describe("reconnectCanFixAny — a correção precisa valer para a conexão quebrada AGORA", () => {
  it("classifica a string exata que está no banco de produção hoje", () => {
    // Este é o texto que a faixa vermelha mostra ao lojista neste momento.
    const gravado =
      'Conexão instável: o Instagram devolveu um token de curta duração (expira em ~1h) em vez do ' +
      'de 60 dias — a Meta respondeu: "Invalid parameter (code 100)". Reconecte; se repetir, a ' +
      "troca long-lived está falhando em produção.";
    expect(reconnectCanFixAny([gravado])).toBe(false);
  });

  it("sem evidência nenhuma devolve null — silêncio não vira 'pode reconectar'", () => {
    expect(reconnectCanFixAny([null, undefined, "  "])).toBeNull();
  });

  it("basta UM problema que a reconexão resolva para oferecer reconectar ser honesto", () => {
    expect(reconnectCanFixAny(["Invalid parameter (code 100)", "Session has expired (code 190)"])).toBe(true);
  });
});
