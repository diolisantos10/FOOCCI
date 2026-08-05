/**
 * capturar-produto — fotografa o Foocci de verdade para o site comercial.
 *
 * O CEO olhou o site e disse: "está só com texto, botão e detalhe gráfico". Seis
 * das oito páginas abriam sem uma única imagem. A resposta desta casa não é banco
 * de imagens: é fotografar o produto rodando. Toda imagem que este roteiro produz
 * é uma tela real do Foocci na padaria de demonstração (`foocci-bakery`) — a
 * mesma que o visitante pode abrir em `/site/experimente`.
 *
 * Isso tem uma consequência boa e uma obrigação:
 *   • **Boa:** não existe distância entre a foto e o produto. Nada aqui promete
 *     tela que não existe (guardrail 7 aplicado à imagem).
 *   • **Obrigação:** mudou a tela, a foto envelheceu. Rode este roteiro de novo.
 *
 * Os cinco destinos estão declarados em `src/components/marketing/siteAssets.ts`
 * (constante `PRODUCT_SHOTS`). Slot vazio degrada sozinho pelo `hasAsset()` — se
 * uma captura falhar, o site não quebra, só volta ao visual anterior.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 *  COMO RODAR — do zero, numa máquina limpa
 * ══════════════════════════════════════════════════════════════════════════════
 *
 *  1. Banco local de pé:
 *       service postgresql start
 *       cp .env.example .env     # e aponte DATABASE_URL para o Postgres local
 *       npx prisma generate && npx prisma db push
 *     (`db push`, não `migrate deploy`: as migrations históricas quebram em banco
 *      virgem — ver a vitrine do `interface`.)
 *
 *  2. A padaria de demonstração:
 *       npm run bakery:seed
 *
 *  3. Senha do dono, no `.env` (o seed usa esta variável; se o dono já existia, o
 *     passo 5 realinha a senha para ela):
 *       FOOCCI_BAKERY_OWNER_PASSWORD="padaria1234"
 *
 *  4. O app, numa porta livre (a 3000 costuma estar ocupada):
 *       PORT=3100 npm run dev
 *
 *  5. A captura:
 *       PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers \
 *         node scripts/site/capturar-produto.mjs --dados --fotos
 *
 * ─── As opções ────────────────────────────────────────────────────────────────
 *   --dados        enche a padaria (clientes, pedidos, campanhas) antes de fotografar.
 *                  Sem isso a foto é de painel vazio — e painel vazio não vende.
 *   --fotos        espelha as fotos do cardápio que a padaria já tem em produção.
 *                  Necessário em máquina sem OPENAI_API_KEY (as fotos nascem pagas).
 *   --porta=3100   porta do servidor de desenvolvimento.
 *   --so=lojaCelular,painelCrm   refaz só alguns slots.
 *   --auditoria    além dos slots, guarda o cardápio em 375/768/1280 para conferência.
 *
 * ─── As travas ────────────────────────────────────────────────────────────────
 *   • Recusa DATABASE_URL que não seja local. Este roteiro escreve pedidos
 *     fictícios: apontar para produção seria sujar a base de clientes de verdade.
 *   • Só mexe em restaurante com `isDemo = true`.
 *   • O horário da padaria é aberto TEMPORARIAMENTE (a loja pausa pedidos fora do
 *     expediente e a foto sairia com tarja de "fechado") e restaurado no `finally`
 *     — inclusive se a captura estourar no meio.
 */

import fs from "fs";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";
import { chromium } from "playwright";
import sharp from "sharp";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { encher, horaDaFoto } from "./dados-demonstracao.mjs";
import { espelharFotos } from "./fotos-do-cardapio.mjs";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const DESTINO = path.join(RAIZ, "public/brand/foocci/produto");
/** Conferência de responsivo: material de trabalho, fora do repositório de propósito. */
const AUDITORIA = path.join(os.tmpdir(), "foocci-captura-auditoria");

const SLUG = "foocci-bakery";
const EMAIL_DONO = `owner@${SLUG}.example.com`;
const SENHA = process.env.FOOCCI_BAKERY_OWNER_PASSWORD || "padaria1234";

/** Teto de peso por arquivo. O dono de restaurante abre o site no 4G da loja. */
const TETO_KB = 400;

const CELULAR = { width: 390, height: 844 };
const DESKTOP = { width: 1440, height: 900 };

/* ──────────────────────────── os cinco destinos ──────────────────────────── */

