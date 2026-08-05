#!/usr/bin/env node
/**
 * OLHAR O SITE EM PRODUÇÃO — com os próprios olhos, nos 3 tamanhos.
 *
 * Nasceu de uma cegueira minha (05/08/2026): o CEO pediu para eu conferir o site
 * página por página e o Chromium devolvia `net::ERR_CONNECTION_RESET` em tudo.
 * Eu disse a ele que não daria screenshot que eu não tirei — certo, mas o
 * diagnóstico estava incompleto: a saída da caixa NÃO está bloqueada. O `curl`
 * chega em foocci.com.br sem esforço, porque respeita `HTTPS_PROXY`.
 *
 * O Chromium não respeita. Ele precisa do proxy passado no `--proxy-server` e da
 * CA do proxy aceita — sem isso ele tenta conexão direta, que a caixa corta, e o
 * erro sai com cara de "site fora do ar". Instrumento errado, conclusão errada:
 * o mesmo padrão do acompanhamento do assistente.
 *
 * SOMENTE LEITURA. Abre página pública, tira foto, não clica em nada que grave.
 *
 * Uso:
 *   node scripts/site/olhar-producao.mjs                    # site inteiro
 *   node scripts/site/olhar-producao.mjs /site/precos       # uma página
 *   BASE_URL=http://localhost:3000 node scripts/site/...    # local
 */

import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const BASE = (process.env.BASE_URL || "https://foocci.com.br").replace(/\/$/, "");
const SAIDA = process.env.SAIDA || "/tmp/foocci-site";

/**
 * O proxy da caixa. Sem ele o Chromium não sai — e o erro que ele devolve
 * (`ERR_CONNECTION_RESET`) parece problema do site, não da ferramenta.
 * Local (`localhost`) não passa por proxy: está no `no_proxy`.
 */
const PROXY = process.env.HTTPS_PROXY || process.env.https_proxy || null;
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

const main = async () => {
  fs.mkdirSync(SAIDA, { recursive: true });

  const browser = await chromium.launch({
    args: [
      // A CA do proxy é auto-assinada para o Chromium; sem isto todo HTTPS falha
      // na validação e o sintoma é idêntico ao de rede cortada.
      ...(PROXY && !ehLocal ? ["--ignore-certificate-errors"] : []),
    ],
    proxy: PROXY && !ehLocal ? { server: PROXY } : undefined,
  });

  const feitas = [];
  const falhas = [];

  for (const tamanho of TAMANHOS) {
    const ctx = await browser.newContext({
      viewport: { width: tamanho.width, height: tamanho.height },
      deviceScaleFactor: 2,
      ignoreHTTPSErrors: true,
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
          falhas.push(`${rota} @${tamanho.nome}: HTTP ${status}`);
          continue;
        }
        // Rolar até o fim e voltar: dispara o que só carrega ao aparecer, senão
        // a foto registra um site mais vazio do que ele é.
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        await page.waitForTimeout(700);
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.waitForTimeout(400);
        await page.screenshot({ path: arquivo, fullPage: true });
        feitas.push(arquivo);
      } catch (e) {
        falhas.push(`${rota} @${tamanho.nome}: ${String(e?.message ?? e).split("\n")[0]}`);
      }
    }
    await ctx.close();
  }

  await browser.close();

  console.log(`\n📸 ${feitas.length} captura(s) em ${SAIDA}`);
  for (const f of feitas) console.log(`   · ${path.basename(f)}`);

  /* Guardrail 1: falha que não aparece vira "deu tudo certo" na leitura de quem lê. */
  if (falhas.length) {
    console.log(`\n⚠️  ${falhas.length} falha(s) — NÃO são páginas conferidas:`);
    for (const f of falhas) console.log(`   · ${f}`);
    process.exitCode = 1;
  }
};

main().catch((e) => {
  console.error(`\n❌ ${e?.message ?? e}`);
  process.exit(1);
});
