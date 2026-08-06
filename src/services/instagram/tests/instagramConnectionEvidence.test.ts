/**
 * A evidência da conexão do Instagram — o campo que era gravado e ninguém lia.
 *
 * Desde 05/08 o callback grava em `metadata` POR QUE a conexão nasceu quebrada
 * (`longLivedExchangeError`, `webhookSubscribeError`). Nada devolvia esses campos: nem
 * `toView`, nem o `graph-check`, nem a tela. Resultado: o motivo real da queda se perdeu
 * TRÊS vezes (25/07, 04/08, 05/08), porque a retenção de log do Railway é por deploy e
 * a única cópia sobrevivente estava num campo sem leitor.
 *
 * Estes testes travam:
 *   1. o campo CHEGA na projeção — se voltar a ficar escondido, isto reprova;
 *   2. nenhum segredo escapa junto (o token vai na query string do subscribe);
 *   3. a aritmética que identifica o token de 1h;
 *   4. ausência de informação não vira afirmação (guardrail 1).
 */

import { describe, it, expect } from "vitest";
import { readConnectionEvidence, redactSecrets, sanitizeEvidence } from "../instagramConnectionEvidence";
import { toView } from "../InstagramConfigService";
import type { InstagramConfigRow } from "../InstagramConfigService";

/** Linha mínima de config, com o metadata sob teste. */
function linha(metadata: Record<string, unknown> | null): InstagramConfigRow {
  return {
    id: "cfg1", restaurantId: "r1", enabled: true, paused: false,
    mode: "RECEIVE_ONLY", scope: "RESTAURANT_WIDE",
    instagramBusinessAccountId: "27899980922965770", facebookPageId: null,
    pageAccessTokenEncrypted: "enc", verifyTokenHash: null,
    appId: null, appSecretRef: null, allowlistedExternalUserIds: [],
    lastWebhookAt: null, lastError: null, metadata,
  } as unknown as InstagramConfigRow;
}

describe("🔒 PORTÃO — a evidência precisa CHEGAR na projeção", () => {
  it("se `longLivedExchangeError` voltar a ficar escondido em toView, isto reprova", () => {
    const view = toView(linha({
      connectedAt: "2026-08-05T22:00:00.000Z",
      tokenExpiresAt: "2026-08-05T23:00:00.000Z",
      longLivedExchangeError: "Invalid OAuth access token (code 190)",
    }));

    // Este era o buraco: o campo existia no banco e a API devolvia a config sem ele.
    expect(view.evidence.longLivedExchangeError).toBe("Invalid OAuth access token (code 190)");
    expect(view.evidence.tokenLifetimeHours).toBe(1);
    expect(view.evidence.problemas.join(" ")).toContain("Invalid OAuth access token");
  });

  it("se `webhookSubscribeError` voltar a ficar escondido, isto reprova", () => {
    const view = toView(linha({
      connectedAt: "2026-08-05T22:00:00.000Z",
      webhookSubscribeError: "(#200) Permissions error",
    }));
    expect(view.evidence.webhookSubscribeError).toBe("(#200) Permissions error");
    expect(view.evidence.problemas.join(" ")).toContain("nenhuma DM chega");
  });

  it("conexão saudável não inventa problema", () => {
    const view = toView(linha({
      connectedAt: "2026-08-06T10:00:00.000Z",
      tokenExpiresAt: "2026-10-05T10:00:00.000Z", // 60 dias
      webhookSubscribedAt: "2026-08-06T10:00:01.000Z",
      longLivedExchangeError: null,
      webhookSubscribeError: null,
    }));
    expect(view.evidence.problemas).toEqual([]);
    expect(view.evidence.tokenLifetimeHours).toBe(1440);
  });
});

