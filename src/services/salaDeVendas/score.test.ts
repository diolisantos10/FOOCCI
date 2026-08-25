/**
 * O score, e a regra que ele existe para sustentar: **null não é zero**.
 *
 * O teste que mais importa neste arquivo é o do lead sem nenhum sinal. É a
 * diferença entre "avaliamos e não presta" e "ninguém perguntou nada ainda" — e
 * só a segunda é uma fila de trabalho.
 */

import { describe, it, expect } from "vitest";
import { calcularScore, temperaturaDe, VERSAO_DA_REGUA } from "./score";

describe("um lead sobre quem não se sabe nada", () => {
  it("tem score null — nunca zero", () => {
    const r = calcularScore({});
    expect(r.total).toBeNull();
    expect(r.temperatura).toBeNull();
  });

  it("e o que falta perguntar vem listado", () => {
    // As lacunas viram as próximas perguntas do TA. Sem elas, "não sei nada"
    // seria um beco: verdadeiro e inútil.
    const r = calcularScore({});
    expect(r.lacunas).toContain("quantas unidades");
    expect(r.lacunas).toContain("qual a dor principal");
    expect(r.lacunas).toContain("quem decide");
  });

  it("orçamento NÃO entra nas lacunas", () => {
    // Perguntar faixa de orçamento cedo demais queima a conversa. O comando pede
    // que ele conte "quando informado" — não que seja perseguido.
    expect(calcularScore({}).lacunas).not.toContain("faixa de orçamento");
  });
});

describe("um lead com sinais", () => {
  const bom = {
    unidades: 6,
    volumeMensal: 4000,
    canaisAtuais: ["iFood", "WhatsApp"],
    sistemaAtual: "Anota AI",
    dorPrincipal: "perco pedido no WhatsApp",
    urgencia: "quero resolver essa semana",
    poderDeDecisao: "sou o dono",
    mensagensDoLead: 12,
  };

  it("pontua alto e sai como prioridade máxima", () => {
    // A metade que PASSA: sem ela, uma função que devolvesse sempre null
    // continuaria verde nos testes de cima.
    const r = calcularScore(bom);
    expect(r.total).toBeGreaterThanOrEqual(80);
    expect(r.temperatura).toBe("PRIORIDADE_MAXIMA");
  });

  it("cada ponto tem endereço — a conta é devolvida inteira", () => {
    // Item 10: "não utilizar uma pontuação opaca sem explicação".
    const r = calcularScore(bom);
    const fatores = r.fatores.map((f) => f.fator);

    expect(fatores).toContain("unidades");
    expect(fatores).toContain("marketplace");
    expect(fatores).toContain("dor");
    expect(fatores).toContain("engajamento");
  });

  it("cada fator diz o que foi OBSERVADO, não só o peso", () => {
    // "18 pontos" não se discute. "depende de marketplace: 18" se discute.
    const r = calcularScore(bom);
    const marketplace = r.fatores.find((f) => f.fator === "marketplace")!;
    expect(marketplace.observado).toBe("depende de marketplace");
  });

  it("a versão da régua acompanha o resultado", () => {
    // Sem versão, mexer nos pesos reescreveria a explicação de scores antigos.
    expect(calcularScore(bom).versao).toBe(VERSAO_DA_REGUA);
  });

  it("nunca passa de 100", () => {
    const r = calcularScore({ ...bom, faixaDeOrcamento: "até R$ 1.000" });
    expect(r.total).toBeLessThanOrEqual(100);
  });
});

describe("dependência de marketplace é o maior sinal de compra", () => {
  it("vale mais que porte", () => {
    // Quem paga comissão alta sente a dor que o produto resolve. Um lead pequeno
    // preso ao iFood interessa mais que uma rede grande sem essa dor.
    const comMarketplace = calcularScore({ unidades: 1, canaisAtuais: ["iFood"] });
    const semNada = calcularScore({ unidades: 5, canaisAtuais: ["salão"] });

    const pontosMarketplace = comMarketplace.fatores.find((f) => f.fator === "marketplace")!.pontos;
    const pontosUnidades = semNada.fatores.find((f) => f.fator === "unidades")!.pontos;

    expect(pontosMarketplace).toBeGreaterThan(pontosUnidades);
  });

  it("quem só usa salão ainda pontua, mas pouco", () => {
    const r = calcularScore({ canaisAtuais: ["salão"] });
    expect(r.fatores.find((f) => f.fator === "canais")!.pontos).toBeLessThan(10);
  });
});

describe("quem não é restaurante", () => {
  it("é desqualificado, e a conta para ali", () => {
    // Somar urgência a quem não é do público produziria um lead "quente" que
    // nenhum vendedor deveria tocar.
    const r = calcularScore({
      ehRestaurante: false,
      unidades: 50,
      urgencia: "urgente",
      dorPrincipal: "preciso muito",
    });

    expect(r.temperatura).toBe("DESQUALIFICADO");
    expect(r.total).toBe(0);
    expect(r.fatores).toHaveLength(1);
  });

  it("aqui zero é verdade, e por isso é zero e não null", () => {
    // A única situação do arquivo em que zero é a resposta certa: houve
    // avaliação, e ela deu negativa.
    expect(calcularScore({ ehRestaurante: false }).total).toBe(0);
  });
});

describe("urgência declarada muda o peso", () => {
  it("'quero para ontem' vale mais que 'estou pesquisando'", () => {
    const agora = calcularScore({ urgencia: "preciso agora" });
    const depois = calcularScore({ urgencia: "estou só pesquisando" });

    expect(agora.fatores[0]!.pontos).toBeGreaterThan(depois.fatores[0]!.pontos);
  });
});

describe("engajamento é contado, não declarado", () => {
  it("quem escreveu dez vezes pontua mais que quem escreveu uma", () => {
    const muito = calcularScore({ mensagensDoLead: 12 });
    const pouco = calcularScore({ mensagensDoLead: 1 });
    expect(muito.fatores[0]!.pontos).toBeGreaterThan(pouco.fatores[0]!.pontos);
  });

  it("zero mensagem não vira fator nenhum", () => {
    // Ausência de sinal não pontua — nem para cima nem para baixo.
    expect(calcularScore({ mensagensDoLead: 0 }).fatores).toHaveLength(0);
  });
});

describe("a leitura do número", () => {
  it("as faixas", () => {
    expect(temperaturaDe(85)).toBe("PRIORIDADE_MAXIMA");
    expect(temperaturaDe(65)).toBe("QUENTE");
    expect(temperaturaDe(40)).toBe("MORNO");
    expect(temperaturaDe(10)).toBe("FRIO");
  });

  it("as bordas caem para o lado de cima", () => {
    expect(temperaturaDe(80)).toBe("PRIORIDADE_MAXIMA");
    expect(temperaturaDe(60)).toBe("QUENTE");
    expect(temperaturaDe(35)).toBe("MORNO");
  });
});
