/*
 * ─────────────────────────────────────────────────────────────────────────────
 * GERADOR DO ESPELHO DA DOUTRINA
 *
 * Lê um clone local do `dioli-brain-kit` e reescreve `docs/kit/` deste
 * repositório. Não fala com a rede: quem clona é o workflow (ou você, à mão).
 *
 * Uso:
 *   git clone --depth 1 https://github.com/diolisantos10/dioli-brain-kit.git /tmp/kit
 *   KIT_DIR=/tmp/kit npx ts-node --project tsconfig.scripts.json scripts/espelhar-kit.ts
 *
 * ⚠️ Este arquivo mora em `scripts/`, que o `tsconfig.json` EXCLUI — nada aqui é
 * conferido por `npm run type-check`. Por isso ele é deliberadamente burro: git,
 * disco e nada mais. Toda decisão (o que espelhar, qual carimbo, quando renovar,
 * quando abortar) vive em `src/services/doutrina/kitEspelho.ts`, que é
 * type-checked e coberto por teste.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";

import {
  ARQUIVOS_DE_SERVICO,
  CAMINHO_DO_MANIFESTO,
  KIT_REPO,
  PASTA_DO_ESPELHO,
  lerManifesto,
  planejarEspelho,
  type ArquivoDoKit,
  type ManifestoDoEspelho,
} from "../src/services/doutrina/kitEspelho";

const RAIZ_DO_REPO = resolve(__dirname, "..");
const KIT_DIR = resolve(process.env.KIT_DIR ?? "/tmp/dioli-brain-kit");

/**
 * O que se espelha. Lista explícita, nunca "tudo que achar": um arquivo novo e
 * inesperado no kit (um `.env.example`, um dump) não deve entrar em `docs/`
 * sozinho.
 */
function eDoutrina(caminhoRelativo: string): boolean {
  const p = caminhoRelativo.split(sep).join("/");
  if (p === "CLAUDE.md") return true;
  if (p === "casos/foocci.md") return true;
  if (p.startsWith("docs/") && p.endsWith(".md")) return true;
  return false;
}

function listarArquivos(dir: string, out: string[] = []): string[] {
  for (const entrada of readdirSync(dir, { withFileTypes: true })) {
    if (entrada.name === ".git" || entrada.name === "node_modules") continue;
    const cheio = join(dir, entrada.name);
    if (entrada.isDirectory()) listarArquivos(cheio, out);
    else out.push(cheio);
  }
  return out;
}

function git(...args: string[]): string {
  return execFileSync("git", ["-C", KIT_DIR, ...args], { encoding: "utf8" }).trim();
}

function main(): void {
  if (!existsSync(KIT_DIR)) {
    throw new Error(
      `Clone do kit não encontrado em ${KIT_DIR}. Defina KIT_DIR ou clone ` +
        `https://github.com/${KIT_REPO}.git antes de rodar.`,
    );
  }

  const kitCommit = git("rev-parse", "HEAD");
  const kitCommitData = git("log", "-1", "--format=%cI");

  const arquivosDoKit: ArquivoDoKit[] = listarArquivos(KIT_DIR)
    .map((cheio) => relative(KIT_DIR, cheio).split(sep).join("/"))
    .filter(eDoutrina)
    .map((origem) => ({
      origem,
      conteudo: readFileSync(join(KIT_DIR, origem), "utf8"),
    }));

  const caminhoManifesto = join(RAIZ_DO_REPO, CAMINHO_DO_MANIFESTO);
  const brutoAnterior = existsSync(caminhoManifesto)
    ? readFileSync(caminhoManifesto, "utf8")
    : null;
  const leitura = lerManifesto(brutoAnterior);
  const manifestoAnterior: ManifestoDoEspelho | null = leitura.ok ? leitura.manifesto : null;

  // `planejarEspelho` LANÇA se vierem menos arquivos que o piso. Deixamos a
  // exceção subir: um clone vazio precisa derrubar o robô, não escrever nada.
  const plano = planejarEspelho({
    arquivosDoKit,
    kitCommit,
    kitCommitData,
    manifestoAnterior,
    agora: new Date(),
  });

  const pastaEspelho = join(RAIZ_DO_REPO, PASTA_DO_ESPELHO);

  // Só a partir daqui se toca no disco — depois de todas as travas.
  if (existsSync(pastaEspelho)) {
    const declarados = new Set(plano.arquivos.map((a) => a.destino));
    for (const cheio of listarArquivos(pastaEspelho)) {
      const rel = relative(RAIZ_DO_REPO, cheio).split(sep).join("/");
      const nome = rel.slice(PASTA_DO_ESPELHO.length + 1);
      if (ARQUIVOS_DE_SERVICO.has(nome)) continue;
      if (declarados.has(rel)) continue;
      rmSync(cheio);
      console.log(`  − removido (não existe mais no kit ou era intruso): ${rel}`);
    }
  }

  for (const arq of plano.arquivos) {
    const cheio = join(RAIZ_DO_REPO, arq.destino);
    mkdirSync(dirname(cheio), { recursive: true });
    writeFileSync(cheio, arq.conteudo, "utf8");
  }

  writeFileSync(
    join(RAIZ_DO_REPO, CAMINHO_DO_MANIFESTO),
    `${JSON.stringify(plano.manifesto, null, 2)}\n`,
    "utf8",
  );
  writeFileSync(join(pastaEspelho, "README.md"), plano.readme, "utf8");

  console.log(`Kit: ${KIT_REPO} @ ${kitCommit.slice(0, 7)} (${kitCommitData})`);
  console.log(`Documentos espelhados: ${plano.arquivos.length}`);
  console.log(`Conteúdo mudou: ${plano.mudouConteudo ? "SIM" : "não"}`);
  console.log(`Carimbo renovado por cadência: ${plano.renovouCarimbo ? "SIM" : "não"}`);
  console.log(`verificadoEm: ${plano.manifesto.verificadoEm}`);

  const saida = process.env.GITHUB_OUTPUT;
  if (saida) {
    writeFileSync(
      saida,
      [
        `kit_commit=${kitCommit}`,
        `kit_commit_curto=${kitCommit.slice(0, 7)}`,
        `mudou_conteudo=${plano.mudouConteudo}`,
        `renovou_carimbo=${plano.renovouCarimbo}`,
        `arquivos=${plano.arquivos.length}`,
        "",
      ].join("\n"),
      { flag: "a" },
    );
  }
}

main();