describe("🔒 PORTÃO — segredo nunca sai pelo caminho novo", () => {
  // O token do cliente vai na QUERY STRING do subscribe (instagramLoginOAuth.ts:222-224).
  // Se o fetch estourar, a URL inteira pode virar `e.message` e ser gravada no banco.
  // Abrir um caminho de leitura sem limpar publicaria o token na API e na tela.
  it("token na query string de um erro de subscribe é mascarado", () => {
    const cru = "request to https://graph.instagram.com/v21.0/1789/subscribed_apps"
      + "?subscribed_fields=messages&access_token=EAABwzLixnjYBO7ZCZAsecretvalue99 failed";
    const view = toView(linha({ connectedAt: "2026-08-05T22:00:00.000Z", webhookSubscribeError: cru }));

    expect(view.evidence.webhookSubscribeError).not.toContain("EAABwzLixnjYBO7ZCZAsecretvalue99");
    expect(view.evidence.webhookSubscribeError).toContain("<oculto>");
    // O resto do diagnóstico continua útil — mascarar não pode cegar quem investiga.
    expect(view.evidence.webhookSubscribeError).toContain("subscribed_apps");
  });

  it("mascara client_secret, code e access_token em JSON e em query string", () => {
    expect(redactSecrets('erro: {"access_token": "EAAsecret123"}')).not.toContain("EAAsecret123");
    expect(redactSecrets("client_secret=abc123&x=1")).toBe("client_secret=<oculto>&x=1");
    expect(redactSecrets("code=AQBxyz#_ falhou")).toBe("code=<oculto> falhou");
  });

  it("token solto da Meta (prefixo EAA) some mesmo sem nome de campo", () => {
    expect(redactSecrets("recebi EAABwzLixnjYBO1234567890abcdefg e falhou")).toContain("<oculto>");
  });

  it("não mastiga mensagem normal", () => {
    const normal = 'Error validating access token: Session has expired on Wednesday, 05-Aug-26 16:00:00 PDT';
    expect(redactSecrets(normal)).toBe(normal);
  });

  it("ausência continua ausência — não vira string vazia", () => {
    expect(sanitizeEvidence(null)).toBeNull();
    expect(sanitizeEvidence(undefined)).toBeNull();
    expect(sanitizeEvidence(123)).toBeNull();
    expect(sanitizeEvidence("   ")).toBeNull();
  });
});

describe("a aritmética que identifica o token de 1 hora", () => {
  it("1h de vida é apontado como curto, com o número na frase", () => {
    const e = readConnectionEvidence({
      connectedAt: "2026-08-05T22:00:00.000Z",
      tokenExpiresAt: "2026-08-05T23:00:00.000Z",
    });
    expect(e.tokenLifetimeHours).toBe(1);
    expect(e.problemas[0]).toContain("1h de vida");
    expect(e.problemas[0]).toContain("60 dias");
  });

  it("sem motivo da Meta, diz que precisa instrumentar — não inventa causa", () => {
    const e = readConnectionEvidence({
      connectedAt: "2026-08-05T22:00:00.000Z",
      tokenExpiresAt: "2026-08-05T23:00:00.000Z",
      longLivedExchangeError: null,
    });
    expect(e.problemas[0]).toContain("não devolveu motivo");
    expect(e.problemas[0]).toContain("instrumentada");
  });
});

describe("guardrail 1 — ausência de informação não é informação", () => {
  it("metadata vazio não gera acusação nenhuma", () => {
    expect(readConnectionEvidence(null).problemas).toEqual([]);
    expect(readConnectionEvidence({}).problemas).toEqual([]);
    expect(readConnectionEvidence("lixo").problemas).toEqual([]);
  });

  it("sem registro de inscrição diz 'não há registro', não 'falhou'", () => {
    const e = readConnectionEvidence({
      connectedAt: "2026-08-05T22:00:00.000Z",
      tokenExpiresAt: "2026-10-04T22:00:00.000Z",
    });
    const frase = e.problemas.join(" ");
    expect(frase).toContain("Não há registro");
    expect(frase).not.toContain("falhou");
  });

  it("data impossível não vira lifetime falso", () => {
    const e = readConnectionEvidence({ connectedAt: "nunca", tokenExpiresAt: "jamais" });
    expect(e.tokenLifetimeHours).toBeNull();
    expect(e.problemas).toEqual([]);
  });
});
