#!/usr/bin/env node
/**
 * Registra (ou confere) um domínio customizado no serviço do Railway.
 *
 * Por que existe: adicionar um domínio no Railway é, no painel, dois cliques —
 * mas o CEO não opera infraestrutura. Este script faz o mesmo pela API oficial,
 * usando o RAILWAY_TOKEN que já vive nos segredos do GitHub Actions (o mesmo que
 * o deploy usa). Assim o Diretor resolve domínio sem depender de humano.
 *
 * Uso (dentro do Actions, com os segredos no ambiente):
 *   RAILWAY_TOKEN=... RAILWAY_PROJECT_ID=... DOMAIN=www.foocci.com.br \
 *     node scripts/railway-custom-domain.mjs
 *
 * Variáveis opcionais:
 *   SERVICE_NAME      nome do serviço no Railway            (padrão: FOOCCI)
 *   ENVIRONMENT_NAME  nome do ambiente                      (padrão: production)
 *   TARGET_PORT       porta do container, se o Railway pedir
 *
 * É idempotente de propósito: se o domínio já existe, ele apenas reporta o
 * estado atual e sai com 0. Rodar duas vezes nunca quebra nada.
 *
 * O token NUNCA é impresso — nem em erro, nem em diagnóstico.
 */

const TOKEN = process.env.RAILWAY_TOKEN;
const PROJECT_ID = process.env.RAILWAY_PROJECT_ID;
const DOMAIN = process.env.DOMAIN;
const SERVICE_NAME = process.env.SERVICE_NAME || 'FOOCCI';
const ENVIRONMENT_NAME = process.env.ENVIRONMENT_NAME || 'production';
const TARGET_PORT = process.env.TARGET_PORT ? Number(process.env.TARGET_PORT) : undefined;

if (!TOKEN) fail('RAILWAY_TOKEN ausente no ambiente.');
if (!DOMAIN) fail('DOMAIN ausente no ambiente (ex.: www.foocci.com.br).');

/** Endpoints e formas de autenticação que o Railway aceita, em ordem de tentativa. */
const ENDPOINTS = ['https://backboard.railway.com/graphql/v2', 'https://backboard.railway.app/graphql/v2'];
const AUTH_MODES = [
  { label: 'Bearer (token de conta)', headers: { Authorization: `Bearer ${TOKEN}` } },
  { label: 'Project-Access-Token (token de projeto)', headers: { 'Project-Access-Token': TOKEN } },
];

/** Combinação endpoint+auth que funcionou; descoberta uma vez e reaproveitada. */
let wire = null;

function fail(message) {
  console.error(`\n❌ ${message}`);
  process.exit(1);
}

/** Remove qualquer eco do token de textos que vão para o log. */
function sanitize(text) {
  const s = String(text ?? '');
  return TOKEN ? s.split(TOKEN).join('<token>') : s;
}

async function callRaw(endpoint, headers, query, variables) {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify({ query, variables }),
  });
  const text = await response.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    return { httpStatus: response.status, errors: [{ message: `resposta não-JSON: ${text.slice(0, 300)}` }] };
  }
  return { httpStatus: response.status, ...body };
}

/**
 * Executa uma query GraphQL. Na primeira chamada, descobre qual endpoint e qual
 * cabeçalho de autenticação este token aceita — tokens de projeto e tokens de
 * conta usam cabeçalhos diferentes, e o script não sabe de antemão qual recebeu.
 */
async function gql(query, variables, { tolerate = false } = {}) {
  if (wire) {
    const result = await callRaw(wire.endpoint, wire.headers, query, variables);
    if (result.errors && !tolerate) {
      fail(`Railway recusou a chamada:\n${sanitize(result.errors.map((e) => e.message).join('\n'))}`);
    }
    return result;
  }

  const attempts = [];
  for (const endpoint of ENDPOINTS) {
    for (const mode of AUTH_MODES) {
      const result = await callRaw(endpoint, mode.headers, query, variables);
      if (result.data && !result.errors) {
        wire = { endpoint, headers: mode.headers, label: mode.label };
        console.log(`🔌 Conectado ao Railway — ${endpoint} via ${mode.label}.`);
        return result;
      }
      const why = result.errors ? result.errors.map((e) => e.message).join('; ') : `HTTP ${result.httpStatus}`;
      attempts.push(`   · ${endpoint} [${mode.label}] → ${sanitize(why)}`);
    }
  }
  fail(`Nenhuma combinação de endpoint/autenticação funcionou:\n${attempts.join('\n')}`);
}