const SLOTS = {
  lojaCelular: "loja-cardapio-celular.png",
  atendimentoCelular: "atendimento-conversa-celular.png",
  painelPedidos: "painel-pedidos-desktop.png",
  painelCrm: "painel-crm-desktop.png",
  painelResultado: "painel-resultado-desktop.png",
};

/** Telefones do elenco fictício — clientes que `dados-demonstracao` já criou. */
const TELEFONE_VITRINE = "11900001000";
const TELEFONE_CONVERSA = "11900001011";
/** A pergunta da foto do atendimento. Humana, específica, do jeito que chega. */
const PERGUNTA = "Quero um bolo pro aniversário da minha filha";

/* ─────────────────────────────── ferramentas ─────────────────────────────── */

const prisma = new PrismaClient();
const args = process.argv.slice(2);
const opcao = (nome, padrao) => {
  const a = args.find((x) => x.startsWith(`--${nome}=`));
  return a ? a.split("=").slice(1).join("=") : padrao;
};
const PORTA = opcao("porta", "3100");
const BASE = `http://localhost:${PORTA}`;
const SOMENTE = (opcao("so", "") || "").split(",").filter(Boolean);
const querSlot = (k) => SOMENTE.length === 0 || SOMENTE.includes(k);

/** Recusa banco que não seja local. Ver "As travas" no cabeçalho. */
function exigirBancoLocal() {
  const url = process.env.DATABASE_URL ?? "";
  if (!/@(localhost|127\.0\.0\.1|\[::1\])[:/]/.test(url)) {
    throw new Error(
      "RECUSADO: DATABASE_URL não aponta para um banco local. Este roteiro escreve " +
        "pedidos e clientes fictícios — rodar contra produção sujaria a base real.",
    );
  }
}

/** O servidor precisa estar de pé ANTES: sem ele o erro sai como timeout do browser. */
async function exigirServidor() {
  try {
    const r = await fetch(`${BASE}/api/health`);
    if (!r.ok) throw new Error(`status ${r.status}`);
  } catch (e) {
    throw new Error(
      `Não achei o app em ${BASE} (${e.message}). Suba com \`PORT=${PORTA} npm run dev\` ` +
        `ou aponte a porta certa com --porta=NNNN.`,
    );
  }
}

/**
 * Abre o expediente da padaria e devolve a função que restaura o que estava lá.
 * Fora do horário a loja pausa o envio de pedido e estampa uma tarja amarela de
 * "estamos fechados" — verdadeira, mas não é o que o site precisa mostrar.
 *
 * O relógio NÃO se resolve aqui, e a tentativa de resolver custou uma volta:
 * alinhar `Restaurant.timezone` ao fuso da máquina não muda nada, porque o painel
 * de resultado fixa `timeZone: "America/Sao_Paulo"` no código e nunca lê a
 * coluna. Quem se ajusta é o dado — `dados-demonstracao.mjs` nasce todo em hora
 * de parede de São Paulo.
 */
async function abrirExpediente(restaurantId) {
  const antes = await prisma.businessHours.findMany({
    where: { restaurantId },
    select: { id: true, isOpen: true, openTime: true, closeTime: true, periodsJson: true },
  });
  await prisma.businessHours.updateMany({
    where: { restaurantId },
    data: { isOpen: true, openTime: "00:00", closeTime: "23:59", periodsJson: [{ open: "00:00", close: "23:59" }] },
  });
  return async () => {
    for (const h of antes) {
      await prisma.businessHours.update({
        where: { id: h.id },
        data: {
          isOpen: h.isOpen,
          openTime: h.openTime,
          closeTime: h.closeTime,
          periodsJson: h.periodsJson ?? undefined,
        },
      });
    }
  };
}

/**
 * Realinha a senha do dono da vitrine. O seed nunca troca a senha de um dono que
 * já existe (e faz muito bem), então numa máquina que já rodou o seed antes a
 * senha é desconhecida e o login da captura não passaria.
 */
async function realinharSenhaDoDono(restaurantId) {
  const dono = await prisma.user.findFirst({
    where: { restaurantId, email: EMAIL_DONO },
    select: { id: true },
  });
  if (!dono) throw new Error(`O dono ${EMAIL_DONO} não existe. Rode \`npm run bakery:seed\`.`);
  await prisma.user.update({ where: { id: dono.id }, data: { password: await bcrypt.hash(SENHA, 10) } });
}

