/**
 * A FICHA DO LEAD — e os dois vazios que uma tela costuma contar errado.
 *
 * ── O QUE ESTES CASOS GUARDAM ───────────────────────────────────────────────
 *
 *  · **formulário vazio derrubando a tela** — a maioria dos campos do site é
 *    opcional, e o lead que só deixou nome e WhatsApp é o caso COMUM. Uma ficha
 *    que só sabe desenhar o caso completo quebra justamente no mais frequente;
 *  · **origem vazia virando travessão** — "não tem UTM" e "não sei de onde veio"
 *    parecem a mesma coisa na tela e não são. O primeiro tem resposta: a pessoa
 *    entrou direto. Escrever "—" transfere a dúvida para quem lê, e uma decisão
 *    de mídia é tomada em cima disso.
 *
 * As duas metades em cada regra: o vazio diz a verdade E o cheio não é apagado
 * pelo cuidado com o vazio.
 */

import { describe, it, expect } from "vitest";
import {
  respostasDoFormulario,
  origemDoLead,
  type CamposDeOrigem,
} from "./fichaDoLead";

const SEM_ORIGEM: CamposDeOrigem = {
  origem: null,
  utmSource: null,
  utmMedium: null,
  utmCampaign: null,
  utmContent: null,
  utmTerm: null,
  clickId: null,
  landingPath: null,
  referrer: null,
};

describe("⭐ o que a pessoa respondeu no formulário", () => {
  it("lead que só deixou nome e WhatsApp devolve lista VAZIA — e não quatro travessões", () => {
    const r = respostasDoFormulario({
      restaurante: null,
      cidade: null,
      tipo: null,
      desafio: null,
    });

    expect(r).toEqual([]);
  });

  it("a metade que passa: quem respondeu tudo tem as quatro perguntas, na ordem do formulário", () => {
    // Sem este caso, uma função que devolvesse sempre `[]` passaria no de cima.
    const r = respostasDoFormulario({
      restaurante: "Cantina da Nona",
      cidade: "Santos",
      tipo: "Italiano",
      desafio: "Perco pedido no WhatsApp",
    });

    expect(r.map((x) => x.pergunta)).toEqual([
      "Nome do restaurante",
      "Cidade",
      "Tipo de restaurante",
      "Principal desafio",
    ]);
    expect(r[3]!.resposta).toBe("Perco pedido no WhatsApp");
  });

  it("⭐ o DESAFIO aparece — é a dor escrita pela própria pessoa", () => {
    // Era o único campo do formulário que a Sala não lia. O vendedor abria a
    // conversa e perguntava exatamente o que já estava respondido.
    const r = respostasDoFormulario({
      restaurante: null,
      cidade: null,
      tipo: null,
      desafio: "Não consigo controlar o estoque",
    });

    expect(r).toEqual([
      { pergunta: "Principal desafio", resposta: "Não consigo controlar o estoque" },
    ]);
  });

  it("campo em branco some da lista em vez de virar linha vazia", () => {
    const r = respostasDoFormulario({
      restaurante: "Bar do Zé",
      cidade: null,
      tipo: null,
      desafio: null,
    });

    expect(r).toHaveLength(1);
    expect(r[0]!.pergunta).toBe("Nome do restaurante");
  });
});

describe("⭐ de onde o contato veio", () => {
  it("sem NENHUM sinal, o rótulo diz 'Direto / não identificado' — nunca vazio", () => {
    const o = origemDoLead(SEM_ORIGEM);

    expect(o.rotulo).toBe("Direto / não identificado");
    expect(o.rotulo).not.toBe("");
    expect(o.canalRotulo).toBe("Direto");
    expect(o.temSinalDeCampanha).toBe(false);
  });

  it("a metade que passa: com campanha, o rótulo é a campanha e o canal é reconhecido", () => {
    // Sem este caso, uma função que devolvesse SEMPRE "não identificado"
    // passaria no de cima — e o time perderia a única resposta que interessa.
    const o = origemDoLead({
      ...SEM_ORIGEM,
      utmSource: "facebook",
      utmMedium: "cpc",
      utmCampaign: "black-friday",
      utmContent: "video-15s",
    });

    expect(o.rotulo).toBe("black-friday · video-15s");
    expect(o.canal).toBe("facebook");
    expect(o.canalRotulo).toBe("Facebook");
    expect(o.temSinalDeCampanha).toBe(true);
  });

  it("⭐ só `utm_medium` já é sinal de campanha", () => {
    // A tela velha checava quatro dos sete sinais, e este ficava de fora: um
    // lead com medium e mais nada aparecia como "sem sinal de campanha" numa
    // tela e não na outra. A conta agora é uma só, e é esta.
    const o = origemDoLead({ ...SEM_ORIGEM, utmMedium: "cpc" });

    expect(o.temSinalDeCampanha).toBe(true);
  });

  it("um clique de anúncio sem utm ainda é sinal — o carimbo é evidência", () => {
    const o = origemDoLead({ ...SEM_ORIGEM, clickId: "fb.1.2.3" });

    expect(o.temSinalDeCampanha).toBe(true);
  });

  it("entrou por uma página, sem campanha: o rótulo diz a página e NÃO promete anúncio", () => {
    const o = origemDoLead({ ...SEM_ORIGEM, origem: "/site/demonstracao" });

    expect(o.rotulo).toContain("/site/demonstracao");
    expect(o.rotulo).toContain("Direto");
    expect(o.temSinalDeCampanha, "página de entrada virou sinal de campanha").toBe(false);
  });

  it("as sete colunas viajam cruas, para quem quiser reagrupar sem depender do rótulo", () => {
    const o = origemDoLead({
      origem: "/site",
      utmSource: "google",
      utmMedium: "cpc",
      utmCampaign: "marca",
      utmContent: "anuncio-a",
      utmTerm: "sistema para restaurante",
      clickId: "gclid-1",
      landingPath: "/site?utm_source=google",
      referrer: "google.com",
    });

    expect(o.utmTerm).toBe("sistema para restaurante");
    expect(o.landingPath).toBe("/site?utm_source=google");
    expect(o.referrer).toBe("google.com");
    expect(o.legado).toBe("/site");
  });
});
