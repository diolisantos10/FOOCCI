#!/usr/bin/env node
/**
 * REGISTRAR O NÚMERO NO RUNTIME DA CLOUD API — a cura do `META_133010`.
 *
 * O PROBLEMA QUE ISTO RESOLVE
 * ---------------------------
 * O número oficial está na WABA e o painel mostra "conectado", mas ele nunca foi
 * registrado no runtime da Cloud API (`platform_type: NOT_APPLICABLE`). Enquanto
 * isso for verdade, TODO envio do CRM morre com `META_133010 — Account not
 * registered`. A própria Meta respondeu ao CEO, com todas as letras: *"A conta não
 * existe na API de Nuvem. Use /register API para criar uma conta primeiro."*
 *
 * A cura já existia no código (`POST /api/admin/meta/register`); faltava um jeito de
 * chamá-la sem que o segredo de administrador passasse pela mão de ninguém.
 *
 * COMO ELE ALCANÇA PRODUÇÃO SEM PEDIR SEGREDO AO CEO
 * --------------------------------------------------
 * Mesma mecânica de `scripts/meta-raiox.mjs` e `scripts/acompanhar-assistente.mjs`:
 * o `ADMIN_SECRET` vive nas variáveis do serviço `FOOCCI` no Railway, e o
 * `RAILWAY_TOKEN` vive nos segredos deste repositório — que só existem dentro do
 * GitHub Actions. O script lê o segredo pela API do Railway, usa no cabeçalho e
 * NUNCA o imprime.
 *
 * O PIN — POR QUE É DERIVADO, E COMO REPRODUZIR
 * ---------------------------------------------
 * O `/register` da Meta exige um PIN de 6 dígitos (verificação em duas etapas do
 * número). Um PIN digitado por humano teria de viajar por chat ou entrar como
 * input do workflow — e o log do Actions deste repositório é PÚBLICO. Então ele é
 * DERIVADO, de forma determinística, do próprio `ADMIN_SECRET`:
 *
 *     PIN = primeiros 6 dígitos decimais de sha256(ADMIN_SECRET + ":foocci-waba-pin-v1")
 *
 * Consequências práticas, para quem vier depois:
 *   · o PIN é o MESMO em toda rodada — registrar de novo não muda o PIN;
 *   · se a Meta pedir o PIN um dia (troca de número, recuperação), ele se
 *     reproduz rodando a mesma derivação sobre o `ADMIN_SECRET` vigente;
 *   · ⚠️ ROTACIONAR o `ADMIN_SECRET` MUDA o PIN derivado, mas NÃO muda o PIN já
 *     gravado na Meta. Se o segredo for trocado, o PIN antigo continua valendo lá
 *     — e só se recupera derivando a partir do segredo ANTIGO.
 *   · o PIN NUNCA é impresso, nem mascarado, nem parcialmente.
 *
 * ⛔ COEXISTÊNCIA — A TRAVA QUE ESTE SCRIPT NÃO ATRAVESSA
 * -------------------------------------------------------
 * A rota recusa registrar um número marcado como Coexistence, porque o `/register`
 * ARRANCA o número do celular onde o restaurante atende cliente
 * (`src/app/api/admin/meta/register/route.ts:86-91`). Existe um `force: true` que
 * pula essa recusa — este script NUNCA o envia, e não expõe opção para enviá-lo.
 * Se a resposta vier `skipped: "coexistence…"`, o script PARA e reporta: a decisão
 * passa a ser do CEO. Ordem dele, inegociável: *"não posso prejudicar o sushi"*.
 *
 * ⚠️ O LOG DO ACTIONS DESTE REPOSITÓRIO É PÚBLICO. Por isso o script projeta campos
 * escolhidos a dedo em vez de despejar a resposta crua: nada de token, nada de
 * conteúdo de conversa, nada de telefone completo.
 *
 * O QUE ELE ALTERA: apenas o registro do número no runtime da Cloud API (e a
 * reassinatura do nosso app na WABA, que a própria rota faz junto). Não envia
 * mensagem nenhuma, não cria pedido, não toca em dado de cliente.
 */

