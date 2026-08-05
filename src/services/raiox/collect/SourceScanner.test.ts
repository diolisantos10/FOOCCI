/**
 * O scanner tem duas obrigações e as duas são testadas:
 *  1. encontrar o padrão quando ele está lá;
 *  2. NÃO acusar o caso legítimo — que é o que faz a diferença entre um
 *     instrumento e um alarme de carro.
 *
 * Cada "não acusa" abaixo corresponde a um falso positivo REAL que a
 * calibração contra este repositório produziu. Os comentários dizem qual.
 */

import { describe, it, expect } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  scanSource,
  parsePublicPaths,
  parseSchemaFields,
  isPublicRoute,
  routePathOf,
  nearestPrismaMarker,
  hasTerminationGuarantee,
} from "./SourceScanner";

// ── mini-repositório de mentira, montado em disco ────────────────────────────

const MIDDLEWARE = `
const PUBLIC_PATHS: RegExp[] = [
  /^\\/api\\/aberta$/,
  /^\\/api\\/loja(\\/.*)?$/,
  /^\\/api\\/admin(\\/.*)?$/,
];
`;

function buildRepo(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "raiox-"));
  for (const [rel, content] of Object.entries(files)) {
    const full = join(root, rel);
    mkdirSync(join(full, ".."), { recursive: true });
    writeFileSync(full, content, "utf8");
  }
  return root;
}

