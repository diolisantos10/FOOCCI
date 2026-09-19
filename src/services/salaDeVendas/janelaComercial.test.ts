/**
 * ⭐⭐ A JANELA COMERCIAL, PROVADA NAS BORDAS — com horas de verdade.
 *
 * ── A PERGUNTA OBRIGATÓRIA ──────────────────────────────────────────────────
 *
 * *"O teste alcança o código que responde ao cliente?"* Alcança: aqui não há
 * mock de relógio nem de fuso. Entram `Date` reais em UTC e sai a decisão que a
 * produção toma, com o `Intl` do Node convertendo para São Paulo — a mesma
 * conversão que decide se um estranho recebe mensagem às 3h da manhã.
 *
 * ── AS DATAS, E POR QUE ESTAS ───────────────────────────────────────────────
 *
 * Setembro de 2026, São Paulo = UTC−3 o ano inteiro (o horário de verão
 * brasileiro acabou em 2019). Cada caso declara o dia da semana E o confere,
 * porque um teste de borda que erra o dia da semana prova a regra errada com
 * cara de verde.
 *
 *   sexta  18/09/2026 · sábado 19/09 · domingo 20/09 · segunda 21/09
 */

import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import {
  podeAbordarAgora,
  foraDaJanelaComercial,
  agoraNoFuso,
  janelaDoAmbiente,
  FUSO_PADRAO,
  MOTIVO_FORA_DA_JANELA,
  VARIAVEL_SEMANA,
  VARIAVEL_SABADO,
  VARIAVEL_DOMINGO,
  VARIAVEL_FUSO,
} from "./janelaComercial";

/** Um instante de São Paulo escrito como o CEO fala, convertido para UTC (+3h). */
function emSaoPaulo(dia: string, hhmm: string): Date {
  const [h = "0", m = "0"] = hhmm.split(":");
  const utc = String(parseInt(h, 10) + 3).padStart(2, "0");
  return new Date(`${dia}T${utc}:${m}:00.000Z`);
}

/** ⛔ Sem nenhuma variável setada. O padrão tem de valer sozinho. */
const SEM_AMBIENTE: NodeJS.ProcessEnv = {};

const SEXTA = "2026-09-18";
const SABADO = "2026-09-19";
const DOMINGO = "2026-09-20";
const SEGUNDA = "2026-09-21";

