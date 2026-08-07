/**
 * leituraDeArquivos — a metade da Sala que toca o disco. NÃO toca no banco.
 *
 * Está separada de `leitura.ts` (que fala com o prisma) por um motivo prático:
 * o portão que roda contra os arquivos REAIS deste repositório precisa importar
 * este módulo sem arrastar o cliente de banco junto. Teste que precisa de prisma
 * para conferir uma regra de markdown acaba sendo mockado inteiro — e a regra
 * fica invisível.
 *
 * ── Caminho em produção (Railway) ─────────────────────────────────────────────
 * O deploy é NIXPACKS sobre o repositório inteiro (`railway.toml`), sem
 * `output: "standalone"` no `next.config.js`, e o processo sobe pela raiz via
 * `scripts/start-production.sh`. Ou seja: `process.cwd()` é a raiz do repositório
 * e tanto `.claude/agents` quanto `docs/agents` estão versionados e presentes
 * (`.gitignore` só ignora `.claude/worktrees/`). Mesmo assim NADA aqui presume
 * isso: se a pasta não estiver lá, a leitura devolve `naoVeio` com o caminho
 * tentado, e a tela mostra "não medido" com o motivo — nunca zero.
 *
 * `SALA_DOS_AGENTES_ROOT` existe como escape se um dia a imagem mudar de forma.
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { naoVeio, veio, type Amostra } from "./amostra";
import type { ArquivosDoAgenteDeDesenvolvimento } from "./montagem";

export function raizDoProjeto(env: NodeJS.ProcessEnv = process.env): string {
  const override = env.SALA_DOS_AGENTES_ROOT?.trim();
  return override && override.length > 0 ? override : process.cwd();
}

function lerArquivo(caminho: string, oQueE: string): Amostra<string> {
  if (!existsSync(caminho)) return naoVeio(`${oQueE} não existe em ${caminho}`);
  try {
    return veio(readFileSync(caminho, "utf8"));
  } catch (erro) {
    return naoVeio(`${oQueE} não pôde ser lido em ${caminho}: ${(erro as Error).message}`);
  }
}

/**
 * Enumera os agentes de desenvolvimento a partir de `.claude/agents/*.md` — que
 * é o registro real: um agente existe quando o arquivo existe. A pasta
 * `docs/agents` NÃO serve de índice, porque sala nasce sob demanda e um agente
 * recém-nomeado ainda não tem sala.
 */
export function lerAgentesDeDesenvolvimento(
  raiz: string,
): Amostra<readonly ArquivosDoAgenteDeDesenvolvimento[]> {
  const pastaDePerfis = path.join(raiz, ".claude", "agents");
  if (!existsSync(pastaDePerfis)) {
    return naoVeio(
      `a pasta de perfis não está nesta imagem (${pastaDePerfis}) — ` +
        `sem ela não dá para saber quem trabalha aqui`,
    );
  }

  let arquivos: string[];
  try {
    arquivos = readdirSync(pastaDePerfis).filter((f) => f.endsWith(".md")).sort();
  } catch (erro) {
    return naoVeio(`falha ao listar ${pastaDePerfis}: ${(erro as Error).message}`);
  }
  if (arquivos.length === 0) {
    return naoVeio(`${pastaDePerfis} existe e está vazia — nenhum perfil de agente para listar`);
  }

  const lidos = arquivos.map<ArquivosDoAgenteDeDesenvolvimento>((arquivo) => {
    const slug = arquivo.replace(/\.md$/, "");
    const sala = path.join(raiz, "docs", "agents", slug);
    return {
      slug,
      perfil: lerArquivo(path.join(pastaDePerfis, arquivo), "o perfil do agente"),
      oficina: lerArquivo(path.join(sala, "oficina.md"), "a oficina do agente"),
      vitrine: lerArquivo(path.join(sala, "vitrine.md"), "a vitrine do agente"),
    };
  });

  return veio(lidos);
}
