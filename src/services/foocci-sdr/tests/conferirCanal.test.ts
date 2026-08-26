/**
 * A CONFERÊNCIA DO CANAL — e o segredo que não pode vazar por ela.
 *
 * ── O QUE ESTES CASOS GUARDAM ───────────────────────────────────────────────
 *
 * Em 26/08/2026 duas telas da Meta mostraram identificadores DIFERENTES para o
 * mesmo número de telefone. Nenhuma checagem de "a variável está preenchida?"
 * pegaria isso — as duas estavam preenchidas, e uma estava errada.
 *
 * Daí esta função: ela não pergunta se a credencial existe, pergunta se ela
 * **funciona e aponta para o telefone certo**. E daí estes testes, que guardam
 * as duas coisas que podem dar errado nela:
 *
 *   1. o token aparecer em algum lugar do retorno;
 *   2. a recusa da Meta virar um "ok" silencioso.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { conferirCanalDeVendas } from "../FoocciSalesChannel";

const TOKEN = "EAAsegredoQueNuncaPodeAparecerNoRetorno123";
const ID = "1300518453142518";

const ambienteOriginal = { ...process.env };

beforeEach(() => {
  process.env.FOOCCI_SALES_PHONE_NUMBER_ID = ID;
  process.env.FOOCCI_SALES_ACCESS_TOKEN = TOKEN;
  delete process.env.FOOCCI_SALES_PROVIDER;
});

afterEach(() => {
  process.env = { ...ambienteOriginal };
  vi.unstubAllGlobals();
});

function metaResponde(status: number, corpo: unknown) {
  const espiao = vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => corpo,
  });
  vi.stubGlobal("fetch", espiao);
  return espiao;
}

describe("a conferência pergunta à Meta, e não ao ambiente", () => {
  it("devolve o número que a META diz — que é a única prova do apontamento", async () => {
    metaResponde(200, {
      display_phone_number: "+55 11 94372-3316",
      verified_name: "Foocci",
      quality_rating: "GREEN",
    });

    const r = await conferirCanalDeVendas();

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.numero).toBe("+55 11 94372-3316");
    expect(r.nomeVerificado).toBe("Foocci");
    expect(r.qualidade).toBe("GREEN");
  });

  it("é uma LEITURA — nunca manda mensagem para ninguém", async () => {
    // Conferir o canal não pode custar uma mensagem a um estranho. Sem este
    // caso, trocar o GET por um envio de teste passaria em todos os outros.
    const espiao = metaResponde(200, { display_phone_number: "+55 11 94372-3316" });
    await conferirCanalDeVendas();

    const [url, init] = espiao.mock.calls[0]!;
    expect(String(url)).not.toContain("/messages");
    expect((init as RequestInit | undefined)?.method ?? "GET").toBe("GET");
    expect((init as RequestInit | undefined)?.body).toBeUndefined();
  });

  it("⭐ o token vai no cabeçalho e NÃO volta em lugar nenhum", async () => {
    // O caso que carrega o arquivo. Esta função existe para ser lida numa tela,
    // e uma tela é print, é suporte, é tíquete. O segredo não pode sair daqui.
    const espiao = metaResponde(200, {
      display_phone_number: "+55 11 94372-3316",
      // A Meta ecoando o token seria absurdo — e é exatamente por isso que o
      // teste o coloca aqui: o retorno é montado campo a campo, nunca repassado.
      access_token: TOKEN,
    });

    const r = await conferirCanalDeVendas();

    expect(JSON.stringify(r)).not.toContain(TOKEN);
    expect((espiao.mock.calls[0]![1] as RequestInit).headers).toMatchObject({
      Authorization: `Bearer ${TOKEN}`,
    });
  });
});

describe("recusa nunca vira sucesso silencioso", () => {
  it("a Meta negando permissão devolve o motivo, não um ok", async () => {
    // O caso real que se espera: token gerado na conta de TESTE autentica e não
    // alcança o número de produção.
    metaResponde(403, {
      error: { message: "(#200) Insufficient permission to access phone number" },
    });

    const r = await conferirCanalDeVendas();

    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.causa).toBe("aMetaRecusou");
    expect(r.detalhe).toContain("Insufficient permission");
  });

  it("rede fora do ar também é recusa nomeada, e não exceção", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNREFUSED")));

    const r = await conferirCanalDeVendas();

    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.detalhe).toContain("ECONNREFUSED");
  });

  it("sem token, nem chega a perguntar — e diz qual chave falta", async () => {
    delete process.env.FOOCCI_SALES_ACCESS_TOKEN;
    const espiao = metaResponde(200, {});

    const r = await conferirCanalDeVendas();

    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.causa).toBe("semToken");
    // Não gastar chamada para dizer o óbvio.
    expect(espiao).not.toHaveBeenCalled();
  });

  it("sem identificador do número, idem", async () => {
    delete process.env.FOOCCI_SALES_PHONE_NUMBER_ID;

    const r = await conferirCanalDeVendas();

    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.causa).toBe("semPhoneNumberId");
  });

  it("provedor desconhecido não vira 'manda pela Meta'", async () => {
    process.env.FOOCCI_SALES_PROVIDER = "EVOLUTION";

    const r = await conferirCanalDeVendas();

    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.causa).toBe("provedorNaoSuportado");
  });
});

describe("o identificador consultado é o do AMBIENTE", () => {
  it("a URL carrega o id configurado — e é assim que a troca de id se detecta", async () => {
    // A divergência de 26/08: duas telas da Meta, dois ids para o mesmo número.
    // Consultar um id fixo no código faria a tela mentir sobre o que está no ar.
    const espiao = metaResponde(200, { display_phone_number: "+55 11 94372-3316" });
    await conferirCanalDeVendas();

    expect(String(espiao.mock.calls[0]![0])).toContain(ID);
  });
});
