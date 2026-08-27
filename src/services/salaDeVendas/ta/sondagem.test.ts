/**
 * A SONDAGEM — e os quatro jeitos de fabricar um lead quente que não existe.
 *
 * ── POR QUE ESTES CASOS SÃO DUROS ───────────────────────────────────────────
 *
 * O que sai daqui vira score, o score vira temperatura, e a temperatura decide
 * quem o closer ataca primeiro. Um erro aqui não aparece como erro: aparece como
 * um vendedor gastando a manhã com quem só mandou "oi".
 *
 * Os quatro erros que estes casos guardam:
 *
 *  · **deduzir** — "tenho um restaurante" virar `unidades: 1`. Ninguém contou
 *    nada, e a régua ganha um ponto que não foi dito;
 *  · **preencher para ajudar** — devolver texto onde a pessoa não falou. Um
 *    extrator prestativo fabrica ficha completa de quem não disse nada;
 *  · **aceitar absurdo** — `unidades: 9000` entra na conta sem ninguém notar,
 *    porque a régua só soma;
 *  · **esquecer** — o fato dito no turno 2 sumir no turno 5, derrubando o score
 *    sozinho.
 *
 * ⚠️ Os casos de extração NÃO chamam o modelo. Testar o modelo seria testar a
 * OpenAI; o que se testa aqui é o que o código faz com o que ele devolve — que
 * é a parte que nos pertence e a parte que quebra calada.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { extrairSinais, juntarSinais } from "./sondagem";
import type { SinaisDoLead } from "../score";

const chamar = vi.hoisted(() => vi.fn());
const escolher = vi.hoisted(() => vi.fn());

vi.mock("@/services/brain/engines/OpenAIEngineAdapter", () => ({
  callStructuredJson: chamar,
}));
vi.mock("@/services/brain/engines/AIEngineRouter", () => ({
  selectEngineRouted: escolher,
}));

const CONVERSA = [
  { deQuem: "ta" as const, texto: "Oi! Que tipo de restaurante você tem?" },
  { deQuem: "cliente" as const, texto: "Tenho uma pizzaria" },
];

beforeEach(() => {
  chamar.mockReset();
  escolher.mockReset();
  escolher.mockResolvedValue({ provider: "OPENAI", model: "x" });
});

describe("⭐ o que volta do modelo é conferido antes de virar score", () => {
  it("passa o que é plausível", async () => {
    chamar.mockResolvedValue({
      unidades: 3,
      volumeMensal: 900,
      canaisAtuais: ["iFood", " WhatsApp "],
      sistemaAtual: "Colibri",
      dorPrincipal: "taxa alta do iFood",
      urgencia: "pra semana que vem",
      poderDeDecisao: "decido sozinho",
      faixaDeOrcamento: null,
      ehRestaurante: true,
    });

    const r = await extrairSinais(CONVERSA, "tenho 3 lojas");

    expect(r.unidades).toBe(3);
    expect(r.volumeMensal).toBe(900);
    // Normalizado: a régua compara com uma lista em minúsculas, e "iFood" com
    // maiúscula não bateria com "ifood".
    expect(r.canaisAtuais).toEqual(["ifood", "whatsapp"]);
    expect(r.ehRestaurante).toBe(true);
  });

  it("⭐ recusa número absurdo em vez de deixar virar ponto", async () => {
    // 9000 unidades é o modelo tendo lido o número de PEDIDOS como lojas. A
    // régua só soma: sem esta trava, o lead vira PRIORIDADE_MAXIMA por engano
    // de leitura, e alguém liga achando que achou uma rede nacional.
    chamar.mockResolvedValue({ unidades: 9000, volumeMensal: -50, ehRestaurante: null });

    const r = await extrairSinais(CONVERSA, "x");

    expect(r.unidades, "aceitou 9000 lojas").toBeNull();
    expect(r.volumeMensal, "aceitou volume negativo").toBeNull();
  });

  it("recusa zero e fração — não existe restaurante com meia loja", async () => {
    chamar.mockResolvedValue({ unidades: 0, volumeMensal: 12.7 });
    const r = await extrairSinais(CONVERSA, "x");

    expect(r.unidades).toBeNull();
    expect(r.volumeMensal, "12.7 pedidos deveria virar 12").toBe(12);
  });

  it("⭐ corta texto longo — é o modelo narrando, não extraindo", async () => {
    // Campo de fato que volta com um parágrafo é sinal de que o modelo
    // resumiu a conversa em vez de extrair. Deixar entrar suja a ficha e o
    // gerente lê um texto que ninguém disse.
    chamar.mockResolvedValue({ dorPrincipal: "a".repeat(400), urgencia: "hoje" });

    const r = await extrairSinais(CONVERSA, "x");

    expect(r.dorPrincipal).toBeNull();
    expect(r.urgencia, "cortou o campo curto junto").toBe("hoje");
  });

  it("descarta o que não é do tipo certo, sem quebrar", async () => {
    chamar.mockResolvedValue({
      unidades: "três",
      canaisAtuais: "ifood",
      ehRestaurante: "sim",
      dorPrincipal: 42,
    });

    const r = await extrairSinais(CONVERSA, "x");

    expect(r.unidades).toBeNull();
    expect(r.canaisAtuais).toBeNull();
    expect(r.ehRestaurante, '"sim" não é booleano').toBeNull();
    expect(r.dorPrincipal).toBeNull();
  });
});

describe("⭐ nada disso pode derrubar o atendimento", () => {
  it("modelo fora do ar devolve vazio, não exceção", async () => {
    // Roda depois de o cliente já ter escrito e de a resposta já ter saído. Uma
    // exceção aqui transformaria um atendimento que deu certo em turno
    // quebrado — e a Meta reentregaria a mensagem, fazendo o TA responder duas
    // vezes.
    chamar.mockRejectedValue(new Error("503"));
    await expect(extrairSinais(CONVERSA, "x")).resolves.toEqual({});
  });

  it("JSON estranho devolve vazio", async () => {
    chamar.mockResolvedValue("isso não é objeto");
    await expect(extrairSinais(CONVERSA, "x")).resolves.toEqual({});
  });

  it("⭐ sem IA disponível não chama nada e devolve vazio", async () => {
    // Instalação sem chave. O TA continua atendendo pelo chão determinístico;
    // só não qualifica.
    escolher.mockResolvedValue({ provider: "MOCK" });

    const r = await extrairSinais(CONVERSA, "x");

    expect(r).toEqual({});
    expect(chamar, "chamou o modelo com o motor em MOCK").not.toHaveBeenCalled();
  });

  it("conversa vazia nem chega ao modelo", async () => {
    const r = await extrairSinais([], "   ");
    expect(r).toEqual({});
    expect(chamar).not.toHaveBeenCalled();
  });
});

describe("⭐ a conversa inteira vai para o modelo", () => {
  it("manda o histórico e a mensagem de agora, marcando quem falou", async () => {
    chamar.mockResolvedValue({});
    await extrairSinais(CONVERSA, "tenho 3 lojas");

    const { userContent, temperature } = chamar.mock.calls[0]![0] as {
      userContent: string;
      temperature: number;
    };

    expect(userContent).toContain("CLIENTE: Tenho uma pizzaria");
    expect(userContent).toContain("ATENDIMENTO: Oi!");
    expect(userContent, "a mensagem de agora ficou de fora").toContain("CLIENTE: tenho 3 lojas");

    // ⚠️ Zero. Extração é medição: a mesma conversa tem de dar o mesmo sinal,
    // ou a temperatura de um lead muda entre turnos sem ninguém dizer nada novo.
    expect(temperature, "extração com temperatura alta vira sorteio").toBe(0);
  });

  it("o formato exigido vai escrito na instrução, não como esquema", async () => {
    // O motor da casa não recebe esquema. A primeira versão passava um objeto
    // `schema` que ele ignoraria — o modelo devolveria qualquer forma, a
    // limpeza transformaria tudo em null, e TODO lead sairia sem sinal com o
    // arquivo parecendo correto.
    chamar.mockResolvedValue({});
    await extrairSinais(CONVERSA, "x");

    const { systemPrompt } = chamar.mock.calls[0]![0] as { systemPrompt: string };
    expect(systemPrompt, "o formato sumiu da instrução").toContain('"unidades"');
    expect(systemPrompt).toContain('"ehRestaurante"');
    expect(systemPrompt, "a regra de não deduzir sumiu").toMatch(/nunca deduza/i);
  });
});

describe("⭐ o público da Foocci é comida e bebida — não só 'restaurante'", () => {
  /**
   * ── DE ONDE VEM ESTE BLOCO ────────────────────────────────────────────────
   *
   * O CEO, em 27/08/2026: *"o Foocci só atende restaurantes, bares e afins"*.
   *
   * O campo se chama `ehRestaurante`, e o nome é mais estreito que a regra. Um
   * modelo lendo só o nome do campo responde `false` para um **bar** — e bar é
   * cliente. `false` não tira pontos: **encerra a conta** e manda o lead para
   * DESQUALIFICADO, fora da fila do closer, sem alarme nenhum.
   *
   * O prejuízo seria invisível: a tela mostraria "desqualificado" e ninguém
   * perguntaria por quê. Por isso a trava é no texto que o modelo lê.
   */

  it("⭐ a instrução nomeia bar, boteco e padaria como público", async () => {
    // Se alguém encolher a lista de volta para "restaurante", este caso cai
    // pelo nome — e não seis semanas depois, num lead perdido.
    chamar.mockResolvedValue({});
    await extrairSinais(CONVERSA, "x");

    const { systemPrompt } = chamar.mock.calls[0]![0] as { systemPrompt: string };
    const instrucao = systemPrompt.toLowerCase();

    for (const ramo of ["bar", "boteco", "lanchonete", "padaria", "cafeteria", "food truck"]) {
      expect(instrucao, `"${ramo}" sumiu do público da Foocci`).toContain(ramo);
    }
  });

  it("⭐ e manda devolver null na dúvida, nunca false", async () => {
    // A assimetria que importa: um `false` errado apaga um cliente de verdade;
    // um `null` só adia a pergunta. Sem esta linha, o modelo "resolve" a dúvida
    // do lado que custa caro.
    chamar.mockResolvedValue({});
    await extrairSinais(CONVERSA, "x");

    const { systemPrompt } = chamar.mock.calls[0]![0] as { systemPrompt: string };
    expect(systemPrompt, "a regra da dúvida sumiu").toMatch(/na dúvida sobre o ramo.*null/is);
    expect(systemPrompt, "sumiu o aviso de que dúvida não é false").toMatch(/nunca false/i);
  });

  it("⭐ ramo não informado vira null — e null não é false", async () => {
    // O caminho pelo qual a desqualificação se fabrica sozinha: o modelo não
    // menciona o campo, a limpeza inventa um `false` por conveniência, e o lead
    // morre sem ninguém ter dito nada sobre o negócio dele.
    chamar.mockResolvedValue({ unidades: 2, dorPrincipal: "taxa alta" });

    const r = await extrairSinais(CONVERSA, "x");

    expect(r.ehRestaurante, "silêncio sobre o ramo virou desqualificação").toBeNull();
    expect(r.ehRestaurante).not.toBe(false);
  });
});

