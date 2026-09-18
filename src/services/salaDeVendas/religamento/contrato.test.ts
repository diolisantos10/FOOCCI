/**
 * ⛔ O CONTRATO: O RELIGAMENTO NÃO MANDA MENSAGEM.
 *
 * Molde de `raioX/contrato.test.ts`: o teste LÊ O FONTE, porque é o fonte que
 * garante a regra. Uma promessa em comentário ("esta rota não envia") é prosa;
 * o que barra um envio é não existir caminho de envio no arquivo.
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

const ROTA = "src/app/api/admin/comercial/religar-frio/route.ts";
const SERVICO = "src/services/salaDeVendas/religamento/religarFrio.ts";
const GUARDA = "src/services/salaDeVendas/religamento/guarda.ts";

const TODOS = [ROTA, SERVICO, GUARDA];

/** Tudo que, nesta casa, faz uma mensagem SAIR. */
const CAMINHOS_DE_ENVIO = [
  "entregarMensagem",
  "registrarSaida",
  "enviarModeloDeVendas",
  "enviarTextoDeVendas",
  "FoocciSalesChannel",
  "salaDeVendas/abordar",
  "abordarLead",
  "salaDeVendas/ta/",
  "followUp",
  "sendMessage",
  "sendTemplate",
  "reabordagem/executar",
];

describe("⛔ nenhum caminho de envio", () => {
  for (const arquivo of TODOS) {
    it(`${arquivo} não conhece nenhuma função que faça mensagem sair`, () => {
      const codigo = lerCodigo(arquivo);
      for (const proibido of CAMINHOS_DE_ENVIO) {
        expect(codigo, `${arquivo} cita ${proibido}`).not.toContain(proibido);
      }
    });
  }
});

describe("a porta", () => {
  it("a rota é POST e só POST — gravar não pode acontecer por um GET de robô", () => {
    const codigo = lerCodigo(ROTA);
    expect(codigo).toMatch(/export async function POST\(/);
    for (const verbo of ["GET", "PUT", "PATCH", "DELETE"]) {
      expect(codigo).not.toMatch(new RegExp(`export (async )?function ${verbo}\\(`));
    }
  });

  it("confere `RELIGAMENTO_FRIO_SECRET`, e não o segredo do vizinho", () => {
    const codigo = lerCodigo(ROTA) + lerCodigo(GUARDA);
    expect(codigo).toContain("RELIGAMENTO_FRIO_SECRET");
    expect(codigo).not.toContain("process.env.CRON_SECRET");
    expect(codigo).not.toContain("process.env.ADMIN_SECRET");
    expect(codigo).not.toContain("RAIOX_COMERCIAL_SECRET");
  });

  it("a guarda vem ANTES do religamento — porta fechada não toca no banco", () => {
    const codigo = lerCodigo(ROTA);
    expect(codigo.indexOf("conferirSegredo")).toBeGreaterThan(-1);
    expect(codigo.indexOf("conferirSegredo")).toBeLessThan(
      codigo.indexOf("religarConscienciaDoFrio(prisma"),
    );
  });

  it("gravar só com o valor EXATO `1` — qualquer outra coisa é ensaio", () => {
    const codigo = lerCodigo(ROTA);
    expect(codigo).toMatch(/searchParams\.get\("gravar"\)\s*===\s*"1"/);
  });
});

describe("⛔ o serviço não escreve por conta própria: ele delega", () => {
  it("as únicas chamadas de Prisma no serviço são `count`", () => {
    const codigo = lerCodigo(SERVICO);
    const chamadas = [...codigo.matchAll(/\bdb\.[a-zA-Z]+\.([a-zA-Z]+)\(/g)].map((m) => m[1]);
    expect(chamadas.length).toBeGreaterThan(0);
    expect([...new Set(chamadas)].sort()).toEqual(["count"]);
  });

  it("nada de SQL cru", () => {
    for (const arquivo of TODOS) {
      const codigo = lerCodigo(arquivo);
      for (const cru of ["$executeRaw", "$executeRawUnsafe", "$queryRawUnsafe"]) {
        expect(codigo, `${arquivo} chama ${cru}`).not.toContain(cru);
      }
    }
  });
});
