/**
 * O MURO ENTRE "O QUE O TA SABE" E "O QUE UM PROSPECTO PODE OUVIR".
 *
 * ── O DEFEITO QUE ESTE ARQUIVO IMPEDE ───────────────────────────────────────
 *
 * O Manual Operacional descreve o produto inteiro — inclusive o que **ainda não
 * existe**. Tem um capítulo "Backlog", um "Histórico de Decisões", e quase todo
 * capítulo termina com uma seção "Gaps conhecidos" que lista, com todas as
 * letras, o que ainda não funciona bem.
 *
 * Um SDR municiado com isso vira o pior vendedor possível: o que promete o
 * roadmap. O cliente compra a promessa e descobre na implantação — e aí não é
 * mais um problema de vendas, é um pedido de reembolso.
 *
 * Estes casos não conferem uma lista de configuração. Eles procuram **frases
 * reais** do backlog e dos gaps dentro da base montada, e exigem que não estejam
 * lá. Um teste que só verificasse a constante `CAPITULOS_PERMITIDOS` passaria no
 * dia em que o filtro de seção quebrasse.
 */

import { describe, it, expect } from "vitest";
import { MANUAL_V01_CONTENT } from "@/services/manual/manualV01Content";
import {
  baseDeConhecimento,
  buscarNoConhecimento,
  CAPITULOS_PERMITIDOS,
  PEDACOS_POR_TURNO,
} from "./conhecimento";

const BASE = baseDeConhecimento();
const TUDO = BASE.map((p) => p.texto).join("\n").toLowerCase();

describe("o TA conhece o produto de verdade", () => {
  it("a base não é simbólica — cobre o produto inteiro", () => {
    // A metade que passa. Sem ela, um filtro que rejeitasse TUDO passaria em
    // todos os casos de bloqueio abaixo e deixaria o TA sem saber nada.
    expect(BASE.length).toBeGreaterThan(30);
    expect(TUDO.length).toBeGreaterThan(8_000);
  });

  it("cada capítulo permitido contribuiu com alguma coisa", () => {
    // Um capítulo que some da base sem ninguém notar é conhecimento que o TA
    // perdeu em silêncio — e o sintoma seria "ele não sabe falar de pagamento".
    for (const slug of CAPITULOS_PERMITIDOS) {
      const pedacos = BASE.filter((p) => p.capitulo === slug);
      expect(pedacos.length, `o capítulo ${slug} não trouxe nada`).toBeGreaterThan(0);
    }
  });

  it("sabe responder as perguntas que derrubam negócio", () => {
    // As três que mais aparecem numa conversa de venda de verdade.
    for (const pergunta of [
      "vocês integram com o meu sistema de PDV",
      "como funciona o pagamento pelo pix",
      "vocês mandam mensagem para o cliente voltar a comprar",
    ]) {
      expect(buscarNoConhecimento(pergunta).length, pergunta).toBeGreaterThan(0);
    }
  });

  it("manda poucos pedaços por turno, e os mais próximos primeiro", () => {
    const achados = buscarNoConhecimento("como funciona o pix no checkout");
    expect(achados.length).toBeLessThanOrEqual(PEDACOS_POR_TURNO);
    expect(achados[0]!.capitulo).toBe("checkout-pagamentos");
  });
});

describe("⭐ o que NÃO existe nunca chega ao prospecto", () => {
  it("nenhum capítulo proibido entrou", () => {
    const proibidos = ["backlog", "historico-de-decisoes", "seguranca-operacional",
                       "arquitetura-do-sistema", "branding", "ui-ux", "principios-operacionais"];
    for (const slug of proibidos) {
      expect(BASE.some((p) => p.capitulo === slug), `capítulo ${slug} vazou`).toBe(false);
    }
  });

  it("⭐ nenhuma seção 'Gaps conhecidos' atravessou, nem de capítulo permitido", () => {
    // O caso que carrega o arquivo. "Gaps conhecidos" mora DENTRO de capítulos
    // autorizados — bloquear por capítulo não bastaria.
    expect(BASE.some((p) => /gaps?/i.test(p.secao)), "seção de gaps na base").toBe(false);
  });

  it("⭐ frases REAIS do backlog não estão na base", () => {
    // A prova pelo conteúdo, e não pela configuração. Estas frases são copiadas
    // do capítulo Backlog: se qualquer uma aparecer, o TA pode prometê-la a quem
    // está decidindo se compra.
    //
    // ⚠️ Só o `backlog`, e o "só" é a lição de 26/08/2026. A primeira versão
    // deste caso incluía `historico-de-decisoes` e reprovou em "Campanhas ativas
    // devem aparecer no topo" — que está no capítulo do CRM como recurso
    // ENTREGUE, e no histórico apenas repetida como a decisão que a originou.
    // O histórico é resumo do que já foi decidido e construído; suas frases
    // reaparecem legitimamente nos capítulos permitidos. Incluí-lo aqui não
    // pegaria vazamento nenhum — reprovaria por coincidência, que é o jeito mais
    // rápido de um portão ser desligado por incômodo.
    //
    // Que o CAPÍTULO histórico não entra na base, quem prova é o caso acima.
    const frasesQueNaoPodemVazar = MANUAL_V01_CONTENT
      .filter((c) => c.slug === "backlog")
      .flatMap((c) =>
        c.content
          .split("\n")
          .map((l) => l.replace(/^[-*#\s]+/, "").trim())
          .filter((l) => l.length > 25),
      );

    expect(frasesQueNaoPodemVazar.length, "o Manual mudou: não achei o backlog")
      .toBeGreaterThan(5);

    const vazadas = frasesQueNaoPodemVazar.filter((f) => TUDO.includes(f.toLowerCase()));
    expect(vazadas, `frases de backlog na base: ${vazadas.slice(0, 3).join(" | ")}`).toEqual([]);
  });

  it("as palavras do que-ainda-não-é não aparecem", () => {
    for (const marca of [/precisa evoluir/i, /pode estar parcial/i, /precisa valida[çc][ãa]o cont[íi]nua/i]) {
      expect(TUDO, `marca de gap na base: ${marca}`).not.toMatch(marca);
    }
  });
});

describe("a lista de permissão é lista de PERMISSÃO", () => {
  it("um capítulo novo no Manual NÃO entra sozinho", () => {
    // A razão de ser lista de permissão e não de bloqueio. No dia em que alguém
    // adicionar um capítulo ao Manual, ele fica de fora até uma pessoa decidir
    // que um estranho pode lê-lo. Lista de bloqueio deixaria o capítulo novo
    // entrar calado — e ninguém revisa o que entrou sem avisar.
    const noManual = new Set(MANUAL_V01_CONTENT.map((c) => c.slug));
    const naBase = new Set(BASE.map((p) => p.capitulo));

    for (const slug of noManual) {
      if ((CAPITULOS_PERMITIDOS as readonly string[]).includes(slug)) continue;
      expect(naBase.has(slug), `${slug} entrou sem estar na lista`).toBe(false);
    }
  });
});
