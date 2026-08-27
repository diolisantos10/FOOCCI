/**
 * O QUALIFICADOR, DE PONTA A PONTA — conversa entra, etiqueta sai.
 *
 * ── A PERGUNTA QUE ORIGINOU ESTE ARQUIVO ────────────────────────────────────
 *
 * O CEO, em 27/08/2026: *"você já fez teste com esse qualificador?"*
 *
 * A resposta honesta era não — e o buraco era maior. `score.ts` sabia virar
 * sinais em `FRIO / MORNO / QUENTE`, estava testado, e **ninguém o chamava**. O
 * agente perguntava "quantas unidades você tem?", a pessoa respondia "três", e a
 * resposta morria na conversa.
 *
 * Os outros arquivos testam pedaços: `sondagem.test` prova que o extrator não
 * inventa, `score.test` prova que a régua soma certo. Nenhum dos dois prova o
 * que o CEO perguntou — **que uma conversa de verdade produz a etiqueta certa**.
 *
 * ── POR QUE A RÉGUA APARECE AQUI E NÃO SÓ NO score.test ─────────────────────
 *
 * Porque a pergunta comercial é "esse lead é quente?", e a resposta depende dos
 * dois: do que foi extraído E de como a régua soma. Um extrator perfeito com uma
 * régua desregulada entrega a fila errada ao closer, e cada teste isolado
 * passaria.
 */

import { describe, it, expect } from "vitest";
import { calcularScore, temperaturaDe, type SinaisDoLead } from "../score";
import { juntarSinais } from "./sondagem";

/** O que o site já sabe quando a pessoa chega — tipo e desafio do formulário. */
function doFormulario(over: Partial<SinaisDoLead> = {}): SinaisDoLead {
  return { ehRestaurante: true, dorPrincipal: "taxa alta", ...over };
}

function etiquetaDe(sinais: SinaisDoLead) {
  const r = calcularScore(sinais);
  return { total: r.total, etiqueta: r.temperatura, lacunas: r.lacunas };
}

describe("⭐ as três etiquetas do CEO", () => {
  it("QUENTE — quem tem porte, dor e pressa", () => {
    // Nas palavras dele: *"o quente quer fechar esse mês"*.
    const conversa: SinaisDoLead = {
      unidades: 3,
      volumeMensal: 1200,
      canaisAtuais: ["ifood", "whatsapp"],
      sistemaAtual: "Colibri",
      dorPrincipal: "pago 27% de taxa no iFood",
      urgencia: "quero resolver esse mês",
      poderDeDecisao: "sou o dono",
      mensagensDoLead: 6,
    };

    const { etiqueta, total } = etiquetaDe(juntarSinais(conversa, doFormulario()));

    expect(
      ["QUENTE", "PRIORIDADE_MAXIMA"],
      `deu ${etiqueta} com ${total} pontos`,
    ).toContain(etiqueta);
  });

  it("FRIO — quem só disse oi", () => {
    // *"O frio vai pensar."* Uma pessoa que mandou duas mensagens e não contou
    // nada não pode chegar quente na fila do closer.
    const conversa: SinaisDoLead = { mensagensDoLead: 2 };

    const { etiqueta } = etiquetaDe(juntarSinais(conversa, doFormulario()));

    expect(["FRIO", "MORNO"], `um "oi" virou ${etiqueta}`).toContain(etiqueta);
    expect(etiqueta).not.toBe("QUENTE");
  });

  it("⭐ MORNO fica ENTRE os dois — a etiqueta do meio existe de verdade", () => {
    // A que mais fácil desaparece. Uma régua mal calibrada produz só frio e
    // quente, e o *"quer fechar mas não neste mês"* some — que é justamente
    // quem precisa de agendamento, não de ataque.
    const meio: SinaisDoLead = {
      unidades: 1,
      canaisAtuais: ["whatsapp"],
      dorPrincipal: "quero parar de anotar pedido no papel",
      mensagensDoLead: 4,
    };

    const morno = etiquetaDe(juntarSinais(meio, doFormulario())).total ?? 0;
    const frio = etiquetaDe(juntarSinais({ mensagensDoLead: 2 }, doFormulario())).total ?? 0;
    const quente = etiquetaDe(
      juntarSinais(
        {
          unidades: 3,
          volumeMensal: 1200,
          canaisAtuais: ["ifood", "whatsapp"],
          sistemaAtual: "Colibri",
          dorPrincipal: "taxa de 27%",
          urgencia: "esse mês",
          poderDeDecisao: "sou o dono",
          mensagensDoLead: 6,
        },
        doFormulario(),
      ),
    ).total ?? 0;

    expect(morno, `morno (${morno}) não ficou acima do frio (${frio})`).toBeGreaterThan(frio);
    expect(morno, `morno (${morno}) não ficou abaixo do quente (${quente})`).toBeLessThan(quente);
  });
});

