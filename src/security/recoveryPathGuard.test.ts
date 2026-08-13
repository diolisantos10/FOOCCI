/**
 * Portão estrutural do caminho de recuperação de acesso (guardrail 4: prompt é
 * aviso, código é trava).
 *
 * O QUE ESTE PORTÃO IMPEDE DE VOLTAR — o achado de 13/08/2026:
 * a página pública `/recover` tinha um modo `?force=true` que chamava
 * `POST /api/admin/reset-owner` e APAGAVA TODAS AS CONTAS do restaurante, a um
 * clique do lojista que só queria voltar a entrar (o login mandava para lá com o
 * rótulo "Esqueci minha senha"). Ferramenta irreversível não fica em tela pública,
 * e comentário no arquivo não impede a próxima refatoração de recolocar o botão.
 *
 * As três invariantes:
 *   (a) NENHUMA tela do navegador chama `/api/admin/reset-owner`;
 *   (b) a página `/recover` não tem modo destrutivo (nem `force`, nem confirmação
 *       para apagar);
 *   (c) o login não manda quem esqueceu a senha para a página de INSTALAÇÃO — ele
 *       mostra o canal de socorro.
 *
 * SABOTAGEM CONFERIDA: recolocar o `fetch("/api/admin/reset-owner")` na página, ou
 * o link `/recover?force=true`, reprova aqui.
 */

import { readFileSync, readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, it, expect } from "vitest";

const APP_DIR = join(process.cwd(), "src/app");
const COMPONENTS_DIR = join(process.cwd(), "src/components");
const RECOVER_PAGE = join(APP_DIR, "recover/page.tsx");
const LOGIN_PAGE = join(APP_DIR, "login/page.tsx");

/**
 * Tira comentários antes de procurar. Sem isso o portão brigaria com a própria
 * documentação — os arquivos EXPLICAM o botão que foi removido, e explicar não é
 * chamar. O `//` só conta como comentário quando não vem depois de `:` (senão
 * "https://" viraria início de comentário).
 */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

/** Todo arquivo de tela: `.tsx` sob src/app e src/components, fora de rotas de API e testes. */
function collectClientFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...collectClientFiles(full));
    } else if (entry.name.endsWith(".tsx") && !entry.name.includes(".test.")) {
      out.push(full);
    }
  }
  return out;
}

const CLIENT_FILES = [...collectClientFiles(APP_DIR), ...collectClientFiles(COMPONENTS_DIR)];

describe("caminho de recuperação de acesso — travas estruturais", () => {
  it("sanidade: a varredura achou as telas", () => {
    expect(CLIENT_FILES.length).toBeGreaterThan(50);
  });

  // ── (a) ───────────────────────────────────────────────────────────────────────
  it("nenhuma tela do navegador chama /api/admin/reset-owner", () => {
    const offenders = CLIENT_FILES.filter((f) =>
      stripComments(readFileSync(f, "utf8")).includes("/api/admin/reset-owner"),
    ).map((f) => relative(process.cwd(), f).split(sep).join("/"));

    expect(
      offenders,
      "Apagar contas de usuário é IRREVERSÍVEL e é ato de operador com credencial " +
        "(x-admin-secret + alvo + confirmação). Nenhuma tela pública pode disparar isso:\n  - " +
        offenders.join("\n  - "),
    ).toEqual([]);
  });

  // ── (b) ───────────────────────────────────────────────────────────────────────
  it("a página /recover não tem modo destrutivo", () => {
    const src = stripComments(readFileSync(RECOVER_PAGE, "utf8"));
    expect(src, "o modo ?force=true voltou").not.toMatch(/force/i);
    expect(src, "voltou a oferecer apagar usuários").not.toMatch(/apaga|resetar usu/i);
    expect(src, "voltou a pedir CONFIRMAR para uma ação destrutiva").not.toContain("CONFIRMAR");
  });

  // ── (c) ───────────────────────────────────────────────────────────────────────
  it("o login não manda quem esqueceu a senha para a página de instalação", () => {
    const src = stripComments(readFileSync(LOGIN_PAGE, "utf8"));
    expect(src, '"Esqueci minha senha" apontando para /recover é o beco sem saída de volta')
      .not.toMatch(/href=["']\/recover/);
  });

  it("o login mostra um caminho de socorro de verdade", () => {
    const src = readFileSync(LOGIN_PAGE, "utf8");
    expect(src).toContain("SupportContactBlock");
  });
});
