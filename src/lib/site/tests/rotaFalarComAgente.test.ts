/**
 * ⚠️ ESTA REGRA MUDOU EM 05/09/2026, E A ANTIGA FICA ESCRITA ABAIXO.
 *
 * O CEO clicou no botão verde, caiu no formulário e mandou corrigir: o botão do
 * WhatsApp tem que levar ao WhatsApp. Não é contradição com 27/08 — naquele dia
 * existia UMA porta, e obrigar todo mundo ao formulário era o menos ruim. Hoje
 * existem duas: o topo do site leva ao formulário, e o botão verde atende quem
 * quer falar agora.
 *
 * O custo continua real e está registrado: pelo WhatsApp direto o lead chega sem
 * nome, sem restaurante e sem cidade. Foi uma troca consciente, não um descuido.
 */
/**
 * A porta única do agente — e a promessa que ela não pode quebrar.
 *
 * ── A REGRA MUDOU EM 27/08/2026, E ESTE ARQUIVO MUDOU COM ELA ───────────────
 *
 * A versão anterior guardava um desvio de DUAS saídas: canal no ar levava ao
 * `wa.me` direto, canal desligado levava ao formulário. O CEO fechou a primeira:
 *
 *   *"Quando eles clicarem no botão do WhatsApp, venha um formulário de leads,
 *   e não apenas 'oi, vim pelo site'. Aí eles preenchem e entram na fila de
 *   leads pra serem atendidos."*
 *
 * O motivo estava no próprio texto que saía — `"Olá! Quero saber mais sobre o
 * Foocci."` — chegando de um número desconhecido. O agente gastava as três
 * primeiras mensagens descobrindo quem era, exatamente o que o formulário já
 * perguntava na tela anterior.
 *
 * ⚠️ Os dois casos que provavam a saída antiga foram **substituídos, não
 * apagados**. Eles guardavam algo que deixou de ser verdade; mantê-los passando
 * exigiria manter a porta que o CEO mandou fechar.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { GET } from "@/app/site/(gated)/falar-com-agente/route";
import { NUMERO_DE_VENDAS } from "@/lib/site/canalDeVendas";

const original = process.env.FOOCCI_SALES_WHATSAPP_ATIVO;

beforeEach(() => { delete process.env.FOOCCI_SALES_WHATSAPP_ATIVO; });
afterEach(() => {
  if (original === undefined) delete process.env.FOOCCI_SALES_WHATSAPP_ATIVO;
  else process.env.FOOCCI_SALES_WHATSAPP_ATIVO = original;
});

describe("⭐ uma porta só — todo mundo passa pelo formulário", () => {
  it("leva ao FORMULÁRIO, e nunca direto ao WhatsApp", async () => {
    const res = await GET();
    const destino = res.headers.get("location") ?? "";
    expect(destino).toContain(`wa.me/${NUMERO_DE_VENDAS}`);
    expect(destino, "a porta deixou de levar ao WhatsApp").toContain("wa.me");
  });

  it("⭐ e continua no formulário mesmo com o canal LIGADO", async () => {
    // O caso que carrega o arquivo. Antes, esta variável abria o atalho para o
    // `wa.me` — e era ela que produzia o lead anônimo.
    //
    // Ligar o canal continua importando para o agente ATENDER; deixou de
    // importar para o visitante ENTRAR. São coisas diferentes, e a confusão
    // entre as duas é o que criava a segunda porta.
    process.env.FOOCCI_SALES_WHATSAPP_ATIVO = "true";

    const destino = (await GET()).headers.get("location") ?? "";
    expect(
      destino,
      "o canal ligado voltou a abrir atalho para o WhatsApp — o lead chega anônimo de novo",
    ).toContain("wa.me");
    expect(destino).toContain(`wa.me/${NUMERO_DE_VENDAS}`);
  });

  it("o destino não depende de variável nenhuma — é o mesmo nos dois estados", async () => {
    const desligado = (await GET()).headers.get("location") ?? "";
    process.env.FOOCCI_SALES_WHATSAPP_ATIVO = "true";
    const ligado = (await GET()).headers.get("location") ?? "";

    expect(ligado, "a porta voltou a ter dois destinos").toBe(desligado);
  });
});

describe("o desvio em si", () => {
  it("é TEMPORÁRIO (307) — 308 ficaria guardado no navegador e no buscador", async () => {
    // A decisão de hoje é do CEO e pode voltar a mudar. Um desvio permanente
    // daria a quem clicou hoje um atalho eterno para uma escolha que não é
    // eterna — e ele fica no cache do navegador e no índice de busca.
    expect((await GET()).status).toBe(307);
  });

  it("não é guardado em cache", async () => {
    expect((await GET()).headers.get("cache-control")).toContain("no-store");
  });

  it("⭐ e ele NUNCA manda mensagem — quem escreve primeiro é o visitante", async () => {
    // A propriedade que sustenta o funil inteiro: mensagem enviada PELO CLIENTE
    // não precisa de modelo aprovado pela Meta e abre a janela em que o agente
    // conversa livre. Se um dia esta rota passar a disparar a primeira
    // mensagem, ela precisará de modelo, aprovação e espera — e o botão do site
    // vira uma decisão de compliance sem ninguém perceber.
    const res = await GET();
    expect(res.status, "a porta deixou de ser um desvio").toBe(307);
    expect(res.headers.get("location"), "a porta deixou de ter destino").toBeTruthy();
  });
});