/** Descobre projeto, ambiente e serviço a partir do token. */
async function resolveTarget() {
  // Caminho 1: token de projeto — ele já sabe a que projeto/ambiente pertence.
  const viaToken = await gql(
    `query { projectToken { projectId environmentId } }`,
    {},
    { tolerate: true },
  );
  const fromToken = viaToken?.data?.projectToken;

  const projectId = PROJECT_ID || fromToken?.projectId;
  if (!projectId) {
    fail('Não consegui determinar o projeto: RAILWAY_PROJECT_ID ausente e o token não é de projeto.');
  }

  const project = await gql(
    `query Project($id: String!) {
       project(id: $id) {
         name
         environments { edges { node { id name } } }
         services { edges { node { id name } } }
       }
     }`,
    { id: projectId },
  );

  const node = project?.data?.project;
  if (!node) fail('O Railway não devolveu o projeto — confira o RAILWAY_PROJECT_ID.');

  const environments = (node.environments?.edges || []).map((e) => e.node);
  const services = (node.services?.edges || []).map((e) => e.node);

  const environment =
    environments.find((e) => e.name === ENVIRONMENT_NAME) ||
    environments.find((e) => e.id === fromToken?.environmentId) ||
    (environments.length === 1 ? environments[0] : null);
  const service =
    services.find((s) => s.name === SERVICE_NAME) || (services.length === 1 ? services[0] : null);

  if (!environment) {
    fail(`Ambiente "${ENVIRONMENT_NAME}" não encontrado. Disponíveis: ${environments.map((e) => e.name).join(', ') || '(nenhum)'}`);
  }
  if (!service) {
    fail(`Serviço "${SERVICE_NAME}" não encontrado. Disponíveis: ${services.map((s) => s.name).join(', ') || '(nenhum)'}`);
  }

  console.log(`📦 Projeto: ${node.name} · ambiente: ${environment.name} · serviço: ${service.name}`);
  return { projectId, environmentId: environment.id, serviceId: service.id };
}

/** Lista os domínios customizados já cadastrados no serviço. */
async function listCustomDomains(target) {
  const result = await gql(
    `query Domains($projectId: String!, $environmentId: String!, $serviceId: String!) {
       domains(projectId: $projectId, environmentId: $environmentId, serviceId: $serviceId) {
         customDomains { id domain status { dnsRecords { hostlabel recordType requiredValue currentValue status } } }
         serviceDomains { id domain }
       }
     }`,
    target,
    { tolerate: true },
  );
  return result?.data?.domains || null;
}

function describeDomain(entry) {
  const records = entry?.status?.dnsRecords || [];
  if (!records.length) return '   (sem detalhe de DNS ainda — o Railway acabou de receber o domínio)';
  return records
    .map(
      (r) =>
        `   · ${r.recordType || 'CNAME'} ${r.hostlabel || '@'} → esperado "${r.requiredValue}" · atual "${r.currentValue ?? '—'}" · ${r.status ?? 'desconhecido'}`,
    )
    .join('\n');
}

/**
 * O Railway emite o certificado para um endereço de borda EXCLUSIVO daquele
 * domínio. Se o DNS aponta para outro endereço da Railway — o do serviço, por
 * exemplo — o navegador chega numa borda que não tem o certificado e recusa a
 * conexão, mesmo com tudo "verde" dos dois lados. Esse desencontro é silencioso
 * e já custou horas aqui: o alerta abaixo existe para nunca mais ser silencioso.
 *
 * Retorna true quando há divergência (o domínio NÃO vai funcionar como está).
 */
