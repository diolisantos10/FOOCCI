/**
 * ⛔ O CONTRATO DA CAMPANHA — medido no FONTE, não prometido em comentário.
 *
 * Molde de `raioX/contrato.test.ts`. O que este bloco guarda:
 *
 *   · a rota de disparo é a ÚNICA coisa da casa que chama o motor — não existe
 *     cron que ligue a campanha sozinha;
 *   · o interruptor é consultado DENTRO do laço, antes de cada pessoa;
 *   · o painel SÓ LÊ;
 *   · a decisão é pura: `rota.ts` e `textos.ts` não conhecem envio nem banco;
 *   · cada porta tem o segredo dela, sem encosto em segredo de vizinho.
 */

import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { ACOES_QUE_FALAM } from "./rota";

const RAIZ = path.resolve(__dirname, "../../../..");
const ler = (relativo: string) => fs.readFileSync(path.join(RAIZ, relativo), "utf8");
const lerCodigo = (relativo: string) =>
  ler(relativo)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

const ROTA_DISPARAR = "src/app/api/admin/comercial/reabordagem/disparar/route.ts";
const ROTA_PARAR = "src/app/api/admin/comercial/reabordagem/parar/route.ts";
const MOTOR = "src/services/salaDeVendas/reabordagem/executar.ts";
const PAINEL = "src/services/salaDeVendas/reabordagem/painel.ts";
const DECISAO = "src/services/salaDeVendas/reabordagem/rota.ts";
const TEXTOS = "src/services/salaDeVendas/reabordagem/textos.ts";
const SINAIS = "src/services/salaDeVendas/reabordagem/sinais.ts";
const SELECAO = "src/services/salaDeVendas/reabordagem/selecao.ts";
const GUARDA = "src/services/salaDeVendas/reabordagem/guarda.ts";

const CAMINHOS_DE_ENVIO = [
  "entregarMensagem",
  "registrarSaida",
  "enviarModeloDeVendas",
  "enviarTextoDeVendas",
  "FoocciSalesChannel",
  "abordarLead",
  "sendMessage",
  "sendTemplate",
];

