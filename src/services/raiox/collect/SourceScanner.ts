/**
 * Raio-X — varredura do CÓDIGO-FONTE (somente leitura de arquivos).
 *
 * Procura, no código que JÁ ESTAVA LÁ, as instâncias concretas de cinco padrões
 * que custaram dinheiro real em produtos desta casa. Cada padrão foi nomeado
 * antes de ser procurado — pedido genérico ("veja o que dá para melhorar")
 * devolve opinião de estilo; padrão nomeado devolve arquivo e linha.
 *
 *   1. Trabalho que existe e ninguém vê — laço/retentativa sem teto que alcança
 *      chamada paga. Nada falha; a fatura cresce.
 *   2. Id aceito sem conferir de quem é — a rota recebe restaurantId/customerId
 *      pela requisição e não prova que o chamador é dono daquele id.
 *   3. Promessa que o código não cumpre — campo de veredito escrito como
 *      literal `true` (o portão que "aprovou" sem nunca ter rodado).
 *   4. Estado morto — campo do schema que é gravado e nenhum leitor consome.
 *   5. Porta aberta para a internet — rota em PUBLIC_PATHS que alcança, pela
 *      cadeia de imports, uma chamada paga.
 *
 * Determinística por construção: só `node:fs` de leitura, nenhuma rede, nenhum
 * banco, nenhuma IA. A mesma árvore produz sempre a mesma saída — é isso que
 * permite dizer "piorou desde ontem".
 *
 * Honestidade do instrumento: os detectores 2, 3 e 4 são HEURÍSTICOS. Eles
 * produzem uma lista de CANDIDATOS com arquivo:linha para leitura humana, não
 * um veredito. As sondas que os consomem dizem isso no texto — vender heurística
 * como certeza é a mesma mentira que estamos caçando.
 */

import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join, relative, dirname, resolve } from "node:path";
import {
  available,
  unavailable,
  type Block,
  type SourceSample,
  type PublicPaidRoute,
  type UnscopedIdRoute,
  type HollowCheck,
  type DeadStateField,
  type UnboundedLoop,
} from "../types";

const SKIP_DIRS = new Set(["node_modules", ".next", ".git", "dist", "build", "coverage", ".claude"]);
const CODE_EXT = /\.(ts|tsx)$/;
const TEST_FILE = /\.(test|spec)\.(ts|tsx)$/;

// ── chamada paga ──────────────────────────────────────────────────────────────
//
// Não é lista de nomes de serviço (envelhece na primeira renomeação): é o gesto
// de chamar um provedor que cobra por chamada.
const PAID_CALL_RE = new RegExp(
  [
    String.raw`from\s+["']openai["']`,
    String.raw`require\(["']openai["']\)`,
    String.raw`new\s+OpenAI\s*\(`,
    String.raw`chat\.completions\.create`,
    String.raw`images\.(generate|edit)`,
    String.raw`audio\.(transcriptions|speech)`,
    String.raw`embeddings\.create`,
    String.raw`api\.openai\.com`,
    String.raw`generativelanguage\.googleapis\.com`,
    String.raw`api\.deepseek\.com`,
    String.raw`api\.anthropic\.com`,
    String.raw`replicate\.com/v1`,
    String.raw`api\.elevenlabs\.io`,
  ].join("|"),
);

