/* Diagnóstico READ-ONLY da Sala Comercial.
 * Não altera leads, mensagens, toggles ou templates.
 */
const { PrismaClient } = require('@prisma/client');

const db = new PrismaClient();

function countPositional(body) {
  if (!body) return 0;
  const seen = new Set();
  for (const m of body.matchAll(/\{\{(\d+)\}\}/g)) seen.add(m[1]);
  return seen.size;
}

function countNamed(body) {
  if (!body) return 0;
  const seen = new Set();
  for (const m of body.matchAll(/\{\{([a-zA-Z_][\w]*)\}\}/g)) seen.add(m[1]);
  return seen.size;
}

(async () => {
  const candidates = await db.siteLead.findMany({
    where: {
      fonte: 'LISTA_PROSPECCAO',
      AND: [
        { mensagens: { some: { direcao: 'SAIDA', status: 'FALHOU', waMessageId: null } } },
        { mensagens: { none: { direcao: 'SAIDA', status: { in: ['ENVIADA', 'ENTREGUE', 'LIDA'] } } } },
        { mensagens: { none: { direcao: 'ENTRADA' } } },
      ],
    },
    select: {
      id: true,
      nome: true,
      restaurante: true,
      lastContactedAt: true,
      mensagens: {
        where: { direcao: 'SAIDA' },
        orderBy: { ocorreuEm: 'desc' },
        take: 5,
        select: { status: true, waMessageId: true, templateNome: true, ocorreuEm: true, erro: true },
      },
    },
    orderBy: { createdAt: 'asc' },
  });

  console.log('RESET_CANDIDATES_COUNT=' + candidates.length);
  console.log('RESET_CANDIDATES_SAMPLE=' + JSON.stringify(candidates.slice(0, 10).map((x) => ({
    id: x.id,
    nome: x.nome,
    restaurante: x.restaurante,
    lastContactedAt: x.lastContactedAt,
    templatesFalhos: x.mensagens.map((m) => ({
      templateNome: m.templateNome,
      status: m.status,
      waMessageId: m.waMessageId,
      ocorreuEm: m.ocorreuEm,
      erro: m.erro,
    })),
  }))));

  let toggles = [];
  try {
    toggles = await db.$queryRawUnsafe(`
      SELECT m."nome", m."idioma", m."situacao", m."variaveis", m."corpo",
             COALESCE(e."podeEnviar", FALSE) AS "podeEnviar"
      FROM "modelos_de_vendas" m
      LEFT JOIN "modelos_de_vendas_envio" e
        ON e."phoneNumberId" = m."phoneNumberId"
       AND e."nome" = m."nome"
       AND e."idioma" = m."idioma"
      WHERE m."situacao" = 'APPROVED'
      ORDER BY m."nome", m."idioma"
    `);
  } catch (e) {
    console.log('LOCAL_TEMPLATE_QUERY_ERROR=' + String(e && e.message ? e.message : e));
  }
  console.log('LOCAL_APPROVED_TEMPLATES=' + JSON.stringify(toggles.map((x) => ({
    nome: x.nome,
    idioma: x.idioma,
    variaveis: x.variaveis,
    podeEnviar: x.podeEnviar,
    corpo: x.corpo,
  }))));

  const wabaId = process.env.FOOCCI_SALES_WABA_ID;
  const token = process.env.FOOCCI_SALES_ACCESS_TOKEN;
  const version = process.env.META_GRAPH_VERSION || 'v21.0';

  if (!wabaId || !token) {
    console.log('META_TEMPLATE_DIAG=SKIPPED_MISSING_WABA_OR_TOKEN');
    return;
  }

  const url = `https://graph.facebook.com/${version}/${encodeURIComponent(wabaId)}/message_templates?fields=name,language,status,components&limit=200`;
  const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    const safe = json && json.error ? { code: json.error.code, type: json.error.type, message: json.error.message } : { http: response.status };
    console.log('META_TEMPLATE_DIAG_ERROR=' + JSON.stringify(safe));
    return;
  }

  const approved = (Array.isArray(json.data) ? json.data : [])
    .filter((t) => String(t.status).toUpperCase() === 'APPROVED')
    .map((t) => {
      const comps = Array.isArray(t.components) ? t.components : [];
      const body = comps.find((c) => c.type === 'BODY');
      const header = comps.find((c) => c.type === 'HEADER');
      const bodyText = body && typeof body.text === 'string' ? body.text : null;
      return {
        name: t.name,
        language: t.language,
        body: {
          text: bodyText,
          positionalVars: countPositional(bodyText),
          namedVars: countNamed(bodyText),
        },
        header: header ? { type: header.type, format: header.format || null } : null,
      };
    });

  console.log('META_APPROVED_TEMPLATE_SHAPES=' + JSON.stringify(approved));
})()
  .catch((e) => {
    console.error('DIAG_ERROR=' + String(e && e.stack ? e.stack : e));
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
