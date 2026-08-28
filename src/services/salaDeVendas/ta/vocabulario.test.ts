/**
 * A BUSCA ENTENDE QUEM FALA COMO GENTE — e continua dizendo "não sei".
 *
 * ── OS TRÊS DEFEITOS QUE ESTE ARQUIVO GUARDA ────────────────────────────────
 *
 * Todos foram medidos em 28/08/2026, na véspera de o Foocci começar a abordar
 * leads. Nenhum aparecia como erro: apareciam como o agente respondendo
 * *"não sei"* a uma pergunta que ele sabia responder — e ninguém descobre o
 * porquê disso, porque a conversa simplesmente segue pior.
 *
 *  1. **O plural.** `"plano"` achava 7 itens; `"planos"`, zero. Uma letra. E o
 *     cliente fala no plural o tempo todo: "os planos", "as taxas", "minhas
 *     lojas".
 *
 *  2. **A frase natural.** `"quanto o ifood cobra"` achava; `"quanto eu
 *     economizo saindo do ifood"` não. A conta dividia pelas palavras TODAS da
 *     pergunta, então cada palavra a mais derrubava a nota — falhava por um
 *     centésimo. O primeiro é como se digita numa busca; o segundo é como um
 *     dono de restaurante pergunta.
 *
 *  3. **A palavra que está em todo lugar.** `"meu cachorro está doente"`
 *     devolvia dois itens de PREÇO, porque "esta" era a única palavra que a
 *     base conhecia e sozinha valia 100%.
 *
 * ── ⚠️ E POR QUE AS DUAS METADES IMPORTAM AQUI MAIS QUE EM QUALQUER LUGAR ───
 *
 * Afrouxar a busca é fácil e é o remédio errado. Uma busca que devolve sempre
 * alguma coisa faz o agente responder com o item mais parecido — que é como um
 * agente ensina o que não existe com cara de fundamentado. É a lição de
 * 04/08/2026, quando 30 de 30 perguntas devolviam um guia.
 *
 * Por isso cada caso daqui vem em par: uma pergunta de venda de verdade que
 * PRECISA achar, e uma pergunta fora do assunto que PRECISA voltar vazia.
 */

import { describe, it, expect } from "vitest";
import { palavras, VAZIAS } from "./vocabulario";
import { buscarNaVerdade } from "./verdade";
import { buscarNoConhecimento } from "./conhecimento";

describe("⭐⭐ o plural não pode derrubar a busca", () => {
  it("⭐⭐ singular e plural chegam no mesmo termo", () => {
    // O caso medido: "plano" → 7, "planos" → 0.
    for (const [plural, singular] of [
      ["planos", "plano"],
      ["taxas", "taxa"],
      ["lojas", "loja"],
      ["clientes", "cliente"],
      ["pedidos", "pedido"],
      ["integracoes", "integracao"],
      ["canais", "canal"],
    ] as const) {
      expect(palavras(plural), `"${plural}" não virou "${singular}"`).toEqual(
        palavras(singular),
      );
    }
  });

  it("⭐⭐ plural de palavra terminada em consoante — 'bares' é 'bar'", () => {
    // O caso mais caro dos medidos, porque bar é METADE do público: o CEO
    // define o atendimento como "restaurantes, bares e afins". Tirar só o "s"
    // dava "bare", que não é palavra nenhuma e não casa com nada.
    for (const [plural, singular] of [
      ["bares", "bar"],
      ["lugares", "lugar"],
      ["vezes", "vez"],
      ["luzes", "luz"],
      ["garcons", "garcom"], // pela regra do "-ns"
    ] as const) {
      expect(palavras(plural), `"${plural}" não virou "${singular}"`).toEqual(
        palavras(singular),
      );
    }
  });

  it("⭐ e a regra do -es NÃO come a última letra de quem acaba em -e", () => {
    // A metade que protege: "clientes" tem de virar "cliente", nunca "client".
    // Se a condição olhasse só o "-es", metade do vocabulário viraria toco.
    expect(palavras("clientes")).toEqual(["cliente"]);
    expect(palavras("gerentes")).toEqual(["gerente"]);
    expect(palavras("pedidos")).toEqual(["pedido"]);
  });

  it("⭐ mas palavra curta terminada em s continua inteira", () => {
    // "mes" virando "me" quebraria "quanto custa por mês" — a pergunta número
    // um de qualquer venda.
    expect(palavras("mes")).toEqual(["mes"]);
    expect(palavras("gas")).toEqual(["gas"]);
  });

  it("⭐⭐ e a pergunta no plural acha o que a no singular acha", () => {
    // O teste que fecha o buraco de ponta a ponta.
    expect(buscarNaVerdade("qual a diferença entre os planos").length).toBeGreaterThan(0);
    expect(buscarNaVerdade("quais são as taxas").length).toBeGreaterThan(0);
  });
});