function scan(files: Record<string, string>) {
  const root = buildRepo({ "src/middleware.ts": MIDDLEWARE, ...files });
  try {
    const block = scanSource({ root, maxPerPattern: 50 });
    if (!block.ok) throw new Error(`bloco indisponível: ${block.reason}`);
    return block.data;
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

// ── peças auxiliares ─────────────────────────────────────────────────────────

describe("parsePublicPaths", () => {
  it("lê os literais com barras escapadas", () => {
    const out = parsePublicPaths(MIDDLEWARE)!;
    expect(out).toHaveLength(3);
    expect(out.some((r) => r.test("/api/loja/x"))).toBe(true);
  });

  it("devolve null quando não encontra a lista — e null vira 'não sei', não 'nenhuma'", () => {
    expect(parsePublicPaths("const OUTRA_COISA = [];")).toBeNull();
  });
});

describe("isPublicRoute / routePathOf", () => {
  it("segmento dinâmico casa com o padrão público", () => {
    const paths = parsePublicPaths(MIDDLEWARE)!;
    expect(isPublicRoute("/api/loja/[slug]", paths)).toBe(true);
    expect(isPublicRoute("/api/privada", paths)).toBe(false);
  });

  it("grupo de rota do Next some do caminho", () => {
    expect(routePathOf("/r/src/app/(dashboard)/api/x/route.ts", "/r")).toBe("/api/x");
  });
});

describe("nearestPrismaMarker", () => {
  it("distingue escrita de leitura pelo bloco que abriu", () => {
    const escrita = ["await prisma.x.update({", "  data: {", "    campo: 1,"];
    const leitura = ["await prisma.x.findMany({", "  where: {", "    campo: 1,"];
    expect(nearestPrismaMarker(escrita, 2)).toBe("data");
    expect(nearestPrismaMarker(leitura, 2)).toBe("read");
    expect(nearestPrismaMarker(["interface X {", "  campo: number;"], 1)).toBeNull();
  });
});

describe("hasTerminationGuarantee", () => {
  it("reconhece retentativa com contador e teto", () => {
    const src = ["while (true) {", "  callAttempt++;", "  if (callAttempt <= MAX_RETRIES) continue;", "}"];
    expect(hasTerminationGuarantee(src, 0)).toBe(true);
  });

  it("reconhece leitura de fluxo que termina nos dados", () => {
    const src = ["while (true) {", "  const { done } = await reader.read();", "  if (done) break;", "}"];
    expect(hasTerminationGuarantee(src, 0)).toBe(true);
  });

  it("não reconhece parada onde não há nenhuma", () => {
    const src = ["while (true) {", "  await chamaDeNovo();", "}"];
    expect(hasTerminationGuarantee(src, 0)).toBe(false);
  });
});

describe("parseSchemaFields", () => {
  it("ignora relações, ids e campos genéricos", () => {
    const out = parseSchemaFields(`
model Pedido {
  id        String   @id
  status    String
  aprovadoEm DateTime?
  cliente   Cliente  @relation(fields: [clienteId], references: [id])
}
`);
    expect(out).toEqual([{ model: "Pedido", field: "aprovadoEm" }]);
  });
});

// ── padrão 5: porta aberta ───────────────────────────────────────────────────

describe("porta aberta", () => {
  it("ACHA rota pública que alcança chamada paga por cadeia de imports", () => {
    const d = scan({
      "src/app/api/aberta/route.ts": `import { gera } from "@/services/img";\nexport async function POST() { return gera(); }`,
      "src/services/img.ts": `import OpenAI from "openai";\nexport async function gera() { return new OpenAI().images.generate({}); }`,
    });
    expect(d.publicPaidRoutes).toHaveLength(1);
    expect(d.publicPaidRoutes[0].route).toBe("/api/aberta");
    expect(d.publicPaidRoutes[0].guards).toEqual([]);
    // a cadeia inteira vai na evidência — sem ela ninguém confirma o achado
    expect(d.publicPaidRoutes[0].pathToCost[1]).toContain("src/services/img.ts");
  });

  it("NÃO ACUSA rota privada, mesmo alcançando chamada paga", () => {
    const d = scan({
      "src/app/api/privada/route.ts": `import { gera } from "@/services/img";\nexport async function POST() { return gera(); }`,
      "src/services/img.ts": `import OpenAI from "openai";\nexport const gera = async () => new OpenAI().images.generate({});`,
    });
    expect(d.publicPaidRoutes).toHaveLength(0);
  });

  it("NÃO ACUSA rota pública que não chega a nenhuma chamada paga", () => {
    const d = scan({ "src/app/api/aberta/route.ts": `export async function GET() { return 1; }` });
    expect(d.publicPaidRoutes).toHaveLength(0);
    expect(d.publicRoutesTotal).toBe(1);
  });

  it("registra a defesa quando ela mora num helper importado (falso positivo real: _guard)", () => {
    const d = scan({
      "src/app/api/admin/x/route.ts": `import { guardAdmin } from "./_guard";\nimport { gera } from "@/services/img";\nexport async function POST(req) { const d = guardAdmin(req); return gera(); }`,
      "src/app/api/admin/x/_guard.ts": `export function guardAdmin(req) { return req.headers.get("x-admin-secret") ? null : 401; }`,
      "src/services/img.ts": `import OpenAI from "openai";\nexport const gera = async () => new OpenAI().images.generate({});`,
    });
    expect(d.publicPaidRoutes[0].guards).toContain("segredo de admin");
  });
});

// ── padrão 2: id sem dono ────────────────────────────────────────────────────

describe("id sem dono", () => {
  it("ACHA rota que lê restaurantId da query sem nenhuma prova", () => {
    const d = scan({
      "src/app/api/rel/route.ts": `export async function GET(req) { const restaurantId = req.nextUrl.searchParams.get("restaurantId"); return restaurantId; }`,
    });
    expect(d.unscopedIdRoutes).toHaveLength(1);
    expect(d.unscopedIdRoutes[0].intake[0].line).toBe(1);
  });

  it("NÃO ACUSA rota que resolve o tenant pelo JWT (falso positivo real: getTenantContext)", () => {
    const d = scan({
      "src/app/api/rel/route.ts": `import { getTenantContext } from "@/lib/tenant";\nexport async function GET(req) { const ctx = getTenantContext(req); const customerId = req.nextUrl.searchParams.get("customerId"); return ctx.restaurantId + customerId; }`,
      "src/lib/tenant.ts": `export const getTenantContext = (req) => ({ restaurantId: req.headers.get("x-restaurant-id") });`,
    });
    expect(d.unscopedIdRoutes).toHaveLength(0);
    expect(d.routesWithIdIntakeTotal).toBe(1);
  });

  it("rebaixa (não apaga) o id-como-senha com justificativa escrita", () => {
    const d = scan({
      "src/app/api/pedido/status/route.ts": `// O id é um cuid: age como bearer token, com entropia suficiente.\nexport async function GET(req) { const orderId = req.nextUrl.searchParams.get("orderId"); return orderId; }`,
    });
    expect(d.unscopedIdRoutes).toHaveLength(1);
    expect(d.unscopedIdRoutes[0].ownershipProofs[0]).toContain("decisão escrita");
  });
});

// ── padrão 3: selo vazio ─────────────────────────────────────────────────────

describe("selo vazio", () => {
  it("ACHA veredito escrito como literal, com a função em volta", () => {
    const d = scan({
      "src/services/gate.ts": `export function verificaTudo() {\n  return { approved: true, motivo: "sem juiz configurado" };\n}`,
    });
    expect(d.hollowChecks).toHaveLength(1);
    expect(d.hollowChecks[0].field).toBe("approved");
    expect(d.hollowChecks[0].enclosing).toBe("verificaTudo");
  });

  it("NÃO ACUSA select do Prisma (falso positivo real: `coherence: true` em select)", () => {
    const d = scan({
      "src/services/leitura.ts": `export const ler = () => prisma.log.findMany({ select: { coherence: true, confidence: true } });`,
    });
    expect(d.hollowChecks).toHaveLength(0);
  });

  it("NÃO ACUSA veredito calculado", () => {
    const d = scan({
      "src/services/gate.ts": `export const verifica = (x) => ({ approved: x.score > 0.7 });`,
    });
    expect(d.hollowChecks).toHaveLength(0);
  });
});

// ── padrão 4: estado morto ───────────────────────────────────────────────────

const SCHEMA = `
model Pagamento {
  id            String @id
  cartaoFinal   String?
  aprovadoQuando DateTime?
}
`;

describe("estado morto", () => {
  it("ACHA campo escrito e nunca lido", () => {
    const d = scan({
      "prisma/schema.prisma": SCHEMA,
      "src/services/pay.ts": `export const salvar = () => prisma.pagamento.update({ where: { id }, data: {\n  cartaoFinal: "1234",\n} });`,
    });
    const campos = d.deadStateFields.map((f) => f.field);
    expect(campos).toContain("cartaoFinal");
  });

  it("NÃO ACUSA campo consumido num where (falso positivo real: a fila de impressão)", () => {
    const d = scan({
      "prisma/schema.prisma": SCHEMA,
      "src/services/pay.ts":
        `export const salvar = () => prisma.pagamento.update({ where: { id }, data: {\n  aprovadoQuando: new Date(),\n} });\n` +
        `export const buscar = () => prisma.pagamento.findMany({ where: {\n  aprovadoQuando: null,\n} });`,
    });
    expect(d.deadStateFields.map((f) => f.field)).not.toContain("aprovadoQuando");
  });

  it("NÃO ACUSA campo apenas declarado numa interface (falso positivo real: o arquivo de tipos do próprio raio-x)", () => {
    const d = scan({
      "prisma/schema.prisma": SCHEMA,
      "src/types.ts": `export interface Pagamento {\n  cartaoFinal: string;\n}`,
    });
    expect(d.deadStateFields).toHaveLength(0);
  });

  it("NÃO ACUSA campo lido como propriedade", () => {
    const d = scan({
      "prisma/schema.prisma": SCHEMA,
      "src/services/pay.ts":
        `export const salvar = () => prisma.pagamento.update({ where: { id }, data: {\n  cartaoFinal: "1234",\n} });\n` +
        `export const mostrar = (p) => p.cartaoFinal;`,
    });
    expect(d.deadStateFields).toHaveLength(0);
  });
});

// ── padrão 1: laço sem teto ──────────────────────────────────────────────────

describe("laço sem teto", () => {
  it("ACHA laço infinito sem parada e marca quando ele alcança chamada paga", () => {
    const d = scan({
      "src/services/loop.ts": `import OpenAI from "openai";\nexport async function roda() {\n  while (true) {\n    await new OpenAI().chat.completions.create({});\n  }\n}`,
    });
    expect(d.unboundedLoops).toHaveLength(1);
    expect(d.unboundedLoops[0].reachesPaidCall).toBe(true);
  });

  it("NÃO ACUSA retentativa com teto (falso positivo real: AISimulatorService)", () => {
    const d = scan({
      "src/services/loop.ts": `export async function roda() {\n  let callAttempt = 0;\n  while (true) {\n    try { return await x(); } catch (e) { callAttempt++; if (callAttempt <= MAX_RETRIES) continue; throw e; }\n  }\n}`,
    });
    expect(d.unboundedLoops).toHaveLength(0);
  });

  it("NÃO ACUSA comentário que fala de while(true) (falso positivo real: este scanner)", () => {
    const d = scan({ "src/services/doc.ts": `// cuidado com while (true) sem teto\nexport const x = 1;` });
    expect(d.unboundedLoops).toHaveLength(0);
  });

  it("NÃO ACUSA setInterval que tem clearInterval no mesmo arquivo", () => {
    const d = scan({
      "src/services/timer.ts": `const t = setInterval(f, 1000);\nexport const parar = () => clearInterval(t);`,
    });
    expect(d.unboundedLoops).toHaveLength(0);
  });
});

// ── ausência de dado ─────────────────────────────────────────────────────────

describe("ausência de dado", () => {
  it("sem src/ o bloco fica indisponível COM MOTIVO — não devolve amostra vazia", () => {
    const root = mkdtempSync(join(tmpdir(), "raiox-vazio-"));
    try {
      const block = scanSource({ root });
      expect(block.ok).toBe(false);
      if (!block.ok) expect(block.reason).toContain("código-fonte não encontrado");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("sem PUBLIC_PATHS legível o bloco inteiro é indisponível — 'nenhuma rota pública' seria mentira", () => {
    const root = buildRepo({
      "src/middleware.ts": "export const nada = 1;",
      "src/app/api/x/route.ts": "export const GET = () => 1;",
    });
    try {
      const block = scanSource({ root });
      expect(block.ok).toBe(false);
      if (!block.ok) expect(block.reason).toContain("PUBLIC_PATHS");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
