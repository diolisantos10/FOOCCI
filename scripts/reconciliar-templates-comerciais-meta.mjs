#!/usr/bin/env node

/**
 * Reconciliação pontual dos templates da conta comercial Foocci.
 *
 * Regra aprovada pelo CEO em 14/09/2026: apenas estes cinco nomes podem
 * permanecer na WABA comercial. O script é fail-closed: antes de apagar
 * qualquer coisa, exige encontrar TODOS os cinco na conta atual. Assim, uma
 * WABA errada ou incompleta não sofre exclusão.
 *
 * Este script NÃO envia mensagens e NÃO cria templates. Ele apenas lista,
 * remove nomes fora da whitelist e confere o resultado final.
 */

const AUTORIZADOS = new Set([
  "contato_comercial_inicial",
  "hello_world",
  "reativacao_sem_resposta",
  "reengajamento_cliente",
  "retomar_conversa",
]);

const token = process.env.FOOCCI_SALES_ACCESS_TOKEN?.trim();
const wabaId = process.env.FOOCCI_SALES_WABA_ID?.trim();
const graphVersion = process.env.META_GRAPH_VERSION?.trim() || "v21.0";

if (!token || !wabaId) {
  console.error("[templates-comerciais] FALHA: credenciais comerciais Meta ausentes");
  process.exit(1);
}

const endpoint = `https://graph.facebook.com/${graphVersion}/${wabaId}/message_templates`;

function mascararErro(message) {
  return String(message ?? "erro desconhecido")
    .replaceAll(token, "[TOKEN]")
    .slice(0, 1000);
}

async function listar() {
  const url = `${endpoint}?fields=name,language,status,components&limit=200`;
  const resposta = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const json = await resposta.json().catch(() => ({}));

  if (!resposta.ok) {
    throw new Error(`Meta GET ${resposta.status}: ${mascararErro(json?.error?.message)}`);
  }

  return Array.isArray(json.data) ? json.data : [];
}

function contarVariaveis(template) {
  const componentes = Array.isArray(template.components) ? template.components : [];
  const corpo = componentes.find(
    (c) => String(c?.type ?? "").toUpperCase() === "BODY",
  );
  const texto = String(corpo?.text ?? "");
  return new Set([...texto.matchAll(/\{\{(\d+)\}\}/g)].map((m) => m[1])).size;
}

function resumo(lista) {
  return lista.map((t) => (
    `${t.name}/${t.language ?? "?"}/${t.status ?? "?"}/vars=${contarVariaveis(t)}`
  ));
}

async function apagarPorNome(nome) {
  const resposta = await fetch(`${endpoint}?name=${encodeURIComponent(nome)}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  const json = await resposta.json().catch(() => ({}));

  if (!resposta.ok || json?.success === false) {
    throw new Error(
      `falha ao apagar ${nome}: HTTP ${resposta.status} ${mascararErro(json?.error?.message ?? JSON.stringify(json))}`,
    );
  }
}

async function main() {
  const antes = await listar();
  const nomesAntes = [...new Set(antes.map((t) => String(t.name)))];

  console.log("[templates-comerciais] antes:", resumo(antes).join(" | "));

  // Guarda principal: não apaga nada se a conta não for inequivocamente a
  // conta que contém os cinco templates aprovados pelo CEO.
  const faltandoAntes = [...AUTORIZADOS].filter((nome) => !nomesAntes.includes(nome));
  if (faltandoAntes.length > 0) {
    throw new Error(
      `ABORTADO sem exclusões: faltam templates autorizados na conta: ${faltandoAntes.join(", ")}`,
    );
  }

  const extras = nomesAntes.filter((nome) => !AUTORIZADOS.has(nome));
  console.log(
    "[templates-comerciais] extras a apagar:",
    extras.length > 0 ? extras.join(", ") : "nenhum",
  );

  for (const nome of extras) {
    await apagarPorNome(nome);
    console.log(`[templates-comerciais] apagado: ${nome}`);
  }

  const depois = await listar();
  const nomesDepois = [...new Set(depois.map((t) => String(t.name)))];
  const extrasDepois = nomesDepois.filter((nome) => !AUTORIZADOS.has(nome));
  const faltandoDepois = [...AUTORIZADOS].filter((nome) => !nomesDepois.includes(nome));

  console.log("[templates-comerciais] final:", resumo(depois).join(" | "));

  if (extrasDepois.length > 0 || faltandoDepois.length > 0) {
    throw new Error(
      `verificação final falhou; extras=${extrasDepois.join(",") || "nenhum"}; faltando=${faltandoDepois.join(",") || "nenhum"}`,
    );
  }

  console.log("[templates-comerciais] OK: somente os 5 modelos autorizados permanecem");
}

main().catch((erro) => {
  console.error("[templates-comerciais] FALHA:", mascararErro(erro?.message));
  process.exit(1);
});