import { createHash } from "node:crypto";

const TOKEN      = process.env.RAILWAY_TOKEN;
const PROJECT_ID = process.env.RAILWAY_PROJECT_ID;
const BASE       = (process.env.BASE_URL || "https://foocci.com.br").replace(/\/$/, "");

if (!TOKEN) fail("RAILWAY_TOKEN ausente — sem ele não há como ler o ADMIN_SECRET de produção.");

function fail(m) { console.error(`\n❌ ${m}`); process.exit(1); }

/* ── Mascaramento: nenhum segredo escapa, venha de onde vier ─────────────────── */
const segredos = [TOKEN].filter(Boolean);
const guardar  = (v) => { if (v && String(v).length >= 6) segredos.push(String(v)); return v; };
const limpar   = (t) => segredos.reduce((s, seg) => s.split(seg).join("<oculto>"), String(t ?? ""));
const p        = (t = "") => console.log(limpar(t));
const jsonCurto = (v, n = 300) => limpar(JSON.stringify(v)).slice(0, n);

/** Telefone nunca sai inteiro: só os 4 últimos dígitos, que bastam para conferir qual número é. */
const mascararFone = (v) => (!v ? "—" : String(v).length <= 4 ? "••••" : `••••${String(v).slice(-4)}`);

/* ── Railway ─────────────────────────────────────────────────────────────────── */
async function railway(query, variables) {
  let ultimoErro = "sem resposta";
  for (const headers of [{ Authorization: `Bearer ${TOKEN}` }, { "Project-Access-Token": TOKEN }]) {
    const r = await fetch("https://backboard.railway.com/graphql/v2", {
      method:  "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body:    JSON.stringify({ query, variables }),
    });
    const j = await r.json().catch(() => null);
    if (j?.data && !j.errors) return j.data;
    if (j?.errors) ultimoErro = j.errors.map((e) => e.message).join("; ");
  }
  fail(`não consegui falar com o Railway: ${limpar(ultimoErro)}`);
}

/** Pega o ADMIN_SECRET das variáveis do serviço, sem imprimir. */
async function lerAdminSecret() {
  const tok = await railway(`query { projectToken { projectId environmentId } }`, {});
  const projectId = PROJECT_ID || tok?.projectToken?.projectId;
  const proj = await railway(
    `query P($id: String!) { project(id: $id) {
       environments { edges { node { id name } } } services { edges { node { id name } } } } }`,
    { id: projectId },
  );
  const env = (proj?.project?.environments?.edges || []).map((e) => e.node).find((e) => e.name === "production");
  const svc = (proj?.project?.services?.edges || []).map((e) => e.node).find((s) => s.name === "FOOCCI");
  if (!env || !svc) fail("não achei o ambiente `production` / serviço `FOOCCI` no Railway.");

  const vars = await railway(
    `query V($projectId: String!, $environmentId: String!, $serviceId: String!) {
       variables(projectId: $projectId, environmentId: $environmentId, serviceId: $serviceId) }`,
    { projectId, environmentId: env.id, serviceId: svc.id },
  );
  const v = vars?.variables || {};
  for (const k of Object.keys(v)) if (/SECRET|TOKEN|KEY|PASSWORD|PIN/i.test(k)) guardar(v[k]);
  const secret = v.ADMIN_SECRET;
  if (!secret) fail("ADMIN_SECRET não está nas variáveis do serviço FOOCCI.");
  return secret;
}

/* ── O PIN ───────────────────────────────────────────────────────────────────── */
/**
 * Deriva o PIN de 6 dígitos do ADMIN_SECRET. Determinístico e reproduzível:
 * mesma entrada, mesmo PIN, para sempre. O retorno entra na lista de mascaramento
 * antes de qualquer outra coisa acontecer — mas mesmo assim ele nunca é impresso.
 */
