/*
 * Reenvio seguro das abordagens frias recusadas pela Meta com #132012.
 *
 * Regras:
 * - NÃO apaga histórico antigo;
 * - só seleciona lead de LISTA_PROSPECCAO com saída FALHOU sem waMessageId;
 * - exclui qualquer lead que já tenha saída ENVIADA/ENTREGUE/LIDA ou entrada;
 * - respeita opt-out;
 * - valida o template AO VIVO na Meta: APPROVED, BODY posicional com 2 vars e HEADER IMAGE;
 * - cria uma NOVA linha de mensagem para auditoria;
 * - só atualiza lastContactedAt após a Meta aceitar e devolver wamid;
 * - RETRY_LIMIT controla quantos enviar; padrão = 1.
 */
const { PrismaClient } = require('@prisma/client');

const db = new PrismaClient();
const graphVersion = process.env.META_GRAPH_VERSION || 'v21.0';
const wabaId = process.env.FOOCCI_SALES_WABA_ID;
const phoneNumberId = process.env.FOOCCI_SALES_PHONE_NUMBER_ID;
const token = process.env.FOOCCI_SALES_ACCESS_TOKEN;
const sendEnabled = String(process.env.FOOCCI_SDR_SEND_ENABLED || '').toLowerCase() === 'true';
const headerImage = (process.env.FOOCCI_SALES_TEMPLATE_HEADER_IMAGE_URL || '').trim();
const limit = Math.max(1, Math.min(Number(process.env.RETRY_LIMIT || '1') || 1, 50));

function digits(raw) {
  return String(raw || '').replace(/\D/g, '');
}

function render(body, params) {
  return String(body || '').replace(/\{\{(\d+)\}\}/g, (_, n) => params[Number(n) - 1] || `{{${n}}}`);
}

function countPositional(body) {
  const seen = new Set();
  for (const m of String(body || '').matchAll(/\{\{(\d+)\}\}/g)) seen.add(m[1]);
  return seen.size;
}

async function loadMetaTemplates() {
  const url = `https://graph.facebook.com/${graphVersion}/${encodeURIComponent(wabaId)}/message_templates?fields=name,language,status,components&limit=200`;
  const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`Falha ao consultar templates na Meta: ${j?.error?.code || r.status} ${j?.error?.message || ''}`);
  const map = new Map();
  for (const t of Array.isArray(j.data) ? j.data : []) {
    if (String(t.status).toUpperCase() !== 'APPROVED') continue;
    const comps = Array.isArray(t.components) ? t.components : [];
    const body = comps.find((c) => c.type === 'BODY');
    const header = comps.find((c) => c.type === 'HEADER');
    map.set(`${t.name}\u0000${t.language}`, {
      name: t.name,
      language: t.language,
      body: body?.text || '',
      vars: countPositional(body?.text || ''),
      headerFormat: header?.format || null,
    });
  }
  return map;
}

async function candidates() {
  return db.siteLead.findMany({
    where: {
      fonte: 'LISTA_PROSPECCAO',
      optOutAt: null,
      AND: [
        { mensagens: { some: { direcao: 'SAIDA', status: 'FALHOU', waMessageId: null, templateNome: { not: null } } } },
        { mensagens: { none: { direcao: 'SAIDA', status: { in: ['ENVIADA', 'ENTREGUE', 'LIDA'] } } } },
        { mensagens: { none: { direcao: 'ENTRADA' } } },
      ],
    },
    orderBy: { createdAt: 'asc' },
    take: limit,
    select: {
      id: true,
      nome: true,
      restaurante: true,
      whatsapp: true,
      optOutAt: true,
      mensagens: {
        where: { direcao: 'SAIDA', status: 'FALHOU', waMessageId: null, templateNome: { not: null } },
        orderBy: { ocorreuEm: 'desc' },
        take: 1,
        select: {
          id: true,
          templateNome: true,
          autor: true,
          autorUserId: true,
          papelDoAgente: true,
          origemDaFala: true,
        },
      },
      itensProspeccao: {
        orderBy: { criadoEm: 'desc' },
        take: 1,
        select: { lote: { select: { proveniencia: true } } },
      },
    },
  });
}