describe("⭐ o que NUNCA pode virar lead quente", () => {
  it("quem não vende comida é desqualificado, por mais sinal que tenha", () => {
    // Uma loja de roupa com 5 unidades e pressa somaria pontos e entraria na
    // fila do closer. `ehRestaurante: false` tem que vencer todo o resto.
    const sinais: SinaisDoLead = {
      unidades: 5,
      volumeMensal: 3000,
      urgencia: "hoje",
      poderDeDecisao: "sou o dono",
      mensagensDoLead: 9,
      ehRestaurante: false,
    };

    expect(etiquetaDe(sinais).etiqueta).toBe("DESQUALIFICADO");
  });

  it("⭐⭐ MAS UM BAR É CLIENTE — a desqualificação não pode pegar quem paga", () => {
    // ── A correção do CEO, 27/08/2026 ──────────────────────────────────────
    //
    // *"o Foocci só atende restaurantes, bares e afins"*.
    //
    // O campo se chama `ehRestaurante`, e o nome é mais estreito que a regra.
    // A régua não erra sozinha: quem erra é quem preenche o campo lendo o nome
    // dele. O outro lado da trava está na instrução da sondagem, que nomeia bar,
    // boteco e padaria como público; aqui se prova o que acontece depois — que
    // um bar com bons sinais atravessa a régua inteira e chega ao closer.
    //
    // É o par do caso acima: um prova que a peneira segura a loja de roupa, o
    // outro prova que ela deixa o bar passar. Uma peneira que só faz a primeira
    // metade parece funcionar e mata a carteira.
    const bar: SinaisDoLead = {
      unidades: 2,
      volumeMensal: 1400,
      canaisAtuais: ["ifood", "whatsapp"],
      dorPrincipal: "a taxa do delivery come a margem do chope",
      urgencia: "quero resolver esse mês",
      poderDeDecisao: "sou o dono",
      mensagensDoLead: 6,
      ehRestaurante: true,
    };

    const { etiqueta, total } = etiquetaDe(bar);

    expect(etiqueta, "o bar foi barrado — isso é cliente perdido").not.toBe("DESQUALIFICADO");
    expect(
      ["QUENTE", "PRIORIDADE_MAXIMA"],
      `um bar com dor, pressa e dono na conversa deu ${etiqueta} com ${total} pontos`,
    ).toContain(etiqueta);
  });

  it("⭐ e quem não disse o ramo apenas não foi perguntado — não é desqualificado", () => {
    // `null` é a resposta certa quando ninguém falou do negócio. Se ele
    // funcionasse como `false`, todo lead começaria desqualificado e sairia da
    // fila antes da primeira pergunta — o guardrail da casa: ausência de
    // informação não é informação.
    const semRamo: SinaisDoLead = {
      unidades: 3,
      urgencia: "essa semana",
      mensagensDoLead: 5,
      ehRestaurante: null,
    };

    expect(
      etiquetaDe(semRamo).etiqueta,
      "silêncio sobre o ramo virou desqualificação",
    ).not.toBe("DESQUALIFICADO");
  });

  it("⭐ e a desqualificação sobrevive à conversa seguinte", () => {
    // O caminho pelo qual ela quase escapa: o turno seguinte extrai
    // `ehRestaurante: true` porque a pessoa falou de comida, e o lead
    // ressuscita. `juntarSinais` mantém o `false`.
    const juntado = juntarSinais({ ehRestaurante: false, mensagensDoLead: 4 }, doFormulario());
    expect(etiquetaDe(juntado).etiqueta).toBe("DESQUALIFICADO");
  });
});

describe("⭐ ausência de informação não vale ponto", () => {
  it("ninguém disse nada → score null, e NÃO zero", () => {
    // Zero diria "avaliado e não presta". `null` diz "ninguém perguntou ainda",
    // que é a verdade e é acionável: é a fila de quem falta qualificar.
    const r = calcularScore({});
    expect(r.total, "score zero fabricado a partir de silêncio").toBeNull();
    expect(r.temperatura).toBeNull();
  });

  it("e a régua diz o que ainda falta perguntar", () => {
    // É isto que vira a próxima pergunta do agente. Sem lacunas nomeadas, ele
    // pergunta ao acaso e repete o que a pessoa já respondeu.
    const r = calcularScore({ unidades: 2 });
    expect(r.lacunas.length, "a régua não sabe o que falta").toBeGreaterThan(0);
  });
});

describe("a fronteira das faixas", () => {
  it("os cortes são onde a régua diz que são", () => {
    // Fronteira é onde mora o erro de um-a-mais, e ela decide fila comercial:
    // 59 pontos é morno e 60 é quente, e o closer só olha a partir de quente.
    expect(temperaturaDe(80)).toBe("PRIORIDADE_MAXIMA");
    expect(temperaturaDe(79)).toBe("QUENTE");
    expect(temperaturaDe(60)).toBe("QUENTE");
    expect(temperaturaDe(59)).toBe("MORNO");
    expect(temperaturaDe(35)).toBe("MORNO");
    expect(temperaturaDe(34)).toBe("FRIO");
    expect(temperaturaDe(0)).toBe("FRIO");
  });
});

describe("⭐ o formulário não some quando a conversa começa", () => {
  it("o desafio digitado no site vira dor, mesmo sem ele repetir na conversa", () => {
    // Ignorar o formulário faria o agente perguntar de novo o que a pessoa já
    // respondeu — o defeito que mais rápido faz alguém desistir.
    const juntado = juntarSinais(
      { unidades: 2, mensagensDoLead: 3 },
      doFormulario({ dorPrincipal: "perco pedido no horário de pico" }),
    );

    expect(juntado.dorPrincipal).toBe("perco pedido no horário de pico");
    expect(juntado.ehRestaurante).toBe(true);
  });

  it("⭐ mas a CONVERSA vence o formulário quando os dois falam", () => {
    // O menu suspenso é o que a pessoa achou que era o problema antes de
    // conversar. O que ela disse depois é mais recente e mais específico.
    const juntado = juntarSinais(
      { dorPrincipal: "na verdade é a taxa do iFood, 27%" },
      doFormulario({ dorPrincipal: "taxa alta" }),
    );

    expect(juntado.dorPrincipal).toContain("27%");
  });
});
