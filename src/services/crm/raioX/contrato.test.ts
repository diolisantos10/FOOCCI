/**
 * ⛔ O CONTRATO: O RAIO-X DE DISPAROS SÓ LÊ.
 *
 * Molde de `src/services/salaDeVendas/raioX/contrato.test.ts`: o teste LÊ O
 * FONTE, porque é o fonte que garante a regra. Uma promessa em comentário
 * ("esta rota não envia") é prosa; o que barra um envio é não existir caminho
 * de envio no arquivo.
 *
 * ⚠️ Os arquivos deste bloco EXPLICAM, em comentário, o que não fazem — e citam
 * pelo nome as funções de envio. Uma busca por texto cru acharia a explicação e
 * reprovaria justamente o arquivo que está certo. Por isso o teste mede CÓDIGO:
 * o fonte sem comentários.
 */

import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const RAIZ = path.resolve(__dirname, "../../../..");
const ler = (relativo: string) => fs.readFileSync(path.join(RAIZ, relativo), "utf8");

const lerCodigo = (relativo: string) =>
  ler(relativo)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

const ROTA = "src/app/api/cron/crm/raio-x-disparos/route.ts";
const SERVICO = "src/services/crm/raioX/funilDeDisparos.ts";
const GUARDA = "src/services/crm/raioX/guarda.ts";

const TODOS = [ROTA, SERVICO, GUARDA];

/** Tudo que, no CRM do restaurante, faz uma mensagem SAIR. */
const CAMINHOS_DE_ENVIO = [
  "sendMetaCrmMessage",
  "WhatsAppMessagingService",
  "MetaTemplateService",
  "ScheduledCampaignRunnerService",
  "AutomationSchedulerService",
  "runCampaignBatch",
  "runDueCampaigns",
  "runEnabledAutomations",
  "_sendBatch",
  "sendMessage",
  "sendTemplate",
  "provisionPoolTemplates",
];

/**
 * Tudo que, em Prisma, ESCREVE.
 *
 * ⚠️ Casado com o cliente (`db.` / `prisma.` / `tx.`) de propósito: um
 * `.update(` solto também é `createHash(...).update(...)`, que é hash de
 * segredo e não escrita. Proibir a palavra reprovaria a guarda, que está certa.
 */
