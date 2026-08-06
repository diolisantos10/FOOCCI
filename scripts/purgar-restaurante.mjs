#!/usr/bin/env node
/**
 * PURGAR UM RESTAURANTE — simulação, rede e corte, nesta ordem obrigatória.
 *
 *   MODO=simular   (padrão)  → só lê. Diz o que sairia e quantas linhas de cada tabela.
 *   MODO=exportar            → só lê. Grava a rede em arquivo local e mostra o sha256.
 *   MODO=apagar              → o caminho sem volta. Exige o sha256 da rede.
 *
 * Uso:
 *   SLUG=pizzaria-testando node scripts/purgar-restaurante.mjs
 *   SLUG=pizzaria-testando MODO=exportar node scripts/purgar-restaurante.mjs
 *   SLUG=pizzaria-testando MODO=apagar CONFIRMAR=pizzaria-testando \
 *     SHA256=<o da exportação> node scripts/purgar-restaurante.mjs
 *
 * ⚠️ ESTE SCRIPT NÃO RODA DENTRO DO GITHUB ACTIONS, e a recusa é código, não aviso.
 * O log e os artefatos deste repositório são PÚBLICOS; a exportação carrega nome,
 * telefone, endereço e conversa de cliente. Uma rede de segurança que vaza a base
 * inteira é pior que a exclusão que ela evita (guardrail 5). Quem exporta ou apaga
 * faz de uma máquina onde o arquivo fica.
 *
 * O inventário — esse sim seguro para log público — é o
 * `scripts/inventario-restaurantes.mjs`, e tem workflow próprio.
 */

import { writeFileSync } from "node:fs";

const BASE = (process.env.BASE_URL || "https://foocci.com.br").replace(/\/$/, "");
const SLUG = process.env.SLUG;
const MODO = (process.env.MODO || "simular").toLowerCase();
const CONFIRMAR = process.env.CONFIRMAR;
const SHA256 = process.env.SHA256;
const ACEITO_NF = process.env.ACEITO_PERDER_NOTA_FISCAL === "sim";
const SECRET = process.env.ADMIN_SECRET;

function fail(m) {
  console.error(`\n❌ ${m}`);
  process.exit(1);
}

/*
  A TRAVA DO AMBIENTE PÚBLICO. Vem antes de tudo — inclusive antes de validar o
  slug — porque o dano aqui não é apagar errado, é publicar.
*/
if (process.env.GITHUB_ACTIONS === "true" && MODO !== "simular") {
  fail(
    `MODO=${MODO} não roda dentro do GitHub Actions.\n` +
      "   O log e os artefatos deste repositório são públicos, e a exportação carrega\n" +
      "   dado pessoal de cliente. Rode de uma máquina sua, com ADMIN_SECRET em mãos.",
  );
}

if (!SLUG) fail("SLUG é obrigatório. Um restaurante por execução, sempre nomeado.");
if (!SECRET) fail("ADMIN_SECRET ausente do ambiente.");

const limpar = (t) => String(t ?? "").split(SECRET).join("<oculto>");
const p = (t = "") => console.log(limpar(t));

async function chamar(caminho, init = {}) {
  const r = await fetch(`${BASE}${caminho}`, {
    ...init,
    headers: { "x-admin-secret": SECRET, "Content-Type": "application/json", ...(init.headers || {}) },
  });
  const texto = await r.text();
  try {
    return { status: r.status, json: JSON.parse(texto) };
  } catch {
    return { status: r.status, json: null, texto: texto.slice(0, 300) };
  }
}

