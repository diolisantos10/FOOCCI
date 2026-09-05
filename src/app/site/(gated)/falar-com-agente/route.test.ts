/**
 * A MARCAÇÃO DE CAMPANHA ATRAVESSA A PORTA — ou os 600 convites viram um número só.
 *
 * ── POR QUE ISTO EXISTE (05/09/2026) ────────────────────────────────────────
 *
 * O plano do CEO: o SDR aborda restaurante por restaurante pelo chip, convida a
 * conhecer o site, e quem se interessa clica no botão de WhatsApp de lá —
 * entrando como lead pela porta certa, com opt-in.
 *
 * O desvio desta rota **descartava a query**: a assinatura era `GET()`, sem
 * receber a requisição. Um convite mandado com `?utm_source=sdr` chegava ao
 * formulário sem nada, o lead nascia sem origem, e a pergunta que decide se a
 * campanha continua — *"quantos vieram da abordagem?"* — ficava sem resposta.
 *
 * A corrente inteira já existia: o site captura o primeiro toque e o formulário
 * manda junto. **Só esta porta perdia o dado no caminho.**
 */

import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "./route";

const chamar = (query: string) =>
  GET(new NextRequest(`https://foocci.com.br/site/falar-com-agente${query}`));

describe("a porta do WhatsApp carrega a marcação de campanha", () => {
  it("⭐ leva utm_source adiante — é o que mede a abordagem do SDR", async () => {
    const res = await chamar("?utm_source=sdr");
    const destino = new URL(res.headers.get("location")!);

    expect(destino.searchParams.get("utm_source")).toBe("sdr");
  });

  it("leva o conjunto todo de marcação", async () => {
    const res = await chamar(
      "?utm_source=sdr&utm_medium=whatsapp&utm_campaign=restaurantes-sp&utm_content=lote1",
    );
    const d = new URL(res.headers.get("location")!);

    expect(d.searchParams.get("utm_medium")).toBe("whatsapp");
    expect(d.searchParams.get("utm_campaign")).toBe("restaurantes-sp");
    expect(d.searchParams.get("utm_content")).toBe("lote1");
  });

  it("⛔ NÃO repassa parâmetro fora da lista — a porta não é redirecionador aberto", () => {
    // Repassar a query inteira deixaria quem monta o endereço escolher o que
    // chega na próxima página.
    return chamar("?utm_source=sdr&redirect=https://site-de-outro.com&admin=1").then((res) => {
      const d = new URL(res.headers.get("location")!);
      expect(d.searchParams.get("utm_source")).toBe("sdr");
      expect(d.searchParams.get("redirect")).toBeNull();
      expect(d.searchParams.get("admin")).toBeNull();
    });
  });

  it("marcação vazia não vira origem em branco", async () => {
    // `?utm_source=` gravaria uma origem vazia, que depois seria lida como
    // "veio de algum lugar" — pior que não ter nada.
    const res = await chamar("?utm_source=");
    const d = new URL(res.headers.get("location")!);

    expect(d.searchParams.get("utm_source")).toBeNull();
  });

  it("sem marcação nenhuma, o destino continua o mesmo de antes", async () => {
    const res = await chamar("");
    const d = new URL(res.headers.get("location")!);

    expect(d.pathname).toBe("/site/precos");
    expect([...d.searchParams.keys()]).toHaveLength(0);
  });

  it("⭐ chamada SEM requisição continua funcionando — não quebrei quem já chamava", async () => {
    // A CI pegou isto na primeira execução: `src/lib/site/tests/` chama `GET()`
    // sem argumento. Exigir o parâmetro quebrou testes que descrevem o contrato
    // de quem já chamava. Sem requisição, a porta se comporta como antes.
    const res = await GET();
    expect(res.status).toBe(307);
    expect(new URL(res.headers.get("location")!).pathname).toBe("/site/precos");
  });

  it("o desvio continua sendo 307 e sem cache", async () => {
    // 308 ficaria guardado no navegador: quem clicasse hoje ganharia um atalho
    // eterno para uma decisão que não é eterna.
    const res = await chamar("?utm_source=sdr");
    expect(res.status).toBe(307);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });
});
