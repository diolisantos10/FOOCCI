/**
 * ⭐ A IA NÃO PROMETE O QUE A CASA NÃO CUMPRE — 19/09/2026.
 *
 * ── O DEFEITO, MEDIDO EM PRODUÇÃO PELO PRÓPRIO CEO ──────────────────────────
 *
 * Ele escreveu no WhatsApp do anúncio e recebeu de volta:
 *
 *   *"Anotei que você quer falar com alguém do time — vou chamar. Enquanto
 *   isso eu sigo aqui com você: pode me contar o que precisa que eu já adianto
 *   tudo."*
 *
 * **Não existe time humano para chamar.** A fila `AGUARDANDO_HUMANO` não tem
 * dono: `genteDisponivelAgora` responde `tem: false`, e é por isso que aquele
 * texto saía — ele é justamente o texto do ramo "não há ninguém".
 *
 * Um lead anterior já tinha escrito *"Vc pegou meu contato e disse q um humano
 * ia me ligar. Vou ficar no aguardo."* — e ficou. É assim que se fabrica um dos
 * 6.273 leads largados desta casa.
 *
 * ── O QUE ESTE ARQUIVO PROVA ────────────────────────────────────────────────
 *
 *   1. o MODELO não consegue prometer humano: o `verificador` reprova antes de
 *      a frase sair (trava de código, não linha de prompt);
 *   2. os textos FIXOS da casa não prometem mais;
 *   3. quando o cliente PEDE uma pessoa, a IA registra e **continua**;
 *   4. fora do horário ela avisa o horário real — e dentro dele, não polui.
 */

import { describe, it, expect } from "vitest";
import { verificarResposta } from "./verificador";
import { responder, TEXTO_DO_PEDIDO_DE_GENTE } from "./responder";
import { QUANDO_NAO_SEI, VERSAO_1 } from "./ficha";
import { OFICIO_DO_ATENDIMENTO, OFICIO_DO_FECHAMENTO } from "./oficio";
import { avisoDeForaDeHorario, comAvisoDeHorario, proximaAberturaDaCasa } from "../janelaComercial";

/** Sem nenhuma variável de janela setada: vale o padrão da casa. */
const SEM_ENV = {} as NodeJS.ProcessEnv;

describe("⛔ a trava: o modelo não consegue prometer um humano", () => {
  it("⭐ a frase EXATA que o CEO recebeu em produção é reprovada", () => {
    const v = verificarResposta(
      "Anotei que você quer falar com alguém do time — vou chamar. Enquanto isso " +
        "eu sigo aqui com você: pode me contar o que precisa que eu já adianto tudo.",
    );

    expect(v.aprovada).toBe(false);
    expect(v.motivos).toContain("prometeuHumano");
    expect(v.detalhe).toMatch(/fila humana/i);
  });

  it("⭐ a promessa que deixou um lead esperando: 'um humano vai te ligar'", () => {
    for (const frase of [
      "Já anotei seu contato, um humano vai te ligar ainda hoje.",
      "Vou chamar alguém do time para falar com você agora.",
      "Nossa equipe entra em contato com você.",
      "Um atendente vai retornar assim que possível.",
      "Fica tranquilo que a gente te liga.",
      "Já encaminhei pro time, é só aguardar.",
      "Vou pedir pra alguém te ligar.",
      "Vou te passar para um consultor.",
      "Uma pessoa já vem falar com você.",
    ]) {
      const v = verificarResposta(frase);
      expect(v.motivos, `deveria reprovar: ${frase}`).toContain("prometeuHumano");
    }
  });

  it("✅ e o que NÃO pode ser barrado: a negação, o registro, e o link", () => {
    for (const frase of [
      // Dizer a verdade não é prometer.
      "Não vou chamar ninguém agora, mas deixei o seu pedido registrado aqui.",
      "Registrei aqui o seu pedido de falar com uma pessoa do time.",
      // ⚠️ A frase mais útil que o agente tem. Barrá-la seria pôr uma régua
      // verde em cima da venda: "vou te passar" precisa de destino HUMANO.
      "Vou te passar o link dos planos pra você ver os valores.",
      "Você vende pelo WhatsApp hoje?",
      "O time montou isso pensando em quem tem cozinha pequena.",
    ]) {
      const v = verificarResposta(frase);
      expect(v.motivos, `não deveria reprovar: ${frase}`).not.toContain("prometeuHumano");
    }
  });
});

describe("⛔ os textos FIXOS da casa pararam de prometer", () => {
  it("⭐ nenhum deles passa pela própria trava do verificador", () => {
    for (const texto of [TEXTO_DO_PEDIDO_DE_GENTE, QUANDO_NAO_SEI]) {
      expect(verificarResposta(texto).motivos, texto).not.toContain("prometeuHumano");
    }
  });

  it("⭐ o 'não sei' não promete mais ligação — e não abandona", () => {
    expect(QUANDO_NAO_SEI).not.toMatch(/vou chamar|vai (te )?ligar|entra em contato/i);
    // Ele registra, e ele continua: os dois em uma frase só.
    expect(QUANDO_NAO_SEI).toMatch(/registrad/i);
    expect(QUANDO_NAO_SEI).toMatch(/sigo com você/i);
  });

  it("⭐ o ofício MANDA não prometer — nas duas posturas", () => {
    for (const oficio of [OFICIO_DO_ATENDIMENTO, OFICIO_DO_FECHAMENTO]) {
      const bloco = oficio.find((b) => b.titulo === "O QUE VOCÊ NUNCA PROMETE");
      expect(bloco, "as duas posturas precisam do bloco").toBeDefined();
      expect(bloco!.linhas.join(" ")).toMatch(/nunca diga que vai chamar algu[ée]m/i);
    }
  });

  it("⭐ a ficha publicada proíbe a promessa, por escrito", () => {
    expect(VERSAO_1.proibidos.join(" ")).toMatch(/prometer liga[çc][ãa]o/i);
  });
});