/** O indicador de erro do Next em desenvolvimento não pode aparecer na foto. */
const SEM_ENFEITE_DE_DEV = "nextjs-portal{display:none!important}";
const limpar = (p) => p.addStyleTag({ content: SEM_ENFEITE_DE_DEV }).catch(() => {});

/**
 * Guarda a imagem dentro do teto de peso.
 *
 * Captura de interface é quase toda cor chapada: quantizar a paleta corta o
 * arquivo à metade sem borrar texto. Quando não basta (as telas da loja têm foto
 * de comida), desce a escala em degraus. Cada degrau é registrado no resumo —
 * peso é decisão de produto, não detalhe escondido.
 */
async function guardarLeve(buffer, destino, largura) {
  const degraus = [
    { escala: 1, cores: 256 },
    { escala: 1, cores: 128 },
    { escala: 0.8, cores: 128 },
    { escala: 0.7, cores: 128 },
    { escala: 0.6, cores: 96 },
  ];
  let melhor = null;
  for (const d of degraus) {
    let img = sharp(buffer);
    if (d.escala !== 1) img = img.resize(Math.round(largura * d.escala));
    const saida = await img.png({ palette: true, colors: d.cores, effort: 9 }).toBuffer();
    melhor = { saida, ...d };
    if (saida.length <= TETO_KB * 1024) break;
  }
  fs.writeFileSync(destino, melhor.saida);
  return { kb: Math.round(melhor.saida.length / 1024), escala: melhor.escala, cores: melhor.cores };
}

/* ────────────────────────────── as cinco fotos ───────────────────────────── */

/** Identificação da loja: o cardápio só abre depois de dizer quem é o cliente. */
async function identificar(p, telefone) {
  const campo = p.locator('input[placeholder*="99999"]').first();
  if (await campo.count()) {
    await campo.fill(telefone);
    await p.waitForTimeout(600);
    await p.getByRole("button", { name: /Continuar/i }).first().click();
    await p.waitForTimeout(8000);
  }
  const nome = p.locator('input[placeholder*="João"]').first();
  if (await nome.count()) {
    throw new Error(
      `A loja não reconheceu o telefone ${telefone} — o elenco fictício não está no banco. ` +
        `Rode com --dados.`,
    );
  }
}

async function fotografarLoja(ctx) {
  const p = await ctx.newPage();
  await p.goto(`${BASE}/pedido/${SLUG}?modo=loja`, { waitUntil: "networkidle", timeout: 120000 });
  await p.waitForTimeout(3000);
  await identificar(p, TELEFONE_VITRINE);
  // As fotos do cardápio são `loading="lazy"`: sem rolar, a captura pega o card
  // cinza. Rola só até um pouco além da dobra e volta — rolar até o FIM faz a
  // barra de categorias acompanhar e a foto sai com "Da Nossa Despensa" aceso
  // sobre a seção "Padaria". Duas telas bastam para acordar o que aparece.
  await p.evaluate(() => window.scrollTo(0, 1800));
  await p.waitForTimeout(2500);
  await p.evaluate(() => window.scrollTo(0, 0));
  await p.waitForTimeout(3500);
  await limpar(p);
  const buf = await p.screenshot();
  await p.close();
  return buf;
}

async function fotografarAtendimento(ctx) {
  const p = await ctx.newPage();
  await p.goto(`${BASE}/pedido/${SLUG}`, { waitUntil: "networkidle", timeout: 120000 });
  await p.waitForTimeout(3000);
  await identificar(p, TELEFONE_CONVERSA);
  const campo = p.locator('input[placeholder*="sugest"], textarea[placeholder*="sugest"]').first();
  await campo.waitFor({ timeout: 30000 });
  await campo.fill(PERGUNTA);
  await p.waitForTimeout(400);
  await p.keyboard.press("Enter");
  // A resposta traz vitrine de produtos; espera o carrossel pintar, não só o texto.
  await p.waitForTimeout(18000);
  await limpar(p);
  const buf = await p.screenshot();
  await p.close();
  return buf;
}

async function entrarNoPainel(ctx) {
  const p = await ctx.newPage();
  await p.goto(`${BASE}/login`, { waitUntil: "networkidle", timeout: 120000 });
  await p.fill('input[type="email"]', EMAIL_DONO);
  await p.fill('input[type="password"]', SENHA);
  await p.click('button[type="submit"]');
  await p.waitForTimeout(10000);
  if (p.url().includes("/login")) {
    throw new Error(`O login do dono não passou (${EMAIL_DONO}). Confira FOOCCI_BAKERY_OWNER_PASSWORD.`);
  }
  return p;
}