const ESCRITAS =
  /\b(db|prisma|tx)\.[a-zA-Z]+\.(create|createMany|update|updateMany|upsert|delete|deleteMany)\(/;

describe("⛔ a decisão é PURA — nem envia, nem escreve, nem lê banco", () => {
  for (const arquivo of [DECISAO, TEXTOS, SINAIS]) {
    it(`${arquivo} não conhece envio nem Prisma`, () => {
      const codigo = lerCodigo(arquivo);
      for (const proibido of CAMINHOS_DE_ENVIO) {
        expect(codigo, `${arquivo} cita ${proibido}`).not.toContain(proibido);
      }
      expect(codigo).not.toMatch(ESCRITAS);
      expect(codigo).not.toContain("PrismaClient");
    });
  }
});

describe("⛔ a fila e o painel SÓ LEEM", () => {
  for (const arquivo of [SELECAO, PAINEL]) {
    it(`${arquivo} não escreve e não envia`, () => {
      const codigo = lerCodigo(arquivo);
      expect(codigo, `${arquivo} escreve no banco`).not.toMatch(ESCRITAS);
      for (const proibido of CAMINHOS_DE_ENVIO) {
        expect(codigo, `${arquivo} cita ${proibido}`).not.toContain(proibido);
      }
      for (const cru of ["$executeRaw", "$executeRawUnsafe", "$queryRawUnsafe"]) {
        expect(codigo).not.toContain(cru);
      }
    });
  }

  it("as únicas operações de Prisma no painel são `count` e `findMany`", () => {
    const codigo = lerCodigo(PAINEL);
    const chamadas = [...codigo.matchAll(/\bdb\.[a-zA-Z]+\.([a-zA-Z]+)\(/g)].map((m) => m[1]);
    expect(chamadas.length).toBeGreaterThan(0);
    expect([...new Set(chamadas)].sort()).toEqual(["count", "findMany", "findFirst"].sort());
  });
});

describe("⛔ nada dispara sozinho", () => {
  it("nenhuma rota de cron conhece o motor da campanha", () => {
    const cron = path.join(RAIZ, "src/app/api/cron");
    const arquivos: string[] = [];
    const varrer = (dir: string) => {
      for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
        const cheio = path.join(dir, item.name);
        if (item.isDirectory()) varrer(cheio);
        else if (item.name.endsWith(".ts")) arquivos.push(cheio);
      }
    };
    varrer(cron);
    expect(arquivos.length).toBeGreaterThan(0);

    for (const a of arquivos) {
      const codigo = fs.readFileSync(a, "utf8");
      expect(codigo, `${a} chama o motor da campanha`).not.toContain("dispararUmLote");
      expect(codigo, `${a} importa o motor da campanha`).not.toContain("reabordagem/executar");
    }
  });

  it("o motor não se agenda: nada de setInterval, setTimeout nem cron", () => {
    const codigo = lerCodigo(MOTOR);
    for (const proibido of ["setInterval", "setTimeout", "node-cron", "schedule("]) {
      expect(codigo).not.toContain(proibido);
    }
  });
});

describe("⛔ o interruptor é consultado ANTES DE CADA PESSOA", () => {
  it("há uma consulta ao interruptor DENTRO do laço de candidatos", () => {
    const codigo = lerCodigo(MOTOR);
    const laco = codigo.indexOf("for (const fatos of candidatos)");
    expect(laco).toBeGreaterThan(-1);

    const depoisDoLaco = codigo.slice(laco);
    expect(depoisDoLaco).toContain("conferirInterruptor(db)");

    // E a consulta vem ANTES da decisão e do envio, não depois.
    expect(depoisDoLaco.indexOf("conferirInterruptor(db)")).toBeLessThan(
      depoisDoLaco.indexOf("decidirReabordagem("),
    );
  });

  it("o motor confere o interruptor também antes de ler a fila", () => {
    const codigo = lerCodigo(MOTOR);
    expect(codigo.indexOf("conferirInterruptor(db)")).toBeLessThan(
      codigo.indexOf("selecionarProximoLote("),
    );
  });
});

describe("as portas", () => {
  for (const rota of [ROTA_DISPARAR, ROTA_PARAR]) {
    it(`${rota} confere o segredo PRÓPRIO, sem encosto no vizinho`, () => {
      const codigo = lerCodigo(rota) + lerCodigo(GUARDA);
      expect(codigo).toContain("REABORDAGEM_SECRET");
      expect(codigo).not.toContain("process.env.CRON_SECRET");
      expect(codigo).not.toContain("process.env.ADMIN_SECRET");
      expect(codigo).not.toContain("RELIGAMENTO_FRIO_SECRET");
    });

    it(`${rota} confere o segredo ANTES de qualquer outra coisa`, () => {
      const codigo = lerCodigo(rota);
      const guarda = codigo.indexOf("conferirSegredo");
      expect(guarda).toBeGreaterThan(-1);
      for (const depois of ["dispararUmLote(", "pararTudo(", "retomar(", "responsavelPelaCampanha("]) {
        const i = codigo.indexOf(depois);
        if (i > -1) expect(i, `${depois} veio antes da guarda`).toBeGreaterThan(guarda);
      }
    });
  }

  it("disparar é POST — um lote não sai por um GET de robô", () => {
    const codigo = lerCodigo(ROTA_DISPARAR);
    expect(codigo).toMatch(/export async function POST\(/);
    for (const verbo of ["GET", "PUT", "PATCH", "DELETE"]) {
      expect(codigo).not.toMatch(new RegExp(`export (async )?function ${verbo}\\(`));
    }
  });

  it("parar aceita POST (puxar/soltar) e GET (só conferir)", () => {
    const codigo = lerCodigo(ROTA_PARAR);
    expect(codigo).toMatch(/export async function POST\(/);
    expect(codigo).toMatch(/export async function GET\(/);
    // Retomar exige o valor EXATO "1": o lado seguro do pânico é estar puxado.
    expect(codigo).toMatch(/get\("retomar"\)\s*===\s*"1"/);
  });
});

describe("⛔ só quatro ações falam", () => {
  it("a lista das que falam não cresceu por descuido", () => {
    expect([...ACOES_QUE_FALAM].sort()).toEqual(
      ["ABORDAGEM_INICIAL", "NAVEGA_MENU", "PEDE_CONTATO_CERTO", "PERGUNTA_SE_RESPONSAVEL"].sort(),
    );
  });
});