function derivarPin(secret) {
  const hex = createHash("sha256").update(`${secret}:foocci-waba-pin-v1`).digest("hex");
  const digitos = hex.replace(/\D/g, "");
  // Um sha256 tem ~32 dígitos decimais no hex; cair abaixo de 6 é praticamente
  // impossível, mas "praticamente" não é "nunca" — e um PIN de 5 dígitos seria
  // recusado pela rota com um erro que ninguém entenderia. O galho fecha isso.
  const pin = digitos.length >= 6
    ? digitos.slice(0, 6)
    : String(BigInt(`0x${hex}`) % 1000000n).padStart(6, "0");
  guardar(pin);
  return pin;
}

/* ── Produção ────────────────────────────────────────────────────────────────── */
async function admin(caminho, secret, init = {}) {
  const r = await fetch(`${BASE}${caminho}`, {
    ...init,
    headers: { "x-admin-secret": secret, ...(init.headers || {}) },
  });
  const texto = await r.text();
  try { return { status: r.status, json: JSON.parse(texto) }; }
  catch { return { status: r.status, json: null, texto: texto.slice(0, 200) }; }
}

/** Lê o diagnóstico e devolve as configs, ou aborta dizendo por quê. */
async function lerDiag(secret, rotulo) {
  const r = await admin("/api/admin/meta/diag", secret);
  if (r.status !== 200) {
    p(`   ❌ ${rotulo}: HTTP ${r.status} — ${jsonCurto(r.json ?? r.texto, 200)}`);
    return null;
  }
  return r.json?.data?.configs ?? r.json?.configs ?? [];
}

/** Imprime o estado de um número. Campos a dedo — nada de despejo cru. */
function mostrarConfigs(cfgs) {
  p(`   · restaurantes com configuração Meta: ${cfgs.length}`);
  for (const c of cfgs) {
    const ph = c.phone ?? {};
    p(`   ── restaurante ${c.restaurantId} · número ${mascararFone(c.displayPhoneNumber)} ──`);
    p(`      id do telefone (mascarado): ${c.phoneNumberId_masked ?? "—"}`);
    p(`      platform_type: ${ph.platform_type ?? "(a Meta não devolveu)"}   ← NOT_APPLICABLE = não registrado no runtime`);
    p(`      status na Cloud API: ${ph.status ?? "(a Meta não devolveu)"}`);
    p(`      connectionStatus (o que o banco guardou): ${c.connectionStatus ?? "—"}`);
    p(`      coexistence: ${c.coexistence === true ? "SIM — número vivo no celular" : c.coexistence === false ? "não" : "(não informado)"}`);
    p(`      nosso app assinado na WABA: ${c.ourAppSubscribed ? "sim" : "NÃO"}`);
  }
}

/** Só o que importa do platform_type, por restaurante, para comparar antes × depois. */
const plataformas = (cfgs) =>
  Object.fromEntries((cfgs ?? []).map((c) => [c.restaurantId, c.phone?.platform_type ?? "(não devolvido)"]));