/**
 * Painel de pedidos.
 *
 * Uma armadilha que custou duas voltas, registrada aqui para ninguém repetir: o
 * cartão "Total hoje" conta os pedidos CARREGADOS (`/api/orders?limit=100`), não
 * os de hoje — e os campos de data ao lado do botão "Filtrar" são decorativos
 * (o botão não tem `onClick` e `dateFrom`/`dateTo` nunca chegam à consulta).
 * Preencher aquelas datas na captura só produziria uma foto que ENCENA um filtro
 * que não existe.
 *
 * A saída não é maquiar a tela: é fazer o número ser verdade. Por isso a padaria
 * de demonstração tem movimento de padaria movimentada de verdade (ver
 * `dados-demonstracao.mjs`) — com ~100 pedidos no dia, o que a tela mostra é o
 * que o dia tem. Os dois defeitos do painel continuam sendo defeitos e estão
 * registrados; a captura apenas se recusa a propagá-los.
 */
async function fotografarPedidos(p) {
  await p.goto(`${BASE}/orders`, { waitUntil: "networkidle", timeout: 150000 });
  await p.waitForTimeout(9000);
  await limpar(p);
  return p.screenshot();
}

async function fotografarCrm(p) {
  await p.goto(`${BASE}/crm`, { waitUntil: "networkidle", timeout: 150000 });
  await p.waitForTimeout(7000);
  // "Hoje" mostra só o que aconteceu nas últimas horas — a semana é o recorte em
  // que uma campanha de padaria já tem retorno para mostrar.
  await p.getByRole("button", { name: /Últimos 7 dias/i }).first().click();
  await p.waitForTimeout(8000);
  await limpar(p);
  return p.screenshot();
}

/**
 * A visão de resultado, no recorte **"Ontem"**.
 *
 * Não é preferência estética: é o único período que está COMPLETO a qualquer
 * hora em que a captura rodar. "Hoje" e "7 dias" terminam no dia corrente, e o
 * dia corrente é parcial — se a captura roda de madrugada (o normal num
 * servidor), a última barra do gráfico é um toco e os comparativos aparecem
 * negativos. A foto diria que a padaria despencou, o que é falso.
 *
 * "Ontem" ainda é o recorte mais verdadeiro para o que o slot promete: o dono
 * chega de manhã e a primeira coisa que ele olha é o fechamento do dia anterior.
 */
async function fotografarResultado(p) {
  await p.goto(`${BASE}/dashboard`, { waitUntil: "networkidle", timeout: 150000 });
  await p.waitForTimeout(7000);
  await p.getByRole("button", { name: "Ontem", exact: true }).first().click();
  await p.waitForTimeout(8000);
  await limpar(p);
  return p.screenshot();
}

/** Conferência de responsivo: o cardápio nos três tamanhos da casa. */
async function auditarResponsivo(browser) {
  fs.mkdirSync(AUDITORIA, { recursive: true });
  for (const [nome, largura] of [["375", 375], ["768", 768], ["1280", 1280]]) {
    const ctx = await browser.newContext({
      viewport: { width: largura, height: largura < 700 ? 812 : 900 },
      deviceScaleFactor: 1,
      isMobile: largura < 700,
      hasTouch: largura < 700,
    });
    const p = await ctx.newPage();
    await p.goto(`${BASE}/pedido/${SLUG}?modo=loja`, { waitUntil: "networkidle", timeout: 120000 });
    await p.waitForTimeout(3000);
    await identificar(p, TELEFONE_VITRINE);
    await p.waitForTimeout(4000);
    await limpar(p);
    const rolagem = await p.evaluate(() => ({
      documento: document.documentElement.scrollWidth,
      janela: window.innerWidth,
    }));
    fs.writeFileSync(path.join(AUDITORIA, `cardapio-${nome}.png`), await p.screenshot());
    console.log(
      `    ${nome}px — scrollWidth ${rolagem.documento} (janela ${rolagem.janela})` +
        `${rolagem.documento > rolagem.janela ? "  ⚠ ROLAGEM HORIZONTAL" : "  ok"}`,
    );
    await ctx.close();
  }
}

/* ───────────────────────────────── o roteiro ─────────────────────────────── */