function alertarDivergenciaDeDns(entry) {
  const divergentes = (entry?.status?.dnsRecords || []).filter(
    (r) => r.requiredValue && r.currentValue && r.requiredValue !== r.currentValue,
  );
  if (!divergentes.length) return false;

  console.log('\n⚠️  O DNS NÃO bate com o que o Railway exige — o certificado não será emitido assim.');
  for (const r of divergentes) {
    console.log(`\n   No painel de DNS do domínio, corrija o registro:`);
    console.log(`     tipo   : ${(r.recordType || 'CNAME').replace('DNS_RECORD_TYPE_', '')}`);
    console.log(`     nome   : ${r.hostlabel || '@'}`);
    console.log(`     hoje   : ${r.currentValue}   ← errado`);
    console.log(`     deve   : ${r.requiredValue}   ← trocar para este`);
  }
  console.log('\n   Enquanto os dois valores forem diferentes, o domínio continua fora do ar.');
  return true;
}

/**
 * Lista apenas os NOMES das variáveis do serviço — nunca os valores.
 *
 * Serve para responder "existe credencial de DNS guardada em algum lugar?" sem
 * precisar pedir nada a humano. Os nomes já são públicos no `.env.example` deste
 * repositório, então imprimi-los não revela nada novo; os valores nunca saem.
 */
async function listarNomesDeVariaveis(target) {
  const result = await gql(
    `query Variables($projectId: String!, $environmentId: String!, $serviceId: String!) {
       variables(projectId: $projectId, environmentId: $environmentId, serviceId: $serviceId)
     }`,
    target,
    { tolerate: true },
  );
  const vars = result?.data?.variables;
  if (!vars) {
    console.log('\n🔑 Não consegui listar as variáveis (o token não tem esse alcance).');
    return;
  }
  const nomes = Object.keys(vars).sort();
  console.log(`\n🔑 ${nomes.length} variáveis no serviço (somente nomes):`);
  console.log(nomes.map((n) => `   · ${n}`).join('\n'));

  const dns = nomes.filter((n) => /HOSTINGER|CLOUDFLARE|DNS|DOMAIN|NAMECHEAP|GODADDY|REGISTRAR/i.test(n));
  console.log(
    dns.length
      ? `\n🎯 Candidatas a credencial de DNS: ${dns.join(', ')}`
      : '\n🎯 Nenhuma credencial de DNS guardada aqui.',
  );
}

async function main() {
  console.log(`\n🎯 Domínio alvo: ${DOMAIN}\n`);

  const target = await resolveTarget();

  if (process.env.LISTAR_VARIAVEIS === '1') {
    await listarNomesDeVariaveis(target);
  }

  const before = await listCustomDomains(target);
  if (before) {
    const nomes = (before.customDomains || []).map((d) => d.domain);
    console.log(`🌐 Domínios customizados hoje: ${nomes.length ? nomes.join(', ') : '(nenhum)'}`);
    console.log(`🚉 Domínio interno do Railway: ${(before.serviceDomains || []).map((d) => d.domain).join(', ') || '(nenhum)'}`);

    const existente = (before.customDomains || []).find((d) => d.domain === DOMAIN);
    if (existente) {
      console.log(`\n✅ "${DOMAIN}" JÁ está cadastrado neste serviço. Nada a criar.`);
      console.log(describeDomain(existente));
      alertarDivergenciaDeDns(existente);
      return;
    }
  }

  console.log(`\n➕ Cadastrando "${DOMAIN}"...`);
  const input = { domain: DOMAIN, ...target };
  if (TARGET_PORT) input.targetPort = TARGET_PORT;

  const created = await gql(
    `mutation CustomDomainCreate($input: CustomDomainCreateInput!) {
       customDomainCreate(input: $input) {
         id domain
         status { dnsRecords { hostlabel recordType requiredValue currentValue status } }
       }
     }`,
    { input },
  );

  const entry = created?.data?.customDomainCreate;
  if (!entry) fail('A mutação não devolveu o domínio criado.');

  console.log(`\n✅ "${entry.domain}" cadastrado no Railway (id ${entry.id}).`);
  console.log(describeDomain(entry));

  if (!alertarDivergenciaDeDns(entry)) {
    console.log('\nO certificado TLS é emitido automaticamente em seguida — costuma levar de 1 a 5 minutos.');
  }
}

main().catch((error) => fail(sanitize(error?.stack || error?.message || error)));