describe("⭐ quando o CLIENTE pede uma pessoa: registra e CONTINUA", () => {
  it("o pedido explícito dispara handoff, e o texto não promete nada", () => {
    const r = responder({ mensagem: "quero falar com uma pessoa" });

    // A escalada interna continua acontecendo — é ela que deixa o rastro.
    expect(r.handoff.deve).toBe(true);
    expect(r.handoff.motivo).toBe("PEDIU_HUMANO");

    // ⛔ Mas o que o cliente ouve não promete.
    expect(r.texto).not.toMatch(/vou chamar|vai (te )?ligar|entra em contato|alguém vem/i);
    // ✅ Registra...
    expect(r.texto).toMatch(/registrei/i);
    // ✅ ...diz que não promete prazo...
    expect(r.texto).toMatch(/n[ãa]o vou te prometer/i);
    // ✅ ...e NÃO cala: a conversa segue.
    expect(r.texto).toMatch(/sigo com você/i);
    expect(r.texto.length).toBeGreaterThan(60);
  });

  it("⛔ e ela não some: o texto do pedido de gente pede a próxima coisa", () => {
    expect(TEXTO_DO_PEDIDO_DE_GENTE).toMatch(/me conta o que precisa/i);
  });
});

describe("⭐ fora do horário, ela AVISA — com o horário de verdade", () => {
  // Sábado 16h em São Paulo = 19:00Z. A janela de sábado é 09:00–14:00, então
  // já fechou; o próximo dia aberto é segunda, 09:00 (domingo é fechado).
  const SABADO_16H = new Date("2026-09-19T19:00:00Z");
  // Quarta-feira, 11h em São Paulo = 14:00Z. Dentro da janela 09:00–20:00.
  const QUARTA_11H = new Date("2026-09-16T14:00:00Z");

  it("⭐ sábado 16h: o aviso sai, e diz SEGUNDA às 09:00 — calculado, não chutado", () => {
    const proxima = proximaAberturaDaCasa(SABADO_16H, SEM_ENV);
    expect(proxima).not.toBeNull();
    // 1 = segunda. ⛔ Domingo NÃO vira "amanhã": domingo é fechado.
    expect(proxima!.dia).toBe(1);
    expect(proxima!.emDias).toBe(2);
    expect(proxima!.escrito).toBe("na segunda às 09:00");

    const aviso = avisoDeForaDeHorario(SABADO_16H, SEM_ENV);
    expect(aviso).toMatch(/fora do hor[áa]rio/i);
    expect(aviso).toContain("na segunda às 09:00");
    // ⛔ E ela não usa o aviso para sumir.
    expect(aviso).toMatch(/sigo aqui com você/i);
  });

  it("⭐ o aviso se SOMA à resposta — nunca a substitui", () => {
    const resposta = "O Essencial atende uma unidade e já vem com cardápio digital.";
    const saida = comAvisoDeHorario(resposta, SABADO_16H, SEM_ENV);

    expect(saida).toContain(resposta);
    expect(saida).toContain("na segunda às 09:00");
  });

  it("⭐ quarta-feira 11h: NENHUM aviso — quem chega no horário não é poluído", () => {
    expect(avisoDeForaDeHorario(QUARTA_11H, SEM_ENV)).toBeNull();

    const resposta = "O Essencial atende uma unidade.";
    expect(comAvisoDeHorario(resposta, QUARTA_11H, SEM_ENV)).toBe(resposta);
  });

  it("⭐ sexta 21h: o próximo é o SÁBADO às 09:00, e ele se escreve 'amanhã'", () => {
    // Sexta, 21h em São Paulo = 00:00Z de sábado.
    const SEXTA_21H = new Date("2026-09-19T00:00:00Z");
    const proxima = proximaAberturaDaCasa(SEXTA_21H, SEM_ENV);
    expect(proxima!.escrito).toBe("amanhã às 09:00");
  });

  it("⭐ segunda 07h: a casa abre HOJE, e ela diz hoje", () => {
    // Segunda, 07h em São Paulo = 10:00Z.
    const SEGUNDA_07H = new Date("2026-09-21T10:00:00Z");
    expect(proximaAberturaDaCasa(SEGUNDA_07H, SEM_ENV)!.escrito).toBe("hoje às 09:00");
  });

  it("⛔ janela ilegível: NENHUM aviso — horário chutado é a promessa inventada de novo", () => {
    const env = { FOOCCI_JANELA_COMERCIAL_SEMANA: "nove às oito" } as NodeJS.ProcessEnv;
    expect(proximaAberturaDaCasa(SABADO_16H, env)).toBeNull();
    expect(avisoDeForaDeHorario(SABADO_16H, env)).toBeNull();
    expect(comAvisoDeHorario("resposta", SABADO_16H, env)).toBe("resposta");
  });

  it("⛔ e o aviso de horário não trai a outra trava: ele não promete humano", () => {
    const aviso = avisoDeForaDeHorario(SABADO_16H, SEM_ENV)!;
    expect(verificarResposta(aviso).motivos).not.toContain("prometeuHumano");
  });
});