/* ═══════════════════════════════════════════════════════════════════════════════ */
const main = async () => {
  const secret = await lerAdminSecret();
  p("🔑 ADMIN_SECRET lido do Railway — não é impresso, aqui nem em lugar nenhum.");
  const pin = derivarPin(secret);
  p("🔢 PIN de 6 dígitos derivado do ADMIN_SECRET — não é impresso. Reprodução: ver o cabeçalho deste arquivo.\n");

  /* ── 1. ANTES ───────────────────────────────────────────────────────────────── */
  p("═══ 1 · ANTES — como a Meta vê o número agora ═══");
  const antes = await lerDiag(secret, "diag (antes)");
  if (!antes) fail("sem a leitura de antes não dá para provar mudança nenhuma. Parando.");
  if (!antes.length) fail("nenhum restaurante com configuração Meta — não há o que registrar.");
  mostrarConfigs(antes);
  const antesMapa = plataformas(antes);

  /* ── 2. REGISTRAR ───────────────────────────────────────────────────────────── */
  p("\n═══ 2 · REGISTRAR NO RUNTIME DA CLOUD API ═══");
  p("   (sem `restaurantId`: a rota percorre TODAS as configs existentes)");
  p("   ⛔ `force` NÃO é enviado — número em coexistência é pulado de propósito.");

  const reg = await admin("/api/admin/meta/register", secret, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ pin }),
  });

  if (reg.status !== 200) {
    p(`   ❌ HTTP ${reg.status} — ${jsonCurto(reg.json ?? reg.texto, 300)}`);
    fail("o registro não foi aceito. Nada mudou.");
  }

  const dados = reg.json?.data ?? reg.json ?? {};
  const results = Array.isArray(dados.results) ? dados.results : [];
  p(`   · respostas: ${results.length}`);

  let houveCoexistencia = false;
  let houveFalha = false;
  let houveSucesso = false;

  for (const r of results) {
    p(`\n   ── restaurante ${r.restaurantId} · número ${mascararFone(r.phone)} ──`);
    if (r.skipped) {
      p(`      PULADO: ${limpar(r.skipped)}`);
      if (String(r.skipped).toLowerCase().includes("coexistence")) houveCoexistencia = true;
      continue;
    }
    p(`      registered:   ${r.registered === true ? "SIM" : "NÃO"}`);
    p(`      resubscribed: ${r.resubscribed === true ? "SIM" : "NÃO"}`);
    if (r.registered === true) houveSucesso = true;
    if (r.registered !== true) {
      houveFalha = true;
      // O erro CRU da Meta é o que importa quando falha — mascarado, mas não resumido
      // em "deu erro". Guardrail 6: o alerta carrega a própria evidência.
      p(`      registerError (texto da Meta): ${limpar(r.registerError ?? "(a rota não devolveu mensagem)")}`);
      p(`      resposta crua da Meta: ${jsonCurto(r.registerRaw, 300)}`);
    }
  }

  if (houveCoexistencia) {
    p("\n   ⛔ PARADA OBRIGATÓRIA — número em COEXISTÊNCIA.");
    p("      Esse número está vivo num aparelho, onde o restaurante atende cliente.");
    p("      Registrar arrancaria o número do celular. Este script NÃO força, por decisão");
    p("      do CEO: \"não posso prejudicar o sushi\". A saída a partir daqui é dele.");
  }

  /* ── 3. DEPOIS — a prova ────────────────────────────────────────────────────── */
  p("\n═══ 3 · DEPOIS — perguntando à Meta de novo ═══");
  p("   (sem esta segunda leitura não existe vitória: `registered: true` é o que a");
  p("    ROTA disse; `platform_type` é o que a META mostra)");
  const depois = await lerDiag(secret, "diag (depois)");
  if (!depois) {
    p("   ⚠️ não deu para reler o diagnóstico — PRECISO CONFIRMAR se mudou. Não conclua daqui.");
    return;
  }
  mostrarConfigs(depois);
  const depoisMapa = plataformas(depois);

  p("\n═══ VEREDITO — platform_type, antes × depois ═══");
  let mudouAlgum = false;
  for (const id of new Set([...Object.keys(antesMapa), ...Object.keys(depoisMapa)])) {
    const a = antesMapa[id] ?? "(ausente)";
    const d = depoisMapa[id] ?? "(ausente)";
    const mudou = a !== d;
    if (mudou) mudouAlgum = true;
    p(`   · ${id}: ${a}  →  ${d}${mudou ? "   ✅ MUDOU" : "   (igual)"}`);
  }

  p("");
  if (mudouAlgum && houveSucesso) {
    p("✅ O número saiu de NOT_APPLICABLE — o registro pegou na Meta. O `META_133010`");
    p("   deve parar nos próximos envios. Confirme no log de produção antes de anunciar.");
  } else if (houveCoexistencia) {
    p("⛔ Nada foi registrado: coexistência. Decisão do CEO, não do script.");
  } else if (houveFalha) {
    p("🔴 O registro FALHOU. O erro cru da Meta está impresso acima — é ele que manda.");
  } else {
    p("⚠️ A rota respondeu, mas o `platform_type` NÃO mudou. Isso é 'preciso confirmar',");
    p("   não é sucesso: a Meta pode levar alguns instantes, ou pode ter recusado em silêncio.");
    p("   Rode de novo antes de concluir qualquer coisa.");
  }
};

main().catch((e) => fail(limpar(e?.stack || e?.message || e)));
