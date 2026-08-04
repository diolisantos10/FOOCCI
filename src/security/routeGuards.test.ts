/**
 * Structural security gates (guardrail 4: "código é trava, não prompt").
 *
 * A disciplina de multi-tenant e de auth de admin era mantida por HÁBITO. Estes
 * dois gates falham o build e impedem que a classe inteira de furo reentre — é a
 * raiz da rota-fantasma `/api/admin/delivery-quote` (CR de segurança 03/08/2026,
 * item A2), que estava em PUBLIC_PATHS e confiava nos headers de tenant, que num
 * caminho público são INPUT DO ATACANTE.
 *
 * GATE (a) — Nenhuma rota sob um prefixo de PUBLIC_PATHS pode usar os helpers de
 * tenant (`getTenantContext`/`getTenantId`/`assertTenant`/`getTenantIdFromRequest`
 * de `@/lib/tenant`). Em caminho público o middleware NÃO injeta/sobrescreve
 * `x-restaurant-id`/`x-user-role`, então confiar neles é bypass de autenticação
 * por spoof de header.
 *
 * GATE (b) — Toda rota sob `src/app/api/admin/**` precisa referenciar uma guarda
 * de admin conhecida (`guardAdmin`/`checkAdminRequest`), OU estar no allowlist
 * abaixo com justificativa (rotas que fazem auth inline de raw-secret ou que
 * EMITEM a credencial e por isso não podem exigi-la).
 *
 * A fonte da verdade das rotas públicas é `src/middleware.ts` — os regexes são
 * EXTRAÍDOS de lá, nunca duplicados, para que este teste acompanhe o middleware.
 * A mensagem de falha carrega o arquivo culpado (guardrail 6).
 */

import { readFileSync, readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, it, expect } from "vitest";

const API_DIR = join(process.cwd(), "src/app/api");
const MIDDLEWARE = join(process.cwd(), "src/middleware.ts");

// ── Extract PUBLIC_PATHS regexes straight from the middleware source ───────────
// The block runs from the `PUBLIC_PATHS` declaration to `function isPublicPath`.
// Every entry is a single-line regex literal `/^…$/`; comments never contain the
// `$/` terminator, so a non-greedy scan lifts each pattern cleanly.
const middlewareSrc = readFileSync(MIDDLEWARE, "utf8");
const publicBlock = middlewareSrc.slice(
  middlewareSrc.indexOf("PUBLIC_PATHS"),
  middlewareSrc.indexOf("function isPublicPath"),
);
const PUBLIC_REGEXES: RegExp[] = [...publicBlock.matchAll(/\/\^.*?\$\//g)].map(
  (m) => new RegExp(m[0].slice(1, -1)),
);

// ── Map a route.ts file to the URL path the middleware would see ───────────────
// Strip the trailing `/route.ts`, turn dynamic `[seg]`/`[...seg]` into a literal
// stand-in (public subtrees use `(/.*)?`, so any value matches), and drop Next
// route groups `(group)` which don't appear in the URL.
function routeUrl(file: string): string {
  const rel = relative(API_DIR, file).split(sep);
  rel.pop(); // drop "route.ts"
  const segments = rel
    .filter((s) => !(s.startsWith("(") && s.endsWith(")"))) // route groups
    .map((s) => (/^\[.*\]$/.test(s) ? "x" : s)); // dynamic params
  return "/api/" + segments.join("/");
}

function isPublicUrl(url: string): boolean {
  return PUBLIC_REGEXES.some((re) => re.test(url));
}

// ── Collect every route handler under src/app/api ──────────────────────────────
function collectRoutes(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...collectRoutes(full));
    else if (entry.name === "route.ts") out.push(full);
  }
  return out;
}

const ROUTES = collectRoutes(API_DIR);

// Tenant helpers that read the spoofable middleware headers. Barred in any route
// that lives under a public prefix.
const TENANT_HELPER =
  /\b(getTenantContext|getTenantId|assertTenant|getTenantIdFromRequest)\b/;

// Known admin guards. A route under /api/admin/** must reference one of these…
const ADMIN_GUARD = /\b(guardAdmin|checkAdminRequest)\b/;

// …unless it is one of these vetted exceptions. Each does its OWN auth and cannot
// use the shared helper. Adding to this list is a conscious, reviewed act — a NEW
// admin route that merely "forgets" the guard still fails the build.
const ADMIN_GUARD_EXEMPT = new Map<string, string>([
  [
    "admin/session/route.ts",
    "login de admin: valida o ADMIN_SECRET cru e EMITE o cookie; não pode exigir a sessão que ela mesma cria.",
  ],
  [
    "admin/reset-owner/route.ts",
    "recuperação de emergência (isento no early-exit do middleware); auth inline por x-admin-secret === ADMIN_SECRET.",
  ],
  [
    "admin/force-deploy/route.ts",
    "fallback de deploy operacional; auth inline por x-admin-secret === ADMIN_SECRET.",
  ],
]);

function apiRel(file: string): string {
  return relative(API_DIR, file).split(sep).join("/");
}

describe("security gates — route invariants", () => {
  it("finds the API route tree (sanity: the scan actually ran)", () => {
    expect(ROUTES.length).toBeGreaterThan(100);
    expect(PUBLIC_REGEXES.length).toBeGreaterThan(10);
  });

  // ── GATE (a) ────────────────────────────────────────────────────────────────
  it("no route under a PUBLIC_PATHS prefix uses a tenant helper (spoofable headers)", () => {
    const offenders: string[] = [];
    for (const file of ROUTES) {
      if (!isPublicUrl(routeUrl(file))) continue;
      if (TENANT_HELPER.test(readFileSync(file, "utf8"))) {
        offenders.push(`${apiRel(file)}  (url ${routeUrl(file)})`);
      }
    }
    expect(
      offenders,
      `Rotas PÚBLICAS usando helper de tenant (header = input do atacante). ` +
        `Reescreva o escopo sem confiar em x-restaurant-id/x-user-role:\n  - ` +
        offenders.join("\n  - "),
    ).toEqual([]);
  });

  // ── GATE (b) ────────────────────────────────────────────────────────────────
  it("every /api/admin/** route references a known admin guard (or is a vetted exception)", () => {
    const offenders: string[] = [];
    for (const file of ROUTES) {
      const rel = apiRel(file);
      if (!rel.startsWith("admin/")) continue;
      if (ADMIN_GUARD_EXEMPT.has(rel)) continue;
      if (!ADMIN_GUARD.test(readFileSync(file, "utf8"))) {
        offenders.push(rel);
      }
    }
    expect(
      offenders,
      `Rotas admin SEM guarda conhecida (guardAdmin/checkAdminRequest). ` +
        `Adicione a guarda — ou, se fizer auth própria de propósito, entre no ` +
        `ADMIN_GUARD_EXEMPT com justificativa:\n  - ` +
        offenders.join("\n  - "),
    ).toEqual([]);
  });

  // Keep the exemption list honest: a stale entry (route renamed/removed) must be
  // caught so the allowlist can't silently authorize a path that no longer exists.
  it("every ADMIN_GUARD_EXEMPT entry still points at a real route", () => {
    const missing = [...ADMIN_GUARD_EXEMPT.keys()].filter(
      (rel) => !ROUTES.some((f) => apiRel(f) === rel),
    );
    expect(
      missing,
      `Entradas obsoletas em ADMIN_GUARD_EXEMPT (remova):\n  - ${missing.join("\n  - ")}`,
    ).toEqual([]);
  });
});