const ESCRITAS =
  /\b(db|prisma|tx)\.[a-zA-Z]+\.(create|createMany|update|updateMany|upsert|delete|deleteMany)\(/;
const CRU = ["$executeRaw", "$executeRawUnsafe", "$queryRawUnsafe", "$transaction"];

describe("⛔ nenhum caminho de envio", () => {
  for (const arquivo of TODOS) {
    it(`${arquivo} não conhece nenhuma função que faça mensagem sair`, () => {
      const codigo = lerCodigo(arquivo);
      for (const proibido of CAMINHOS_DE_ENVIO) {
        expect(codigo, `${arquivo} cita ${proibido}`).not.toContain(proibido);
      }
    });
  }

  it("a rota é GET e só GET — não existe POST/PUT/PATCH/DELETE exportados", () => {
    const codigo = lerCodigo(ROTA);
    expect(codigo).toMatch(/export async function GET\(/);
    for (const verbo of ["POST", "PUT", "PATCH", "DELETE"]) {
      expect(codigo).not.toMatch(new RegExp(`export (async )?function ${verbo}\\(`));
    }
  });
});

describe("⛔ nenhuma escrita no banco", () => {
  for (const arquivo of TODOS) {
    it(`${arquivo} não chama nada que escreva`, () => {
      const codigo = lerCodigo(arquivo);
      expect(codigo, `${arquivo} escreve no banco`).not.toMatch(ESCRITAS);
      for (const cru of CRU) {
        expect(codigo, `${arquivo} chama ${cru}`).not.toContain(cru);
      }
    });
  }

  it("o serviço só usa leitura de Prisma: count, findMany e findUnique", () => {
    const codigo = lerCodigo(SERVICO);
    const chamadas = [...codigo.matchAll(/\bdb\.[a-zA-Z]+\.([a-zA-Z]+)\(/g)].map((m) => m[1]);
    expect(chamadas.length).toBeGreaterThan(0);
    expect([...new Set(chamadas)].sort()).toEqual(["count", "findMany", "findUnique"]);
  });

  it("o serviço lê SÓ os models do CRM do restaurante", () => {
    const codigo = lerCodigo(SERVICO);
    const models = [...codigo.matchAll(/\bdb\.([a-zA-Z]+)\./g)].map((m) => m[1]);
    expect([...new Set(models)].sort()).toEqual([
      "campaign",
      "campaignExecution",
      // A conta do dia lê o funil do ciclo — o degrau que antes sumia. Leitura
      // pura, como todo o resto desta porta.
      "crmCicloFunil",
      "customer",
      "restaurantCRMProfile",
    ]);
  });
});

describe("⛔ o teto não se mexe daqui", () => {
  it("nenhum arquivo escreve configuração de segurança nem toca no teto", () => {
    for (const arquivo of TODOS) {
      const codigo = lerCodigo(arquivo);
      // A config de segurança só pode aparecer como LEITURA (`select`). Qualquer
      // outro valor ao lado dela seria escrita disfarçada de projeção.
      const ocorrencias = [...codigo.matchAll(/whatsAppSafetyConfig\s*:\s*([^,\n}]+)/g)];
      for (const oc of ocorrencias) {
        expect(oc[1]!.trim(), `${arquivo} não lê whatsAppSafetyConfig, atribui valor a ele`).toBe("true");
      }
      expect(codigo, `${arquivo} mexe em META_SAFE_DAILY_LIMIT`).not.toContain(
        "META_SAFE_DAILY_LIMIT =",
      );
    }
  });
});

describe("a porta", () => {
  it("a rota confere `RAIOX_CRM_SECRET`, e não o segredo do vizinho", () => {
    const codigo = lerCodigo(ROTA) + lerCodigo(GUARDA);
    expect(codigo).toContain("RAIOX_CRM_SECRET");
    expect(codigo).not.toContain("process.env.CRON_SECRET");
    expect(codigo).not.toContain("process.env.ADMIN_SECRET");
    expect(codigo).not.toContain("RAIOX_COMERCIAL_SECRET");
  });

  it("a guarda vem ANTES de qualquer consulta — porta fechada não lê banco", () => {
    const codigo = lerCodigo(ROTA);
    expect(codigo.indexOf("conferirSegredo")).toBeGreaterThan(-1);
    expect(codigo.indexOf("conferirSegredo")).toBeLessThan(codigo.indexOf("raioXDeDisparos(prisma"));
  });

  it("não configurada = fechada: sem a variável a guarda devolve 503", async () => {
    const { conferirSegredo } = await import("./guarda");
    const r = conferirSegredo({ proprio: "qualquer-coisa", authorization: null }, {} as NodeJS.ProcessEnv);
    expect(r).toEqual({ ok: false, status: 503, motivo: expect.stringContaining("RAIOX_CRM_SECRET") });
  });

  it("segredo curto não abre a porta — o mínimo da casa é 16", async () => {
    const { conferirSegredo, TAMANHO_MINIMO_DO_SEGREDO } = await import("./guarda");
    const curto = "a".repeat(TAMANHO_MINIMO_DO_SEGREDO - 1);
    const r = conferirSegredo(
      { proprio: curto, authorization: null },
      { RAIOX_CRM_SECRET: curto } as unknown as NodeJS.ProcessEnv,
    );
    expect(r.ok).toBe(false);
    expect(r).toMatchObject({ status: 503 });
  });

  it("segredo certo abre, pelo cabeçalho próprio e pelo Bearer", async () => {
    const { conferirSegredo } = await import("./guarda");
    const env = { RAIOX_CRM_SECRET: "s".repeat(24) } as unknown as NodeJS.ProcessEnv;
    expect(conferirSegredo({ proprio: "s".repeat(24), authorization: null }, env)).toEqual({ ok: true });
    expect(conferirSegredo({ proprio: null, authorization: `Bearer ${"s".repeat(24)}` }, env)).toEqual({ ok: true });
    expect(conferirSegredo({ proprio: "errado", authorization: null }, env)).toMatchObject({ ok: false, status: 401 });
  });
});
