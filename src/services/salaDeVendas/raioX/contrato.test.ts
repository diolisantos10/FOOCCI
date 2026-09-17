/**
 * ⛔ O CONTRATO: O RAIO-X SÓ LÊ.
 *
 * Molde do `copiloto.test.ts` desta mesma pasta: o teste LÊ O FONTE, porque é o
 * fonte que garante a regra. Uma promessa em comentário ("esta rota não envia")
 * é prosa; o que barra um envio é não existir caminho de envio no arquivo.
 *
 * ⚠️ Os arquivos deste bloco EXPLICAM, em comentário, o que não fazem — e citam
 * pelo nome `entregarMensagem` e `registrarSaida`. Uma busca por texto cru
 * acharia a explicação e reprovaria justamente o arquivo que está certo. Por
 * isso o teste mede CÓDIGO: o fonte sem comentários.
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

const ROTA = "src/app/api/cron/comercial/raio-x-conversas/route.ts";
const SERVICO = "src/services/salaDeVendas/raioX/raioXDasConversas.ts";
const GUARDA = "src/services/salaDeVendas/raioX/guarda.ts";
const TELEFONE = "src/services/salaDeVendas/raioX/telefone.ts";

const TODOS = [ROTA, SERVICO, GUARDA, TELEFONE];

/** Tudo que, nesta casa, faz uma mensagem SAIR. */
const CAMINHOS_DE_ENVIO = [
  "entregarMensagem",
  "registrarSaida",
  "enviarModeloDeVendas",
  "FoocciSalesChannel",
  "foocci-sdr/FoocciSalesChannel",
  "salaDeVendas/abordar",
  "salaDeVendas/ta/",
  "followUp",
  "sendMessage",
  "sendTemplate",
];

/**
 * Tudo que, em Prisma, ESCREVE.
 *
 * ⚠️ Casado com o cliente (`db.` / `prisma.`) de propósito: um `.update(` solto
 * também é `createHash(...).update(...)`, que é hash de segredo e não escrita.
 * Proibir a palavra reprovaria a guarda, que está certa.
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

  it("o serviço só usa leitura de Prisma: count e findMany", () => {
    const codigo = lerCodigo(SERVICO);
    const chamadas = [...codigo.matchAll(/\bdb\.[a-zA-Z]+\.([a-zA-Z]+)\(/g)].map((m) => m[1]);
    expect(chamadas.length).toBeGreaterThan(0);
    expect([...new Set(chamadas)].sort()).toEqual(["count", "findMany"]);
  });
});

describe("⛔ multi-tenant: isto é o comercial da FOOCCI, não o CRM do restaurante", () => {
  for (const arquivo of TODOS) {
    it(`${arquivo} não toca em restaurantId nem em services/crm`, () => {
      const codigo = lerCodigo(arquivo);
      expect(codigo).not.toContain("restaurantId");
      expect(codigo).not.toContain("services/crm");
      expect(codigo).not.toMatch(/\bdb\.(restaurant|crm[A-Z])/);
    });
  }

  it("o serviço lê SÓ os models do comercial da Foocci", () => {
    const codigo = lerCodigo(SERVICO);
    const models = [...codigo.matchAll(/\bdb\.([a-zA-Z]+)\./g)].map((m) => m[1]);
    expect([...new Set(models)].sort()).toEqual([
      "contato",
      "empresa",
      "leadMensagem",
      "oportunidade",
      "siteLead",
    ]);
  });
});

describe("a porta", () => {
  it("a rota confere `RAIOX_COMERCIAL_SECRET`, e não o segredo do vizinho", () => {
    const codigo = lerCodigo(ROTA) + lerCodigo(GUARDA);
    expect(codigo).toContain("RAIOX_COMERCIAL_SECRET");
    expect(codigo).not.toContain("process.env.CRON_SECRET");
    expect(codigo).not.toContain("process.env.ADMIN_SECRET");
  });

  it("a guarda vem ANTES de qualquer consulta — porta fechada não lê banco", () => {
    const codigo = lerCodigo(ROTA);
    expect(codigo.indexOf("conferirSegredo")).toBeGreaterThan(-1);
    expect(codigo.indexOf("conferirSegredo")).toBeLessThan(codigo.indexOf("raioXDasConversas(prisma"));
  });
});

describe("o telefone", () => {
  it("a rota não formata telefone por conta própria — delega à única porta", () => {
    const codigo = lerCodigo(ROTA);
    expect(codigo).toContain("telefoneParaResposta");
  });

  it("o serviço nunca devolve `whatsapp` cru: todo telefone passa por `tel(`", () => {
    const codigo = lerCodigo(SERVICO);
    // A única leitura do campo é dentro da chamada que formata.
    const cruas = [...codigo.matchAll(/\.whatsapp\b/g)];
    const dentroDeTel = [...codigo.matchAll(/tel\([^)]*\.whatsapp\b/g)];
    expect(cruas.length).toBe(dentroDeTel.length);
    expect(cruas.length).toBeGreaterThan(0);
  });

  it("abrir o telefone fica no log — e o log não guarda número", () => {
    const codigo = lerCodigo(ROTA);
    expect(codigo).toMatch(/telefoneCompleto\)\s*\{[\s\S]*console\.warn/);
    const trecho = codigo.slice(codigo.indexOf("console.warn"));
    const bloco = trecho.slice(0, trecho.indexOf("});") + 3);
    expect(bloco).not.toContain("whatsapp");
    expect(bloco).not.toContain("telefone:");
  });
});