describe("⭐⭐ quem fala como gente é atendido — no CONTEXTO", () => {
  const DE_VERDADE = [
    "vocês guardam os dados dos meus clientes",
    "quais integrações vocês tem",
    "como funciona o cardápio digital pro meu cliente",
    "meu cliente consegue pedir pelo whatsapp",
  ];

  it("⭐⭐ a pergunta natural encontra contexto para o modelo ler", () => {
    // ⚠️ A conta dividia pelas palavras TODAS da pergunta, então cada palavra a
    // mais derrubava a nota: "quanto o ifood cobra" passava e "quanto eu
    // economizo saindo do ifood" não. O primeiro é como se digita numa busca; o
    // segundo é como um dono de restaurante pergunta.
    //
    // Agora as palavras que o corpus não usa saem do denominador. "economizo" e
    // "saindo" não são evidência de casamento ruim — são vocabulário que não é
    // dele.
    const vazias = DE_VERDADE.filter((p) => buscarNoConhecimento(p).length === 0);
    expect(
      vazias,
      `o modelo escreveria sem contexto sobre: ${vazias.join(" | ")}`,
    ).toEqual([]);
  });

  it("⭐⭐ e o argumento de venda da casa é achável do jeito que o lead fala", () => {
    // A comissão do marketplace é O argumento do Foocci, e o índice dele estava
    // escrito como busca ("quanto o ifood cobra"), não como fala de gente.
    // Corrigido no campo `sobre` do item — índice, não régua. O que o TA AFIRMA
    // não mudou uma vírgula.
    for (const p of [
      "quanto eu economizo saindo do ifood",
      "vale a pena sair do ifood",
      "quanto eu perco pro ifood",
    ]) {
      expect(buscarNaVerdade(p).length, `"${p}" não acha a comissão`).toBeGreaterThan(0);
    }
  });

  it("⭐⭐ mas a base de AFIRMAÇÃO continua estrita — e é para continuar", () => {
    // ── A tentação que eu tive, e por que ela está errada ─────────────────
    //
    // O mesmo conserto aplicado a `buscarNaVerdade` derrubou dois testes na
    // hora: "vocês integram com o sistema Colibri?" e "como funciona o pagamento
    // por pix?" passaram a achar material. Os dois PRECISAM dar "não sei" — a
    // palavra que carrega a pergunta o corpus não conhece, e o que casou foi
    // contexto de apoio.
    //
    // Tentei separar os casos por raridade do termo e medi que não dá: nesta
    // base, "sistema" e "pagamento" são tão raros quanto "ifood". Sobreposição
    // de palavras não distingue "é sobre algo que eu conheço" de "casou por
    // acaso". Então a régua da afirmação fica estrita, de propósito.
    //
    // Este caso existe para que a próxima pessoa que tiver a mesma ideia veja o
    // teste cair e leia o porquê antes de insistir.
    for (const p of ["vocês integram com o sistema Colibri?", "como funciona o pagamento por pix?"]) {
      expect(
        buscarNaVerdade(p),
        `"${p}" virou afirmação — o TA daria a entender que conhece o que não conhece`,
      ).toEqual([]);
    }
  });
});

describe("⭐⭐ e continua dizendo NÃO SEI para o que não é dele", () => {
  const FORA = [
    "vocês vendem carro",
    "qual a previsão do tempo amanhã",
    "meu cachorro está doente",
    "meu carro está quebrado",
    "quero comprar um apartamento",
    "boa tarde tudo bem",
  ];

  it("⭐⭐ pergunta fora do assunto não vira AFIRMAÇÃO", () => {
    // A metade que impede a correção de virar afrouxamento. Sem ela, a maneira
    // mais fácil de fazer o bloco acima passar seria devolver tudo sempre — e
    // aí o agente responde preço para quem perguntou do cachorro.
    // ⚠️ Só a base de afirmação é cobrada aqui, e é decisão do desenho: a de
    // conhecimento não tem piso de propósito — mandar um parágrafo pouco
    // relacionado junto não faz o modelo mentir, faz ele ignorar. Exigir vazio
    // lá empurraria alguém a pôr um piso onde ele atrapalha.
    const acharam = FORA.filter((p) => buscarNaVerdade(p).length > 0);
    expect(
      acharam,
      `respondeu coisa de venda para: ${acharam.join(" | ")}`,
    ).toEqual([]);
  });

  it("⭐ o verbo de ligação não vale busca sozinho", () => {
    // Era "esta" que fazia a pergunta do cachorro casar com a tabela de preço:
    // única palavra conhecida, 100% de cobertura, dois itens devolvidos.
    for (const p of ["esta", "estao", "muito", "onde", "quando", "tudo"]) {
      expect(VAZIAS.has(p), `"${p}" ainda vale busca`).toBe(true);
    }
  });
});

describe("⭐ a lista de palavras vazias mora num lugar só", () => {
  it("as duas buscas usam a mesma", async () => {
    // ⚠️ Já esteve duplicada em `verdade.ts` e `conhecimento.ts`. Em 28/08 eu
    // acrescentei uma palavra a uma delas e o defeito continuou de pé, porque a
    // busca que eu estava consertando lia a outra. A divergência não aparece
    // como erro: aparece como o agente achando numa pergunta e não achando na
    // irmã dela.
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");

    for (const arquivo of ["verdade.ts", "conhecimento.ts"]) {
      const fonte = readFileSync(join(__dirname, arquivo), "utf8");
      expect(
        fonte,
        `${arquivo} voltou a declarar a própria lista de palavras vazias`,
      ).not.toMatch(/const\s+VAZIAS\s*=/);
      expect(fonte, `${arquivo} não importa de vocabulario.ts`).toMatch(
        /from\s+"\.\/vocabulario"/,
      );
    }
  });
});