async function main() {
  console.log("\n📸  Foocci — fotografando o produto para o site comercial\n");
  exigirBancoLocal();
  await exigirServidor();

  const restaurante = await prisma.restaurant.findUnique({
    where: { slug: SLUG },
    select: { id: true, name: true, isDemo: true },
  });
  if (!restaurante) throw new Error(`A padaria "${SLUG}" não existe. Rode \`npm run bakery:seed\`.`);
  if (!restaurante.isDemo) throw new Error(`RECUSADO: "${SLUG}" não está marcado como demonstração.`);

  if (args.includes("--fotos")) {
    console.log("  · espelhando as fotos do cardápio de produção…");
    const r = await espelharFotos();
    console.log(`    ${r.comFoto}/${r.itens} itens com foto`);
  }
  if (args.includes("--dados")) {
    console.log("  · enchendo a padaria (clientes, pedidos, campanhas)…");
    const r = await encher();
    console.log(
      `    ${r.clientes} clientes · ${r.pedidosHoje} pedidos hoje (${r.filaViva} na fila) · ` +
        `${r.pedidosHistoricos} no histórico · ${r.campanhas} campanhas`,
    );
  }

  await realinharSenhaDoDono(restaurante.id);
  const desfazerPreparo = await abrirExpediente(restaurante.id);

  fs.mkdirSync(DESTINO, { recursive: true });
  const browser = await chromium.launch();
  const resumo = [];

  try {
    const celular = await browser.newContext({
      viewport: CELULAR,
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
    });
    // A hora das bolhas de conversa é escrita pelo NAVEGADOR, não pelo banco: sem
    // relógio virtual a foto do atendimento marcava 04:46 (a hora real do
    // servidor de captura) enquanto o painel, alimentado pelos dados ancorados,
    // marcava 13:20. Duas fotos do mesmo produto em horas diferentes é o tipo de
    // detalhe que faz o material parecer montado. Aqui as duas contam a mesma hora.
    await celular.clock.install({ time: horaDaFoto() });
    await celular.clock.resume();
    const desktop = await browser.newContext({ viewport: DESKTOP, deviceScaleFactor: 2 });

    const registrar = async (chave, buffer, largura) => {
      const destino = path.join(DESTINO, SLOTS[chave]);
      const r = await guardarLeve(buffer, destino, largura);
      resumo.push({ chave, arquivo: SLOTS[chave], ...r });
      console.log(`  ✓ ${SLOTS[chave]} — ${r.kb} KB${r.escala !== 1 ? ` (escala ${r.escala})` : ""}`);
    };

    if (querSlot("lojaCelular")) {
      await registrar("lojaCelular", await fotografarLoja(celular), CELULAR.width * 2);
    }
    if (querSlot("atendimentoCelular")) {
      await registrar("atendimentoCelular", await fotografarAtendimento(celular), CELULAR.width * 2);
    }

    const precisaPainel = ["painelPedidos", "painelCrm", "painelResultado"].some(querSlot);
    if (precisaPainel) {
      const p = await entrarNoPainel(desktop);
      if (querSlot("painelPedidos")) {
        await registrar("painelPedidos", await fotografarPedidos(p), DESKTOP.width * 2);
      }
      if (querSlot("painelCrm")) {
        await registrar("painelCrm", await fotografarCrm(p), DESKTOP.width * 2);
      }
      if (querSlot("painelResultado")) {
        await registrar("painelResultado", await fotografarResultado(p), DESKTOP.width * 2);
      }
      await p.close();
    }

    if (args.includes("--auditoria")) {
      console.log(`\n  · conferência de responsivo do cardápio (em ${AUDITORIA}):`);
      await auditarResponsivo(browser);
    }
  } finally {
    await browser.close();
    await desfazerPreparo();
    console.log("\n  · horário da padaria restaurado.");
  }

  const total = resumo.reduce((s, r) => s + r.kb, 0);
  console.log(`\n  ${resumo.length} imagens · ${total} KB no total · teto de ${TETO_KB} KB por arquivo`);
  const estouradas = resumo.filter((r) => r.kb > TETO_KB);
  if (estouradas.length) {
    // Guardrail 6: o alerta carrega a evidência.
    console.log(`  ⚠ acima do teto: ${estouradas.map((r) => `${r.arquivo} (${r.kb} KB)`).join(", ")}`);
    process.exitCode = 1;
  }
  console.log("");
}

main()
  .catch((err) => {
    console.error(`\n✗ ${err.message}\n`);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
