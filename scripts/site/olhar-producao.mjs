#!/usr/bin/env node
/**
 * OLHAR O SITE — com os próprios olhos, nos 3 tamanhos.
 *
 * ⚠️ LEIA ISTO ANTES DE APONTAR PARA foocci.com.br. Custou duas investigações.
 *
 * **O Chromium NÃO alcança a internet pública desta caixa.** Não é configuração
 * de proxy, e foram testadas todas: sem proxy, com `--proxy-server`, com
 * `--no-sandbox`, com `--ignore-certificate-errors`, e nas DUAS portas do proxy
 * (a da variável de ambiente e a que o `__agentproxy/status` declara). Todas
 * devolvem `net::ERR_CONNECTION_RESET`.
 *
 * A prova de que não é política do proxy: `recentRelayFailures` continua **vazio**
 * depois de cada tentativa — a conexão morre ANTES de chegar no relay. Enquanto
 * isso o `curl` para o mesmo endereço devolve 200 no mesmo segundo.
 *
 * Ou seja: dá para LER produção (curl, `fetch` do Node), não dá para FOTOGRAFAR.
 *
 * **O jeito certo, e não é um consolo:** subir o build local do commit que está em
 * produção e fotografar ele. O `/api/health` devolve o `commitSha`; se ele bater
 * com o `git rev-parse HEAD` da árvore que gerou o build, a foto é do mesmo
 * código. É isso que `conferirMesmoCommit()` prova ANTES de qualquer captura, e é
 * o que impede a foto de virar mentira.
 *
 * O primeiro comentário deste arquivo dizia que bastava passar o proxy ao
 * Chromium. Estava errado, e o erro sobreviveu porque ninguém tinha rodado contra
 * produção depois. Diagnóstico não conferido envelhece como verdade.
 *
 * SOMENTE LEITURA. Abre página pública, tira foto, não clica em nada que grave.
 *
 * Uso:
 *   npm run build && PORT=3333 npm run start &
 *   BASE_URL=http://localhost:3333 node scripts/site/olhar-producao.mjs
 *   BASE_URL=http://localhost:3333 node scripts/site/olhar-producao.mjs /site/precos
 */

import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const BASE = (process.env.BASE_URL || "http://localhost:3333").replace(/\/$/, "");
const SAIDA = process.env.SAIDA || "/tmp/foocci-site";
const PRODUCAO = "https://foocci.com.br";

const ehLocal = /^https?:\/\/(localhost|127\.0\.0\.1)/.test(BASE);

/** Os 3 tamanhos que o DESIGN.md exige. A maioria entra pelo celular. */
const TAMANHOS = [
  { nome: "celular", width: 375, height: 812 },
  { nome: "tablet", width: 768, height: 1024 },
  { nome: "desktop", width: 1280, height: 900 },
];

const PAGINAS = process.argv[2]
  ? [process.argv[2]]
  : [
      "/site",
      "/site/atendimento-com-ia",
      "/site/crm",
      "/site/solucoes",
      "/site/experimente",
      "/site/precos",
      "/site/demonstracao",
      "/site/sobre",
    ];

const nomeArquivo = (rota, tamanho) =>
  `${(rota.replace(/^\/site\/?/, "") || "home").replace(/\//g, "-")}-${tamanho}.png`;

const p = (t = "") => console.log(t);

/**
 * A FOTO É DO MESMO CÓDIGO QUE ESTÁ NO AR? — a pergunta que a captura sozinha
 * nunca responde, e sem a qual mostrar a imagem ao CEO é afirmar o que não se sabe.
 *
 * Guardrail 1 aplicado à ferramenta: quando não dá para conferir, o script diz
 * "não sei" em vez de assumir que bate.
 */