function mostrarSimulacao(d) {
  p(`\n═══ SIMULAÇÃO — ${d.slug} (${d.nome}) ═══`);
  p(`   id: ${d.restaurantId}`);
  p(`   protegido: ${d.protegido ? "SIM — este restaurante NÃO pode ser apagado" : "não"}`);
  p(`   total de linhas que sairiam: ${d.totalLinhas}`);

  const comLinhas = d.passos.filter((x) => x.linhas > 0);
  p(`\n   ── ORDEM DE EXCLUSÃO (${comLinhas.length} tabela(s) com conteúdo) ──`);
  for (const s of comLinhas) {
    const marca = s.semChaveEstrangeira ? "  ← SEM chave estrangeira: sobreviveria a um DELETE ingênuo" : "";
    p(`   ${String(s.ordem).padStart(3)}. ${s.tabela.padEnd(36)} ${String(s.linhas).padStart(8)}${marca}`);
  }

  const prof = d.profundas.filter((x) => x.linhas > 0);
  if (prof.length) {
    p(`\n   ── LEVADAS PELA CASCATA (sem restaurantId próprio) ──`);
    for (const s of prof) p(`        ${s.tabela.padEnd(36)} ${String(s.linhas).padStart(8)}   via ${s.via}`);
  }

  const sobra = d.sobra.filter((x) => x.linhas > 0);
  if (sobra.length) {
    p(`\n   ── O QUE **NÃO** SAI (fica com o vínculo desligado) ──`);
    for (const s of sobra) p(`        ${s.tabela}: ${s.linhas} linha(s)\n          ${s.motivo}`);
  }

  p(`\n   ── PORTÕES ──`);
  if (!d.bloqueios.length) p("        nenhum bloqueio: o corte passaria.");
  for (const b of d.bloqueios) p(`        ⛔ ${b.motivo}: ${b.detalhe}`);
}

const main = async () => {
  const s = await chamar(`/api/admin/restaurants/purga?slug=${encodeURIComponent(SLUG)}`);
  if (s.status === 404) {
    fail(
      `404 em /api/admin/restaurants/purga. Ou o restaurante "${SLUG}" não existe, ou a rota\n` +
        `   ainda não subiu para produção. Resposta: ${JSON.stringify(s.json ?? s.texto)}`,
    );
  }
  if (s.status !== 200) fail(`HTTP ${s.status} — ${JSON.stringify(s.json ?? s.texto)}`);
  mostrarSimulacao(s.json);

  if (MODO === "simular") {
    p("\n✅ Somente leitura. Nada foi apagado.");
    return;
  }

  if (MODO === "exportar" || MODO === "apagar") {
    p("\n⏳ Montando a rede (exportação)...");
    const e = await chamar(`/api/admin/restaurants/purga?slug=${encodeURIComponent(SLUG)}&formato=exportacao`);
    if (e.status !== 200) fail(`Exportação falhou: HTTP ${e.status} — ${JSON.stringify(e.json ?? e.texto)}`);

    const arquivo = `backup-${SLUG}-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
    writeFileSync(arquivo, JSON.stringify(e.json, null, 2));
    p(`💾 rede gravada em ${arquivo}`);
    p(`   linhas: ${e.json.totalLinhas} · bytes: ${e.json.bytes}`);
    p(`   sha256: ${e.json.sha256}`);
    p("   ⚠️  este arquivo contém DADO PESSOAL. Guarde onde dê para recuperar e não o publique.");

    if (MODO === "exportar") {
      p("\n✅ Somente leitura. Nada foi apagado.");
      return;
    }

    if (!SHA256) {
      fail(
        "MODO=apagar exige SHA256 no ambiente — o da rede que você já guardou.\n" +
          `   O da exportação recém-feita é: ${e.json.sha256}\n` +
          "   Ele é pedido de novo, à mão, de propósito: colar o sha256 é o momento em que\n" +
          "   alguém confirma que olhou o arquivo, não que ele apenas foi gerado.",
      );
    }

    const r = await chamar("/api/admin/restaurants/purga", {
      method: "POST",
      body: JSON.stringify({
        slug: SLUG,
        confirmarSlug: CONFIRMAR ?? "",
        sha256DoBackup: SHA256,
        aceitoPerderNotaFiscal: ACEITO_NF,
      }),
    });
    if (r.status !== 200) fail(`Purga recusada: HTTP ${r.status} — ${JSON.stringify(r.json ?? r.texto)}`);

    p(`\n🗑️  ${r.json.slug} apagado em ${r.json.apagadoEm}. ${r.json.totalLinhas} linha(s).`);
    for (const [t, q] of Object.entries(r.json.linhasPorTabela)) p(`   · ${t}: ${q}`);
    if (Object.keys(r.json.sobraDetachada ?? {}).length) {
      p("   ── sobrou com o vínculo desligado (exige ação humana):");
      for (const [t, q] of Object.entries(r.json.sobraDetachada)) p(`   · ${t}: ${q}`);
    }
    return;
  }

  fail(`MODO desconhecido: "${MODO}". Use simular | exportar | apagar.`);
};

main().catch((e) => fail(limpar(e?.stack ?? e?.message ?? e)));
