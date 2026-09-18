/**
 * ⛔ O CONTRATO: A PORTA DO ESTADO DA CORRENTE SÓ LÊ.
 *
 * Molde do `raioX/contrato.test.ts`: o teste LÊ O FONTE, porque é o fonte que
 * garante a regra. "Esta rota não envia" escrito em comentário é prosa; o que
 * barra um envio é não existir caminho de envio no arquivo.
 *
 * ⚠️ Os arquivos deste bloco EXPLICAM o que não fazem e citam nomes pelo nome.
 * Por isso o teste mede CÓDIGO: o fonte sem comentários.
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

const ROTA = "src/app/api/cron/comercial/estado-da-corrente/route.ts";
const SERVICO = "src/services/salaDeVendas/estadoDaCorrente/estadoDaCorrente.ts";
const GUARDA = "src/services/salaDeVendas/estadoDaCorrente/guarda.ts";
const PORTAS = "src/services/salaDeVendas/recepcao/portasDeEntrada.ts";
const CANAL = "src/services/foocci-sdr/FoocciSalesChannel.ts";

const TODOS = [ROTA, SERVICO, GUARDA, PORTAS];

/** Tudo que, nesta casa, faz uma mensagem SAIR. */
const CAMINHOS_DE_ENVIO = [
  "entregarMensagem",
  "registrarSaida",
  "enviarModeloDeVendas",
  "FoocciSalesChannel",
  "salaDeVendas/abordar",
  "recepcao/recepcaoDeLeads",
  "salaDeVendas/ta/",
  "followUp",
  "sendMessage",
  "sendTemplate",
  "abordarLead",
];

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

  it("a rota é GET e só GET", () => {
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

  it("o serviço só usa leitura de Prisma", () => {
    const codigo = lerCodigo(SERVICO);
    const chamadas = [...codigo.matchAll(/\bdb\.[a-zA-Z]+\.([a-zA-Z]+)\(/g)].map((m) => m[1]);
    expect(chamadas.length).toBeGreaterThan(0);
    expect([...new Set(chamadas)].sort()).toEqual(["count", "findMany", "findUnique", "groupBy"]);
  });
});

describe("⛔ multi-tenant: isto é o comercial da FOOCCI, não o CRM do restaurante", () => {
  for (const arquivo of TODOS) {
    it(`${arquivo} não toca em restaurantId nem em services/crm`, () => {
      const codigo = lerCodigo(arquivo);
      expect(codigo).not.toContain("restaurantId");
      expect(codigo).not.toContain("services/crm");
    });
  }
});

describe("a porta", () => {
  it("confere `CORRENTE_COMERCIAL_SECRET`, e não o segredo de nenhum vizinho", () => {
    const codigo = lerCodigo(ROTA) + lerCodigo(GUARDA);
    expect(codigo).toContain("CORRENTE_COMERCIAL_SECRET");
    expect(codigo).not.toContain("process.env.CRON_SECRET");
    expect(codigo).not.toContain("process.env.ADMIN_SECRET");
    expect(codigo).not.toContain("process.env.RAIOX_COMERCIAL_SECRET");
  });

  it("a guarda vem ANTES de qualquer consulta — porta fechada não lê banco", () => {
    const codigo = lerCodigo(ROTA);
    expect(codigo.indexOf("conferirSegredo")).toBeGreaterThan(-1);
    expect(codigo.indexOf("conferirSegredo")).toBeLessThan(codigo.indexOf("estadoDaCorrente(prisma"));
  });

  it("⛔ não devolve telefone, nome nem texto de conversa de ninguém", () => {
    const codigo = lerCodigo(SERVICO);
    // `whatsapp` aparece SÓ para responder "tem telefone?" — nunca para sair.
    expect(codigo).not.toContain("texto:");
    const selects = [...codigo.matchAll(/nome:\s*true/g)];
    expect(selects).toHaveLength(0);
  });
});

describe("⛔ os nomes das chaves não podem divergir do canal", () => {
  it("as duas chaves lidas aqui são exatamente as que o canal usa", () => {
    const canal = ler(CANAL);
    const servico = ler(SERVICO);
    for (const chave of ["FOOCCI_SDR_SEND_ENABLED", "FOOCCI_SDR_IA_RESPONDE_SOZINHA"]) {
      expect(canal, `o canal não cita mais ${chave}`).toContain(chave);
      expect(servico, `a leitura não cita ${chave}`).toContain(chave);
    }
  });
});

describe("⛔ ausência de informação não é informação", () => {
  it("todo número que pode faltar tem um motivo ao lado, e `naoMedido` existe", () => {
    const codigo = lerCodigo(SERVICO);
    expect(codigo).toContain("naoMedido");
    expect(codigo).toContain("motivoDoNaoMedido");
    expect(codigo).toContain("somaFecha");
  });
});