async function conferirMesmoCommit() {
  let local = null;
  try {
    local = execSync("git rev-parse HEAD", { encoding: "utf8" }).trim();
  } catch { /* fora de um repositório */ }

  let remoto = null;
  try {
    const r = await fetch(`${PRODUCAO}/api/health`);
    remoto = (await r.json())?.commitSha ?? null;
  } catch { /* sem alcance para o health */ }

  if (!local || !remoto) {
    p("⚠️  NÃO CONSEGUI CONFERIR se este build é o que está no ar.");
    p("    Trate as capturas como do código LOCAL, nunca como produção.");
    return false;
  }

  const bate = local === remoto;
  p(bate
    ? `✅ Mesmo commit de produção (${local.slice(0, 8)}) — a foto é do código que está no ar.`
    : `⚠️  COMMIT DIFERENTE: local ${local.slice(0, 8)} × produção ${remoto.slice(0, 8)}.\n    As capturas NÃO representam o site no ar.`);
  return bate;
}

const main = async () => {
  fs.mkdirSync(SAIDA, { recursive: true });

  if (!ehLocal) {
    p("❌ Apontar para a internet pública não funciona aqui: o Chromium não sai");
    p("   desta caixa (ERR_CONNECTION_RESET em toda configuração — ver o cabeçalho).");
    p("   Suba o build local e use BASE_URL=http://localhost:3333.");
    process.exit(1);
  }

  await conferirMesmoCommit();

  const browser = await chromium.launch();
  const feitas = [];
  const falhas = [];

  for (const tamanho of TAMANHOS) {
    const ctx = await browser.newContext({
      viewport: { width: tamanho.width, height: tamanho.height },
      deviceScaleFactor: 2,
    });
    const page = await ctx.newPage();

    for (const rota of PAGINAS) {
      const arquivo = path.join(SAIDA, nomeArquivo(rota, tamanho.nome));
      try {
        const resp = await page.goto(`${BASE}${rota}`, {
          waitUntil: "networkidle",
          timeout: 45_000,
        });
        const status = resp?.status() ?? 0;
        if (status >= 400) {
          /*
            500 AQUI QUASE SEMPRE É FALTA DE BANCO, NÃO PÁGINA QUEBRADA.

            As páginas que consultam o Postgres na renderização (`/site/demonstracao`
            é uma) explodem no build local porque esta caixa não tem `DATABASE_URL`.
            Em produção elas respondem 200 — foi conferido por `curl`.

            O aviso carrega a checagem junto (guardrail 6) para ninguém abrir a
            manhã achando que derrubou o formulário do SDR. Confirmar é uma linha,
            e a linha está escrita aqui.
          */
          const dica = status >= 500
            ? `  → antes de tratar como defeito, rode: curl -s -o /dev/null -w "%{http_code}" ${PRODUCAO}${rota}`
            : "";
          falhas.push(`${rota} @${tamanho.nome}: HTTP ${status}${dica}`);
          continue;
        }
        // Rolar até o fim e voltar: dispara o que só carrega ao aparecer, senão
        // a foto registra um site mais vazio do que ele é.
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        await page.waitForTimeout(700);
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.waitForTimeout(400);

        // Rolagem lateral é defeito, não detalhe — e não aparece na foto de página
        // inteira, justamente porque a captura estica a altura e esconde o excesso.
        const vaza = await page.evaluate(
          () => document.documentElement.scrollWidth > window.innerWidth,
        );
        if (vaza) falhas.push(`${rota} @${tamanho.nome}: ROLAGEM LATERAL`);

        await page.screenshot({ path: arquivo, fullPage: true });
        feitas.push(arquivo);
      } catch (e) {
        falhas.push(`${rota} @${tamanho.nome}: ${String(e?.message ?? e).split("\n")[0]}`);
      }
    }
    await ctx.close();
  }

  await browser.close();

  p(`\n📸 ${feitas.length} captura(s) em ${SAIDA}`);
  for (const f of feitas) p(`   · ${path.basename(f)}`);

  /* Guardrail 1: falha que não aparece vira "deu tudo certo" na leitura de quem lê. */
  if (falhas.length) {
    p(`\n⚠️  ${falhas.length} problema(s) — NÃO são páginas conferidas:`);
    for (const f of falhas) p(`   · ${f}`);
    process.exitCode = 1;
  }
};

main().catch((e) => {
  console.error(`\n❌ ${e?.message ?? e}`);
  process.exit(1);
});