// ── prova de posse ────────────────────────────────────────────────────────────
//
// O que, neste projeto, prova que o chamador é dono do id que ele mandou.
// A lista nasceu de calibração contra o repositório, não de imaginação: cada
// entrada foi acrescentada depois de um falso positivo concreto. `guardAdmin`
// (src/app/api/admin/agents/waiter/runtime/_guard.ts) e `getTenantContext`
// (src/lib/tenant.ts) foram os dois primeiros — sem eles, rotas protegidas
// apareciam como desprotegidas, e detector que grita demais é detector que
// ninguém lê.
const OWNERSHIP_PROOF_RE: { name: string; re: RegExp }[] = [
  { name: "tenant do JWT (header injetado pelo middleware)", re: /TENANT_HEADER|x-restaurant-id|getTenantContext|getRestaurantId\s*\(|requireTenant|resolveTenant|tenantFromRequest/ },
  { name: "sessão NextAuth", re: /getServerSession|getToken\s*\(/ },
  { name: "segredo de admin", re: /checkAdminRequest|ADMIN_SECRET|x-admin-secret|guardAdmin/ },
  { name: "segredo de cron", re: /CRON_SECRET/ },
  { name: "chave de API externa", re: /ApiKeyService|verifyApiKey|apiKeyFromRequest/ },
  { name: "token do agente de impressão", re: /agentToken|printAgentToken|PRINT_AGENT/ },
  { name: "assinatura do provedor (HMAC)", re: /X-Hub-Signature|createHmac|verifySignature|timingSafeEqual/ },
  { name: "token não adivinhável no próprio recurso", re: /acceptToken|recoveryCode|\btoken\b\s*[:=].*findUnique/ },
  { name: "escopo resolvido por função dedicada", re: /resolverEscopo\w*\s*\(|assertOwnership|ensureOwnership/ },
  { name: "escopo derivado do slug público (loja aberta)", re: /findUnique\(\{\s*where:\s*\{\s*slug/ },
];

/**
 * O id não adivinhável usado DE PROPÓSITO como senha (o cuid do pedido no
 * acompanhamento público, por exemplo), com a decisão escrita ao lado.
 * Não zera o achado — muda a faixa: vira "revisar a justificativa" em vez de
 * "rota exposta". Isto é aviso, não trava: um comentário pode silenciar a
 * faixa alta. É aceitável aqui porque o raio-x é instrumento de leitura, não
 * portão de produção — mas está escrito para ninguém confundir os dois.
 */
const BEARER_ID_JUSTIFIED_RE =
  /bearer token|não adivinh|nao adivinh|unguessable|entropy|entropia|age como senha/i;

/** Onde um id de dono entra pela requisição. */
const ID_INTAKE_RE =
  /(searchParams\.get\(["'](restaurantId|customerId|subscriptionId|userId|orderId)["']\)|\b(restaurantId|customerId|subscriptionId)\b\s*[,}]\s*=\s*(await\s*)?(req|request)\.json|body\.(restaurantId|customerId|subscriptionId))/;

// ── veredito escrito como literal ─────────────────────────────────────────────
//
// Campo cujo NOME afirma que algo foi verificado, recebendo `true`/"PASS" fixo.
// `ok:`/`success:` ficam de fora de propósito: em resposta de rota são o código
// de status, não um veredito de verificação — incluí-los afogaria o achado.
const VERDICT_FIELD_RE =
  /\b(verified|validated|isValid|checked|passed|approved|audited|compliant|coherent|coherence|grounded|gatePassed|gateResult|safeToSend|isSafe|doesNot[A-Za-z]+|hasNo[A-Za-z]+|allChecksPassed|qualityOk)\s*:\s*(true|"PASS"|'PASS')\s*[,;}]/;

// ── laço sem teto ─────────────────────────────────────────────────────────────
const UNBOUNDED_LOOP_PATTERNS: { kind: string; re: RegExp }[] = [
  { kind: "laço infinito", re: /\bwhile\s*\(\s*true\s*\)/ },
  { kind: "laço infinito", re: /\bfor\s*\(\s*;\s*;\s*\)/ },
  { kind: "relógio sem desligamento", re: /setInterval\s*\(/ },
];

// ── campos genéricos demais para julgar ───────────────────────────────────────
const GENERIC_FIELDS = new Set([
  "id", "name", "slug", "phone", "email", "status", "type", "mode", "notes", "title", "body",
  "content", "url", "text", "value", "data", "metadata", "createdAt", "updatedAt", "deletedAt",
  "restaurantId", "customerId", "userId", "orderId", "conversationId", "campaignId", "source",
  "error", "message", "label", "key", "code", "total", "price", "quantity", "amount", "stage",
]);

// ── utilidades de arquivo ─────────────────────────────────────────────────────

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".") && entry.name !== ".github") continue;
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (CODE_EXT.test(entry.name) && !TEST_FILE.test(entry.name)) out.push(full);
  }
  return out;
}

function lineOf(src: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index && i < src.length; i++) if (src[i] === "\n") line++;
  return line;
}

/**
 * Qual bloco Prisma abriu mais recentemente acima da linha: `data` (escrita),
 * `where`/`select`/`include`/`orderBy` (leitura), ou nada.
 * Heurística deliberada de 12 linhas de janela: sem AST, olhar longe demais faz
 * o marcador de uma chamada vazar para a seguinte.
 */
export function nearestPrismaMarker(lines: string[], index: number, window = 12): "data" | "read" | null {
  for (let i = index; i >= 0 && index - i <= window; i--) {
    const line = lines[i] ?? "";
    if (/\bdata\s*:\s*\{/.test(line)) return "data";
    if (/\b(where|select|include|orderBy)\s*:\s*\{/.test(line)) return "read";
  }
  return null;
}

/**
 * Há um teto explícito logo abaixo do laço? Contador comparado a um máximo, ou
 * `break`/`return` guardado por condição. A janela é curta de propósito: teto
 * que mora 60 linhas abaixo não é teto que alguém lê.
 */
export function hasTerminationGuarantee(lines: string[], index: number, window = 40): boolean {
  const chunk = lines.slice(index, index + window).join("\n");
  // Sem `\b` antes do nome: o contador real do repositório chama-se
  // `callAttempt`, e exigir limite de palavra fazia o detector não reconhecer o
  // teto que existia bem ali — alarme falso por acidente de regex.
  const countedRetry =
    /\w*(attempt|tries|retries|iter|count|round)\w*\s*(\+\+|\+=)/i.test(chunk) &&
    /(<=?|>=?)\s*[A-Z_]{3,}|\b(MAX|LIMIT)[A-Z_]*\b/.test(chunk);
  // Consumo de fluxo (`const { done } = await reader.read(); if (done) break;`)
  // termina quando os dados acabam. Não é retentativa: é leitura.
  const endOfData = /\bdone\b[\s\S]{0,120}\bbreak\b|\.read\(\)|\bEOF\b|length\s*===\s*0[\s\S]{0,60}break/.test(chunk);
  return countedRetry || endOfData;
}

/** Nome da função/const que envolve um índice — o suficiente para localizar sem AST. */
function enclosingName(src: string, index: number): string | null {
  const before = src.slice(0, index);
  const re = /(?:export\s+)?(?:async\s+)?function\s+([A-Za-z0-9_]+)|const\s+([A-Za-z0-9_]+)\s*[:=]\s*(?:async\s*)?\(/g;
  let name: string | null = null;
  let m: RegExpExecArray | null;
  while ((m = re.exec(before)) !== null) name = m[1] ?? m[2] ?? name;
  return name;
}

// ── grafo de imports ──────────────────────────────────────────────────────────

const IMPORT_RE = /(?:from\s+["']([^"']+)["']|import\s*\(\s*["']([^"']+)["']\s*\))/g;

function resolveSpec(spec: string, fromFile: string, root: string): string | null {
  let base: string;
  if (spec.startsWith("@/")) base = join(root, "src", spec.slice(2));
  else if (spec.startsWith(".")) base = resolve(dirname(fromFile), spec);
  else return null; // pacote externo — não faz parte do grafo interno
  for (const cand of [base, `${base}.ts`, `${base}.tsx`, join(base, "index.ts"), join(base, "index.tsx")]) {
    if (existsSync(cand) && statSync(cand).isFile()) return cand;
  }
  return null;
}

/**
 * Caminho mais curto do arquivo até um arquivo que faz chamada paga.
 * Devolve `null` quando não alcança. Busca em largura, com teto de visitados
 * (ironia registrada: o próprio detector de laço sem teto tem teto).
 */
function pathToPaidCall(
  start: string,
  graph: Map<string, string[]>,
  paid: Set<string>,
  maxVisited = 4000,
): string[] | null {
  const queue: string[][] = [[start]];
  const seen = new Set([start]);
  let visited = 0;
  while (queue.length > 0 && visited < maxVisited) {
    const path = queue.shift()!;
    const node = path[path.length - 1];
    visited++;
    if (!node) continue;
    if (paid.has(node)) return path;
    for (const next of graph.get(node) ?? []) {
      if (seen.has(next)) continue;
      seen.add(next);
      queue.push([...path, next]);
    }
  }
  return null;
}

// ── PUBLIC_PATHS ──────────────────────────────────────────────────────────────

/**
 * Lê os padrões de rota pública do middleware. Se o formato mudar e nada for
 * encontrado, devolve `null` — e o bloco inteiro vira "não sei". Uma lista
 * vazia seria lida como "nenhuma rota pública", que é o oposto da verdade.
 */
export function parsePublicPaths(middlewareSrc: string): RegExp[] | null {
  const block = middlewareSrc.match(/PUBLIC_PATHS[^=]*=\s*\[([\s\S]*?)\n\];/);
  if (!block) return null;
  // Os literais têm barras escapadas (`/^\/api\/qr(\/.*)?$/`): o corpo precisa
  // aceitar `\/` sem encerrar o literal. Foi exatamente aqui que a primeira
  // versão devolveu zero padrões — e "zero rotas públicas" teria sido uma
  // mentira tranquila, porque nenhum achado apareceria.
  const patterns = [...(block[1] ?? "").matchAll(/\/(\^(?:\\.|[^/\n\\])*?)\/[gimsuy]*\s*,/g)]
    .map((m) => m[1])
    .filter((p): p is string => typeof p === "string");
  if (patterns.length === 0) return null;
  const out: RegExp[] = [];
  for (const p of patterns) {
    try {
      out.push(new RegExp(p));
    } catch {
      /* padrão que não compila é ignorado; a contagem cai e o achado mostra isso */
    }
  }
  return out.length > 0 ? out : null;
}

/** `src/app/api/pedido/[slug]/route.ts` → `/api/pedido/[slug]` */
export function routePathOf(file: string, root: string): string {
  const rel = relative(join(root, "src/app"), file).replace(/\\/g, "/");
  return "/" + rel.replace(/\/route\.tsx?$/, "").replace(/\(([^)]+)\)\//g, "");
}

/**
 * A rota casa com algum padrão público? Segmentos dinâmicos viram um valor
 * concreto ("x") para que `/api/pedido/[slug]` teste como `/api/pedido/x`.
 */
export function isPublicRoute(routePath: string, publicPaths: RegExp[]): boolean {
  const concrete = routePath.replace(/\[\.\.\.[^\]]+\]/g, "x").replace(/\[[^\]]+\]/g, "x");
  return publicPaths.some((re) => re.test(concrete));
}

// ── schema Prisma ─────────────────────────────────────────────────────────────

export interface SchemaField {
  model: string;
  field: string;
}

/** Campos declarados no schema, ignorando relações, ids e campos genéricos. */
export function parseSchemaFields(schemaSrc: string): SchemaField[] {
  const out: SchemaField[] = [];
  const modelRe = /model\s+([A-Za-z0-9_]+)\s*\{([\s\S]*?)\n\}/g;
  let m: RegExpExecArray | null;
  while ((m = modelRe.exec(schemaSrc)) !== null) {
    const model = m[1] ?? "";
    for (const raw of (m[2] ?? "").split("\n")) {
      const line = raw.trim();
      if (!line || line.startsWith("//") || line.startsWith("@@") || line.startsWith("///")) continue;
      const fm = line.match(/^([a-z][A-Za-z0-9_]*)\s+([A-Za-z0-9_\[\]?]+)/);
      if (!fm) continue;
      const field = fm[1] ?? "";
      const fieldType = fm[2] ?? "";
      // Relação (tipo começa com maiúscula e não é escalar) fica de fora.
      const scalar = /^(String|Int|Float|Boolean|DateTime|Decimal|Json|BigInt|Bytes)/.test(fieldType);
      if (!scalar) continue;
      if (GENERIC_FIELDS.has(field) || field.length < 6) continue;
      out.push({ model, field });
    }
  }
  return out;
}

// ── varredura ─────────────────────────────────────────────────────────────────

export interface ScanOptions {
  /** Raiz do repositório. */
  root: string;
  /** Teto de candidatos reportados por padrão (o relatório precisa caber). */
  maxPerPattern?: number;
}

export function scanSource(opts: ScanOptions): Block<SourceSample> {
  const { root, maxPerPattern = 15 } = opts;
  const srcDir = join(root, "src");
  if (!existsSync(srcDir)) {
    return unavailable(`código-fonte não encontrado em ${srcDir} (a imagem de produção não carrega src/?)`);
  }

  let files: string[];
  try {
    files = walk(srcDir);
  } catch (err) {
    return unavailable(`falha ao listar o código-fonte: ${(err as Error).message}`);
  }
  if (files.length === 0) return unavailable("nenhum arquivo .ts/.tsx encontrado em src/");

  // Uma leitura por arquivo, reaproveitada por todos os detectores.
  const sources = new Map<string, string>();
  for (const f of files) {
    try {
      sources.set(f, readFileSync(f, "utf8"));
    } catch {
      /* arquivo ilegível é omitido da contagem; não vira achado silencioso */
    }
  }

  const rel = (f: string) => relative(root, f).replace(/\\/g, "/");

  // grafo + arquivos que gastam dinheiro
  const graph = new Map<string, string[]>();
  const paid = new Set<string>();
  for (const [file, src] of sources) {
    if (PAID_CALL_RE.test(src)) paid.add(file);
    const deps: string[] = [];
    for (const m of src.matchAll(IMPORT_RE)) {
      const spec = m[1] ?? m[2];
      const resolved = spec ? resolveSpec(spec, file, root) : null;
      if (resolved && sources.has(resolved)) deps.push(resolved);
    }
    graph.set(file, deps);
  }

  const routeFiles = files.filter((f) => /\/app\/.*\/route\.tsx?$/.test(f));

  // ── padrão 5: porta aberta ──────────────────────────────────────────────────
  const middlewarePath = join(srcDir, "middleware.ts");
  const publicPaths = existsSync(middlewarePath)
    ? parsePublicPaths(readFileSync(middlewarePath, "utf8"))
    : null;
  if (!publicPaths) {
    return unavailable(
      "não consegui ler PUBLIC_PATHS de src/middleware.ts — sem essa lista eu não sei quais rotas são públicas, e supor que nenhuma é seria mentir",
    );
  }

  // A prova de posse mora com frequência num helper importado (`_guard`,
  // `getTenantContext`). Olhar só o arquivo da rota reprovava rota protegida —
  // por isso a busca inclui os módulos importados diretamente por ela.
  const proofsOf = (file: string): string[] => {
    const own = sources.get(file) ?? "";
    const neighbours = (graph.get(file) ?? []).map((d) => sources.get(d) ?? "").join("\n");
    const haystack = `${own}\n${neighbours}`;
    return OWNERSHIP_PROOF_RE.filter((g) => g.re.test(haystack)).map((g) => g.name);
  };

  const publicRoutes = routeFiles.filter((f) => isPublicRoute(routePathOf(f, root), publicPaths));
  const publicPaidRoutes: PublicPaidRoute[] = [];
  for (const file of publicRoutes) {
    const path = pathToPaidCall(file, graph, paid);
    if (!path) continue;
    publicPaidRoutes.push({
      route: routePathOf(file, root),
      file: rel(file),
      pathToCost: path.map(rel),
      guards: proofsOf(file),
    });
  }

  // ── padrão 2: id sem dono ───────────────────────────────────────────────────
  const unscopedIdRoutes: UnscopedIdRoute[] = [];
  let routesWithIdIntakeTotal = 0;
  for (const file of routeFiles) {
    const src = sources.get(file) ?? "";
    const intake: { line: number; snippet: string }[] = [];
    for (const [i, text] of src.split("\n").entries()) {
      if (ID_INTAKE_RE.test(text)) intake.push({ line: i + 1, snippet: text.trim().slice(0, 160) });
    }
    if (intake.length === 0) continue;
    routesWithIdIntakeTotal++;
    const proofs = proofsOf(file);
    if (proofs.length > 0) continue;
    unscopedIdRoutes.push({
      file: rel(file),
      route: routePathOf(file, root),
      intake: intake.slice(0, 3),
      ownershipProofs: BEARER_ID_JUSTIFIED_RE.test(src)
        ? ["id tratado como senha, com a decisão escrita no arquivo (revisar)"]
        : [],
    });
  }

  // ── padrão 3: veredito escrito como literal ─────────────────────────────────
  const hollowChecks: HollowCheck[] = [];
  for (const [file, src] of sources) {
    // Fixtures e mocks declaram vereditos fixos de propósito — não são promessa
    // ao usuário. Testes já estão fora da varredura.
    if (/\/(testing|fixtures|mocks|scenarios)\//.test(file)) continue;
    const lines = src.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const text = lines[i] ?? "";
      const m = text.match(VERDICT_FIELD_RE);
      if (!m) continue;
      // `select: { coherence: true, confidence: true }` do Prisma NÃO é veredito
      // — é escolha de coluna. Três dos nove candidatos da primeira calibração
      // eram exatamente isso. Duas marcas denunciam: a palavra `select`/`where`
      // na linha, ou mais de um `: true` na mesma linha.
      const looksLikePrismaSelect =
        /\b(select|where|include|orderBy)\s*:/.test(text) ||
        (text.match(/:\s*true/g) ?? []).length > 1;
      if (looksLikePrismaSelect) continue;
      hollowChecks.push({
        file: rel(file),
        line: i + 1,
        field: m[1] ?? "(campo)",
        snippet: text.trim().slice(0, 160),
        enclosing: enclosingName(src, src.indexOf(text)),
      });
    }
  }

  // ── padrão 4: estado morto ──────────────────────────────────────────────────
  const schemaPath = join(root, "prisma/schema.prisma");
  const deadStateFields: DeadStateField[] = [];
  let schemaFieldsChecked = 0;
  if (existsSync(schemaPath)) {
    const all = parseSchemaFields(readFileSync(schemaPath, "utf8"));
    // Nome repetido entre modelos (`activatedAt` em AgentBrainVersion E em
    // PlanSubscription) confunde escrita de um com leitura do outro e produz
    // achado que aponta o arquivo errado. Sem AST, o honesto é não julgar esses
    // campos — e dizer no número quantos ficaram de fora.
    const occurrences = new Map<string, number>();
    for (const f of all) occurrences.set(f.field, (occurrences.get(f.field) ?? 0) + 1);
    const schemaFields = all.filter((f) => occurrences.get(f.field) === 1);
    schemaFieldsChecked = schemaFields.length;

    const writeHits = new Map<string, { file: string; line: number }[]>();
    const readHits = new Map<string, number>();
    const names = new Set(schemaFields.map((f) => f.field));

    for (const [file, src] of sources) {
      const lines = src.split("\n");
      for (let i = 0; i < lines.length; i++) {
        const text = lines[i] ?? "";
        for (const m of text.matchAll(/\b([a-z][A-Za-z0-9_]{5,})\b/g)) {
          const field = m[1];
          if (!field || !names.has(field)) continue;

          // LEITURA: acesso a propriedade, coluna escolhida, comparação ou
          // desestruturação.
          const isRead =
            new RegExp(`\\.${field}\\b`).test(text) ||
            new RegExp(`\\b${field}\\s*:\\s*true`).test(text) ||
            new RegExp(`\\b${field}\\s*[!=<>]=`).test(text) ||
            new RegExp(`[{,]\\s*${field}\\s*[,}]`).test(text);
          if (isRead) {
            readHits.set(field, (readHits.get(field) ?? 0) + 1);
            continue;
          }

          // ESCRITA: `campo:` cujo bloco Prisma mais próximo acima é `data:`.
          // Sem esse contexto, declaração de interface (`campo: number;`) e
          // filtro de `where` entravam como escrita — foi assim que a primeira
          // calibração acusou um campo escrito no MEU arquivo de tipos.
          if (!new RegExp(`\\b${field}\\s*:`).test(text)) continue;
          const marker = nearestPrismaMarker(lines, i);
          // `nextAttemptAt: { lte: now }` num `where` é LEITURA — e a segunda
          // calibração acusou a fila de impressão inteira como estado morto por
          // não olhar isso. Filtro é consumo do campo.
          if (marker === "read") {
            readHits.set(field, (readHits.get(field) ?? 0) + 1);
            continue;
          }
          if (marker !== "data") continue;
          const arr = writeHits.get(field) ?? [];
          if (arr.length < 5) arr.push({ file: rel(file), line: i + 1 });
          writeHits.set(field, arr);
        }
      }
    }

    for (const { model, field } of schemaFields) {
      const writes = writeHits.get(field) ?? [];
      const reads = readHits.get(field) ?? 0;
      if (writes.length > 0 && reads === 0) deadStateFields.push({ model, field, writes, reads });
    }
  }

  // ── padrão 1: laço sem teto ─────────────────────────────────────────────────
  const unboundedLoops: UnboundedLoop[] = [];
  for (const [file, src] of sources) {
    const hasClear = /clearInterval\s*\(/.test(src);
    const lines = src.split("\n");
    for (let i = 0; i < lines.length; i++) {
      // Comentário que MENCIONA `while (true)` não é laço. Este próprio arquivo
      // se autodenunciou na calibração — o detector precisa saber distinguir
      // código de prosa sobre código.
      const text = lines[i] ?? "";
      if (/^\s*(\/\/|\*|\/\*)/.test(text)) continue;
      for (const { kind, re } of UNBOUNDED_LOOP_PATTERNS) {
        if (!re.test(text)) continue;
        // setInterval com clearInterval no mesmo arquivo tem desligamento: não é achado.
        if (kind === "relógio sem desligamento" && hasClear) continue;
        // `while (true)` com teto explícito logo abaixo (`callAttempt <=
        // MAX_SCENARIO_RETRIES`) é retentativa limitada, não sangria. Os três
        // únicos candidatos da calibração eram exatamente isso — sem esta
        // metade, o detector nasceria alarmando sempre e seria desligado na
        // primeira semana.
        if (kind === "laço infinito" && hasTerminationGuarantee(lines, i)) continue;
        unboundedLoops.push({
          file: rel(file),
          line: i + 1,
          kind,
          snippet: text.trim().slice(0, 160),
          reachesPaidCall: pathToPaidCall(file, graph, paid) !== null,
        });
      }
    }
  }

  const cap = <T>(arr: T[]) => arr.slice(0, maxPerPattern);

  return available({
    root,
    filesScanned: sources.size,
    paidCallFiles: [...paid].map(rel).sort(),
    publicPaidRoutes: cap(publicPaidRoutes.sort((a, b) => a.route.localeCompare(b.route))),
    publicRoutesTotal: publicRoutes.length,
    unscopedIdRoutes: cap(unscopedIdRoutes.sort((a, b) => a.route.localeCompare(b.route))),
    routesWithIdIntakeTotal,
    hollowChecks: cap(hollowChecks.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line)),
    deadStateFields: cap(deadStateFields.sort((a, b) => a.model.localeCompare(b.model) || a.field.localeCompare(b.field))),
    schemaFieldsChecked,
    unboundedLoops: cap(unboundedLoops.sort((a, b) => Number(b.reachesPaidCall) - Number(a.reachesPaidCall))),
  });
}