describe("o calendário do teste é o que eu digo que é", () => {
  it.each([
    [SEXTA, 5],
    [SABADO, 6],
    [DOMINGO, 0],
    [SEGUNDA, 1],
  ])("%s é o dia %i da semana em São Paulo", (dia, esperado) => {
    expect(agoraNoFuso(emSaoPaulo(dia, "12:00"), FUSO_PADRAO)?.dia).toBe(esperado);
  });

  it("converte UTC para São Paulo, e não usa o fuso da máquina", () => {
    // 23h UTC de sexta são 20h em São Paulo. Se alguém trocasse por getHours()
    // num servidor UTC, este caso passaria a liberar as 23h da noite.
    const local = agoraNoFuso(new Date("2026-09-18T23:00:00.000Z"), FUSO_PADRAO);
    expect(local).toEqual({ dia: 5, hora: 20, minuto: 0, minutosDoDia: 20 * 60 });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ⭐ A RÉGUA DO CEO, 18/09/2026 — os dois lados de cada borda.
//
// Guardar só o lado de dentro deixaria `fim: 21` passar; guardar só o de fora
// deixaria `fim: 19` passar. É o PAR que fixa o número.
// ─────────────────────────────────────────────────────────────────────────────

describe("⭐ a janela comercial de abordagem — seg–sex 9–20, sáb 9–14, domingo nunca", () => {
  it.each([
    ["sexta 19:59 — a última fala do dia útil", SEXTA, "19:59", true],
    ["sexta 20:01 — às oito a casa fechou", SEXTA, "20:01", false],
    ["sexta 20:00 em ponto — o fim é exclusivo, e fecha", SEXTA, "20:00", false],
    ["sábado 13:59 — a última fala do sábado", SABADO, "13:59", true],
    ["sábado 14:01 — às quatorze o sábado acabou", SABADO, "14:01", false],
    ["sábado 14:00 em ponto — fecha", SABADO, "14:00", false],
    ["sábado 09:00 — o sábado abre junto com os outros", SABADO, "09:00", true],
    ["domingo 12:00 — domingo não se aborda, nem no melhor horário", DOMINGO, "12:00", false],
    ["domingo 03:00 — muito menos de madrugada", DOMINGO, "03:00", false],
    ["domingo 19:00 — nem no fim da tarde", DOMINGO, "19:00", false],
    ["segunda 08:59 — um minuto antes ainda é cedo", SEGUNDA, "08:59", false],
    ["segunda 09:00 — às nove em ponto a semana abre", SEGUNDA, "09:00", true],
    ["segunda 03:00 — a madrugada nunca", SEGUNDA, "03:00", false],
  ])("%s", (_nome, dia, hora, esperado) => {
    const d = podeAbordarAgora(emSaoPaulo(dia, hora), SEM_AMBIENTE);
    expect(d.pode, `${dia} ${hora} — ${d.detalhe}`).toBe(esperado);
    if (!d.pode) expect(d.motivo).toBe(MOTIVO_FORA_DA_JANELA);
  });

  it("⛔ o padrão vale SEM NENHUMA VARIÁVEL SETADA", () => {
    // O ambiente vazio é o caso que mais acontece: um deploy novo, um runner de
    // CI, uma máquina de quem acabou de clonar. Se o padrão dependesse de
    // configuração, seria nesse dia que a casa mandaria mensagem de madrugada.
    expect(janelaDoAmbiente(SEM_AMBIENTE)).toEqual({
      ok: true,
      fuso: FUSO_PADRAO,
      janela: [
        null,
        { inicioMin: 540, fimMin: 1200 },
        { inicioMin: 540, fimMin: 1200 },
        { inicioMin: 540, fimMin: 1200 },
        { inicioMin: 540, fimMin: 1200 },
        { inicioMin: 540, fimMin: 1200 },
        { inicioMin: 540, fimMin: 840 },
      ],
    });
  });

  it("a recusa é NOMEADA e diz a hora e o fuso — recusa muda não vira conta", () => {
    const d = podeAbordarAgora(emSaoPaulo(DOMINGO, "12:00"), SEM_AMBIENTE);
    expect(d.pode).toBe(false);
    if (d.pode) throw new Error("impossível");
    expect(d.motivo).toBe("foraDaJanelaComercial");
    expect(d.detalhe).toContain("domingo 12:00");
    expect(d.detalhe).toContain("America/Sao_Paulo");
  });

  it("`foraDaJanelaComercial` é o inverso exato, e não uma segunda opinião", () => {
    for (const [dia, hora] of [[SEXTA, "19:59"], [DOMINGO, "12:00"], [SABADO, "13:59"]] as const) {
      const t = emSaoPaulo(dia, hora);
      expect(foraDaJanelaComercial(t, SEM_AMBIENTE)).toBe(!podeAbordarAgora(t, SEM_AMBIENTE).pode);
    }
  });
});

describe("⛔ FAIL-CLOSED — não saber que horas são é NÃO", () => {
  it("fuso inválido não aborda ninguém", () => {
    const d = podeAbordarAgora(emSaoPaulo(SEGUNDA, "10:00"), { [VARIAVEL_FUSO]: "Marte/Olympus" });
    expect(d.pode).toBe(false);
    if (!d.pode) expect(d.detalhe).toContain("Marte/Olympus");
  });

  it("data inválida não aborda ninguém", () => {
    expect(podeAbordarAgora(new Date("não é data"), SEM_AMBIENTE).pode).toBe(false);
  });

  it("variável malformada FECHA a janela — não cai no padrão em silêncio", () => {
    // Cair no padrão faria um erro de digitação virar uma janela diferente da
    // que alguém quis, e ninguém descobriria: o sistema continuaria mandando.
    for (const valor of ["9 as 20", "09:00-", "20:00-09:00", "99:00-99:00"]) {
      const d = podeAbordarAgora(emSaoPaulo(SEGUNDA, "10:00"), { [VARIAVEL_SEMANA]: valor });
      expect(d.pode, `"${valor}" deveria fechar a janela`).toBe(false);
    }
  });
});

describe("configurável por ambiente, com o padrão por baixo", () => {
  it("dá para encurtar a semana sem tocar no sábado", () => {
    const env = { [VARIAVEL_SEMANA]: "10:00-18:00" };
    expect(podeAbordarAgora(emSaoPaulo(SEGUNDA, "09:30"), env).pode).toBe(false);
    expect(podeAbordarAgora(emSaoPaulo(SEGUNDA, "10:00"), env).pode).toBe(true);
    // O sábado continua com o padrão do CEO: 9–14.
    expect(podeAbordarAgora(emSaoPaulo(SABADO, "09:30"), env).pode).toBe(true);
    expect(podeAbordarAgora(emSaoPaulo(SABADO, "14:30"), env).pode).toBe(false);
  });

  it("dá para fechar o sábado, e para abrir o domingo, se o dono mandar", () => {
    expect(podeAbordarAgora(emSaoPaulo(SABADO, "10:00"), { [VARIAVEL_SABADO]: "fechado" }).pode).toBe(false);
    expect(podeAbordarAgora(emSaoPaulo(DOMINGO, "10:00"), { [VARIAVEL_DOMINGO]: "09:00-12:00" }).pode).toBe(true);
    expect(podeAbordarAgora(emSaoPaulo(DOMINGO, "13:00"), { [VARIAVEL_DOMINGO]: "09:00-12:00" }).pode).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ⛔ O CONTRATO, medido no FONTE — a régua que um comentário não segura.
// ─────────────────────────────────────────────────────────────────────────────

const RAIZ = path.resolve(__dirname, "../../..");
const ler = (relativo: string) => fs.readFileSync(path.join(RAIZ, relativo), "utf8");

/** Os caminhos por onde a casa RESPONDE a quem escreveu. Nenhum pode ser barrado. */
const CAMINHOS_DE_RESPOSTA = [
  "src/services/salaDeVendas/ta/atender.ts",
  "src/services/salaDeVendas/conversa.ts",
  "src/services/salaDeVendas/entrega.ts",
  "src/services/salaDeVendas/reabordagem/portaDeEnvio.ts",
];

describe("⛔ a janela é de ABORDAR — nenhum caminho de RESPOSTA a consulta", () => {
  it.each(CAMINHOS_DE_RESPOSTA)("%s nunca BARRA uma resposta por causa da janela", (arquivo) => {
    // ⛔ A régua continua sendo a mesma: se alguém pendurar `podeAbordarAgora`
    // ou `foraDaJanelaComercial` num caminho de RESPOSTA, um cliente que
    // escrever às 22h de domingo fica falando sozinho — e o estrago não
    // apareceria em nenhum outro teste, porque tudo continuaria "funcionando".
    //
    // ── ⭐ O QUE MUDOU EM 19/09/2026, E POR QUE NÃO AFROUXA NADA ───────────
    //
    // Ordem do CEO: *"Tem que dizer que está fora do horário e que assim que
    // voltarmos………"*. `ta/atender.ts` passou a somar UMA FRASE à resposta
    // quando a casa está fechada — `comAvisoDeHorario`, que devolve texto e
    // nunca um booleano de permissão. Avisar não é barrar: a resposta sai
    // inteira, na mesma hora, com o horário de volta lido desta mesma fonte.
    //
    // O teste continua proibindo tudo o que DECIDE. Só o que FALA passa.
    expect(ler(arquivo)).not.toContain("podeAbordarAgora");
    expect(ler(arquivo)).not.toContain("foraDaJanelaComercial");
  });

  it("⭐ e o único que toca a janela num caminho de resposta só a usa para FALAR", () => {
    const fonte = ler("src/services/salaDeVendas/ta/atender.ts");
    // O import é nominal: `comAvisoDeHorario`, e nada mais. Um `import *` ou um
    // segundo nome abriria a porta para alguém decidir por aqui um dia.
    expect(fonte).toContain('import { comAvisoDeHorario } from "../janelaComercial"');

    // Os outros três não a conhecem de forma nenhuma.
    for (const arquivo of CAMINHOS_DE_RESPOSTA.filter((a) => !a.endsWith("ta/atender.ts"))) {
      expect(ler(arquivo), arquivo).not.toContain("janelaComercial");
    }
  });

  it("⭐ e os caminhos de ABORDAR a consultam, todos", () => {
    // Um lugar só decide, e estes são os que perguntam a ele.
    expect(ler("src/services/salaDeVendas/reabordagem/executar.ts")).toContain("podeAbordarAgora");
    // `avaliarContatoDeLead` e `avaliarAbordagemDeProspeccao` são os dois
    // portões por onde passam a prospecção fria (abordarDaFila → abordarLead) e
    // a recepção de quem chegou sozinho (recepcaoDeLeads → abordarLead).
    const portao = ler("src/services/foocci-sdr/LeadContactSafety.ts");
    expect(portao.match(/podeAbordarAgora\(agora\)/g) ?? []).toHaveLength(2);
  });
});
