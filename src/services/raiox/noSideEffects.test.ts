/**
 * A trava: o raio-x NUNCA age.
 *
 * O pedido foi explícito — a coleta não envia mensagem, não cria pedido, não
 * toca em pagamento. Isso não pode viver só no cabeçalho dos arquivos: prompt é
 * aviso, código é trava. Aqui a trava é uma varredura estática.
 *
 * Três camadas, com fronteiras diferentes de propósito:
 *   • O núcleo (types, service, probes) não importa NADA fora de si mesmo.
 *   • `collect/` pode ler o banco, mas só com verbos de leitura.
 *   • `persistence/` pode escrever, mas só nas tabelas `raiox_*`.
 */

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";

const RAIOX_DIR = join(process.cwd(), "src/services/raiox");

function collectTs(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) collectTs(full, out);
    else if (entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts")) out.push(full);
  }
  return out;
}

const files = collectTs(RAIOX_DIR);
const rel = (f: string) => f.replace(`${process.cwd()}/`, "");
const isCore = (f: string) => !f.includes("/collect/") && !f.includes("/persistence/");

/** Qualquer coisa que ENVIE, COBRE, CRIE PEDIDO ou GASTE dinheiro. */
const FORBIDDEN_ANYWHERE = [
  "openai", "@/lib/openai", "anthropic", "deepseek",
  "MessagingService", "SendService", "WhatsAppMessaging", "InstagramChannelService",
  "OrderService", "OrderDraftService", "PaymentService", "mercadopago", "MercadoPago",
  "PixService", "confirmCardPayment", "PrintQueueService",
  "CampaignService", "ScheduledCampaignRunner", "AutomationScheduler",
  "node-fetch", "axios",
];

/** Verbos do Prisma que MUDAM dado. */
const MUTATION_VERBS = [
  "create(", "createMany(", "update(", "updateMany(", "upsert(",
  "delete(", "deleteMany(", "executeRaw", "$transaction",
];

describe("raio-x — o núcleo não conhece o mundo", () => {
  it("varre a pasta inteira", () => {
    expect(files.length).toBeGreaterThanOrEqual(6);
  });

  for (const file of files.filter(isCore)) {
    it(`só importa módulos internos: ${rel(file)}`, () => {
      const src = readFileSync(file, "utf8");
      for (const m of src.matchAll(/from\s+["']([^"']+)["']/g)) {
        const spec = m[1];
        const internal = spec.startsWith("./") || spec.startsWith("../") || spec.startsWith("node:");
        expect(internal, `import externo "${spec}" em ${rel(file)}`).toBe(true);
      }
    });
  }
});

describe("raio-x — nenhuma camada envia, cobra ou cria pedido", () => {
  for (const file of files) {
    it(`sem importar caminho de ação: ${rel(file)}`, () => {
      const src = readFileSync(file, "utf8");
      for (const m of src.matchAll(/from\s+["']([^"']+)["']/g)) {
        for (const bad of FORBIDDEN_ANYWHERE) {
          expect(m[1].includes(bad), `import proibido "${m[1]}" em ${rel(file)}`).toBe(false);
        }
      }
    });
  }
});

describe("raio-x — a coleta só lê", () => {
  const collectors = files.filter((f) => f.includes("/collect/"));

  it("existe camada de coleta", () => {
    expect(collectors.length).toBeGreaterThan(0);
  });

  for (const file of collectors) {
    it(`nenhum verbo de mutação: ${rel(file)}`, () => {
      // Comentários explicam o que a camada NÃO faz e citariam os verbos; a
      // varredura olha código, não prosa sobre código.
      const src = readFileSync(file, "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/^\s*\/\/.*$/gm, "");
      for (const verb of MUTATION_VERBS) {
        expect(src.includes(`prisma.${verb}`), `mutação "${verb}" em ${rel(file)}`).toBe(false);
        // `prisma.modelo.update(` — o ponto entre modelo e verbo
        const re = new RegExp(`prisma\\.[A-Za-z]+\\.${verb.replace("(", "\\(")}`);
        expect(re.test(src), `mutação "${verb}" em ${rel(file)}`).toBe(false);
      }
    });
  }
});

describe("raio-x — a persistência só toca as próprias tabelas", () => {
  const stores = files.filter((f) => f.includes("/persistence/"));

  for (const file of stores) {
    it(`escreve apenas em raioX*: ${rel(file)}`, () => {
      const src = readFileSync(file, "utf8");
      for (const m of src.matchAll(/prisma\.([A-Za-z]+)\./g)) {
        expect(m[1].startsWith("raioX"), `persistência tocou "prisma.${m[1]}" em ${rel(file)}`).toBe(true);
      }
    });
  }
});

describe("raio-x — a rota de cron é POST e só POST", () => {
  it("não existe handler GET na rota de coleta", () => {
    const src = readFileSync(join(process.cwd(), "src/app/api/cron/raiox/run/route.ts"), "utf8");
    expect(/export\s+async\s+function\s+GET/.test(src)).toBe(false);
    expect(/export\s+async\s+function\s+POST/.test(src)).toBe(true);
    expect(src.includes("CRON_SECRET")).toBe(true);
  });
});
