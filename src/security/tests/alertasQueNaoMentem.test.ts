/**
 * O ALERTA TEM QUE SIGNIFICAR ALGUMA COISA.
 *
 * Em 07/08/2026 o CEO mandou um print da caixa de entrada dele: **onze e-mails de
 * falha do Foocci num dia**. A varredura mediu quantos eram defeito de verdade:
 * **dois**. Os outros nove eram infraestrutura do GitHub — jobs cancelados na
 * fila, que o GitHub agrega como *run reprovado* e manda por e-mail escrito
 * "failed".
 *
 * O custo disso não é o incômodo. É que **o único alerta que valia dinheiro**
 * naquele lote — o Instagram mudo há 13 dias, com token expirado — chegou junto
 * com nove falsos, quatro dias seguidos, e ninguém abriu.
 *
 * ── POR QUE ISTO É TESTE, E NÃO SÓ UM COMENTÁRIO NO YAML ──
 *
 * Configuração de workflow é a coisa mais fácil de reverter sem querer: um
 * `concurrency` some numa faxina, um gatilho volta a `["**"]` porque "estava
 * cobrindo menos", e ninguém percebe até a caixa encher de novo daqui a um mês.
 * Não há compilador nem revisor que reclame.
 *
 * Este arquivo lê os YAML de verdade. É guardrail 4: prompt é aviso, código é
 * trava.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const ler = (p: string) => readFileSync(path.join(process.cwd(), p), "utf8");

const CI = ".github/workflows/ci.yml";
const CRM = ".github/workflows/crm-cron.yml";

describe("CI — o mesmo código não é medido duas vezes", () => {
  it("`push` cobre só a branch padrão; a de trabalho é coberta pelo PR", () => {
    const ci = ler(CI);
    // A metade que reprova: `branches: ["**"]` de volta. Era ele que fazia todo
    // commit com PR aberto rodar duas vezes — 300 execuções para 224 commits.
    expect(ci).not.toMatch(/branches:\s*\["\*\*"\]/);
    expect(ci).toMatch(/branches:\s*\["claude\/remove-legacy-runner-q8iXa"\]/);
  });

  it("… e a cobertura NÃO diminui: `pull_request` continua disparando", () => {
    // A metade que passa. Sem esta linha, branch de trabalho ficaria sem portão
    // nenhum — que seria trocar ruído por cegueira, um negócio pior.
    expect(ler(CI)).toMatch(/^\s*pull_request:\s*$/m);
  });

  it("rajada de commits cancela a própria fila", () => {
    const ci = ler(CI);
    expect(ci).toMatch(/concurrency:/);
    expect(ci).toMatch(/cancel-in-progress:\s*true/);
    // Por REFERÊNCIA, não global: dois PRs diferentes não podem se cancelar.
    expect(ci).toMatch(/group:\s*ci-\$\{\{\s*github\.workflow\s*\}\}-\$\{\{\s*github\.ref\s*\}\}/);
  });
});

describe("CRM Cron — os três jobs cancelam o tick encalhado", () => {
  /*
    O tick do CRM ficava de 15 a 90 MINUTOS na fila antes de morrer. Dois danos:
    o e-mail dizia "CRM Cron falhou" quando o CRM sequer rodou, e um tick
    liberado 90 minutos depois dispararia um lote velho em cima de cliente real.

    Cancelado não gera e-mail; reprovado gera. É assim que o alerta volta a
    significar "o endpoint do CRM respondeu errado", que é a única coisa que
    merece interromper alguém.
  */
  const JOBS = ["run-campaigns", "run-automations", "send-cart-recovery"];

  it.each(JOBS)("o job %s tem concurrency com cancelamento", (job) => {
    const crm = ler(CRM);
    expect(crm).toContain(`group: crm-cron-${job}`);
  });

  it("os três, e não dois — trancar só um deixa metade do defeito de pé", () => {
    const crm = ler(CRM);
    const grupos = crm.match(/group:\s*crm-cron-[a-z-]+/g) ?? [];
    expect(grupos).toHaveLength(3);
    expect(new Set(grupos).size).toBe(3); // nomes distintos: grupo repetido faz um job cancelar o outro
  });
});

describe("o que NÃO pode ser silenciado", () => {
  /*
    A tentação depois de uma faxina de alertas é continuar cortando. Estes dois
    são os que reprovam COM A EVIDÊNCIA ANEXA — o do Instagram nomeia o
    restaurante, a data da expiração e há quantos dias o canal está mudo.

    Foi o único alerta correto do lote de 06/08. Silenciá-lo por causa do ruído
    dos outros seria jogar fora exatamente a parte que funcionava.
  */
  it("o alerta de token do Instagram continua existindo", () => {
    const wf = ler(".github/workflows/instagram-token-refresh.yml");
    expect(wf).toMatch(/on:/);
    expect(wf).toMatch(/schedule:/);
  });

  it("o simulador do Garçom continua existindo", () => {
    const wf = ler(".github/workflows/quality-audit-cron.yml");
    expect(wf).toMatch(/schedule:/);
  });
});