describe("⭐ juntar sinais nunca apaga o que já se sabia", () => {
  const cheio: SinaisDoLead = {
    unidades: 3,
    dorPrincipal: "taxa do iFood",
    canaisAtuais: ["ifood"],
    ehRestaurante: true,
  };

  it("o fato antigo vence o vazio novo", async () => {
    // O caso que carrega a função. A sondagem roda a cada turno; se o resultado
    // substituísse, o "tenho 3 lojas" do turno 2 sumiria no turno 5 e o score
    // cairia sem ninguém ter mexido em nada.
    const r = juntarSinais(cheio, { unidades: null, dorPrincipal: null });

    expect(r.unidades).toBe(3);
    expect(r.dorPrincipal).toBe("taxa do iFood");
  });

  it("o buraco é preenchido pelo novo", async () => {
    const r = juntarSinais(cheio, { urgencia: "essa semana", faixaDeOrcamento: "até 300" });

    expect(r.urgencia).toBe("essa semana");
    expect(r.faixaDeOrcamento).toBe("até 300");
    expect(r.unidades, "estragou o que já existia").toBe(3);
  });

  it("⭐ a desqualificação sobrevive — false não é vazio", async () => {
    // `ehRestaurante: false` derruba o lead na régua. Um `||` escrito por
    // descuido trocaria o `false` pelo valor novo e RESSUSCITARIA um lead
    // desqualificado — que voltaria à fila do closer.
    const r = juntarSinais({ ehRestaurante: false }, { ehRestaurante: true });
    expect(r.ehRestaurante, "o lead desqualificado voltou").toBe(false);
  });

  it("a contagem de mensagens é a única que sempre vale a mais nova", async () => {
    // Não é descoberta, é medida. O número de hoje é sempre mais verdadeiro.
    const r = juntarSinais({ mensagensDoLead: 2 }, { mensagensDoLead: 7 });
    expect(r.mensagensDoLead).toBe(7);
  });
});