async function sendOne(lead, templates) {
  // Reconfere imediatamente antes de enviar: evita corrida com atendimento real.
  const fresh = await db.siteLead.findUnique({
    where: { id: lead.id },
    select: {
      id: true,
      optOutAt: true,
      mensagens: {
        where: {
          OR: [
            { direcao: 'ENTRADA' },
            { direcao: 'SAIDA', status: { in: ['ENVIADA', 'ENTREGUE', 'LIDA'] } },
          ],
        },
        take: 1,
        select: { id: true },
      },
    },
  });
  if (!fresh || fresh.optOutAt || fresh.mensagens.length > 0) {
    return { leadId: lead.id, ok: false, skipped: true, reason: 'histórico mudou ou opt-out' };
  }

  const failed = lead.mensagens[0];
  if (!failed?.templateNome) return { leadId: lead.id, ok: false, skipped: true, reason: 'sem template anterior' };

  const template = templates.get(`${failed.templateNome}\u0000pt_BR`);
  if (!template) return { leadId: lead.id, ok: false, skipped: true, reason: `template ${failed.templateNome} não está APPROVED` };
  if (template.vars !== 2) return { leadId: lead.id, ok: false, skipped: true, reason: `template espera ${template.vars} variáveis, não 2` };
  if (template.headerFormat !== 'IMAGE') return { leadId: lead.id, ok: false, skipped: true, reason: `header ${template.headerFormat || 'ausente'}, não IMAGE` };

  const restaurante = String(lead.restaurante || lead.nome || '').trim();
  const proveniencia = String(lead.itensProspeccao?.[0]?.lote?.proveniencia || '').trim();
  if (!restaurante || !proveniencia) {
    return { leadId: lead.id, ok: false, skipped: true, reason: 'faltou restaurante ou proveniência' };
  }

  const to = digits(lead.whatsapp);
  if (to.length < 12 || to.length > 13) return { leadId: lead.id, ok: false, skipped: true, reason: 'telefone inválido' };

  const params = [restaurante, proveniencia];
  const texto = render(template.body, params);
  if (/\{\{\d+\}\}/.test(texto)) return { leadId: lead.id, ok: false, skipped: true, reason: 'placeholder não resolvido' };

  const msg = await db.leadMensagem.create({
    data: {
      leadId: lead.id,
      direcao: 'SAIDA',
      tipo: 'TEMPLATE',
      status: 'PENDENTE',
      texto,
      autor: failed.autor || 'SISTEMA',
      autorUserId: failed.autorUserId || null,
      templateNome: template.name,
      papelDoAgente: failed.papelDoAgente || 'abordagem',
      origemDaFala: 'retry-132012',
      ocorreuEm: new Date(),
    },
    select: { id: true },
  });

  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'template',
    template: {
      name: template.name,
      language: { code: template.language },
      components: [
        { type: 'header', parameters: [{ type: 'image', image: { link: headerImage } }] },
        { type: 'body', parameters: params.map((text) => ({ type: 'text', text })) },
      ],
    },
  };

  try {
    const url = `https://graph.facebook.com/${graphVersion}/${encodeURIComponent(phoneNumberId)}/messages`;
    const r = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const j = await r.json().catch(() => ({}));
    const wamid = j?.messages?.[0]?.id || null;
    if (!r.ok || !wamid) {
      const error = j?.error?.message || `HTTP_${r.status}${wamid ? '' : '_SEM_WAMID'}`;
      await db.leadMensagem.update({
        where: { id: msg.id },
        data: { status: 'FALHOU', erro: String(error).slice(0, 1000), tentativas: { increment: 1 } },
      });
      return { leadId: lead.id, restaurante, template: template.name, ok: false, skipped: false, reason: String(error) };
    }

    const agora = new Date();
    await db.$transaction([
      db.leadMensagem.update({
        where: { id: msg.id },
        data: { status: 'ENVIADA', waMessageId: wamid },
      }),
      db.siteLead.update({
        where: { id: lead.id },
        data: {
          lastContactedAt: agora,
          lastInteractionAt: agora,
          ultimaMensagemEm: agora,
          ultimaMensagemTexto: texto.slice(0, 280),
          ultimaMensagemDeQuem: 'SAIDA',
        },
      }),
    ]);
    return { leadId: lead.id, restaurante, template: template.name, ok: true, wamid: wamid.slice(0, 18) + '…' };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    await db.leadMensagem.update({
      where: { id: msg.id },
      data: { status: 'FALHOU', erro: error.slice(0, 1000), tentativas: { increment: 1 } },
    });
    return { leadId: lead.id, restaurante, template: template.name, ok: false, skipped: false, reason: error };
  }
}

(async () => {
  if (!sendEnabled) throw new Error('FOOCCI_SDR_SEND_ENABLED não está true; reenvio recusado');
  if (!wabaId || !phoneNumberId || !token) throw new Error('canal comercial não configurado');
  if (!headerImage) throw new Error('FOOCCI_SALES_TEMPLATE_HEADER_IMAGE_URL ausente');

  const [templates, leads] = await Promise.all([loadMetaTemplates(), candidates()]);
  console.log(`RETRY_START limit=${limit} candidates=${leads.length}`);

  const results = [];
  for (const lead of leads) {
    const result = await sendOne(lead, templates);
    results.push(result);
    console.log('RETRY_RESULT=' + JSON.stringify(result));
    // No modo teste (limit 1), encerra após o primeiro resultado real.
    if (limit === 1) break;
  }

  const ok = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok && !r.skipped).length;
  const skipped = results.filter((r) => r.skipped).length;
  console.log(`RETRY_SUMMARY ok=${ok} failed=${failed} skipped=${skipped}`);
  if (failed > 0) process.exitCode = 2;
})()
  .catch((e) => {
    console.error('RETRY_FATAL=' + String(e && e.message ? e.message : e));
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
