/*
 * Meta Lead Ads -> Google Sheets -> Foocci Comercial
 *
 * Planilha oficial: "Leads Campanha Facebook Ads"
 * Aba: Página1
 *
 * O endereço do Foocci é fixo. A única configuração manual é a Script Property
 * FOOCCI_META_LEADS_KEY, com o mesmo segredo já configurado no Railway.
 */

const FOOCCI_SHEET_NAME = 'Página1';

/*
 * ⚠️ MEDIDO EM 18/09/2026, E É A CAUSA INTEIRA DO ATRASO DE 36 HORAS.
 *
 * A planilha "Leads Campanha Facebook Ads" tinha TRÊS leads pagos e NENHUMA das
 * colunas `foocci_*`. Essas colunas são criadas por `garantirColunasDeSync_` na
 * primeira execução — a ausência delas prova que este script **nunca rodou uma
 * única vez** naquela planilha. Não era a chave (conferida, presente no Railway),
 * não era assinatura de webhook, não era permissão do app da Meta: o hop
 * Meta→Planilha funcionava e o hop Planilha→Foocci nunca foi ligado.
 *
 * Duas travas saíram daquela medição:
 *
 *  1. O nome da aba deixou de ser fatal. `'Página1'` é o padrão do Google em
 *     português, mas a planilha pode ter sido criada em outra língua ou a aba
 *     renomeada — e o script inteiro morria no `getSheetByName`, calado, para
 *     sempre. Agora ele tenta o nome e cai na primeira aba; quem manda na
 *     validação são os CABEÇALHOS, que continuam fail-closed.
 *  2. `verificarInstalacaoFoocci` existe para responder "isto está ligado?" sem
 *     precisar esperar um lead aparecer para descobrir que não estava.
 */
const FOOCCI_META_LEADS_URL = 'https://foocci.com.br/api/v1/meta-leads';
const FOOCCI_MAX_ROWS_PER_RUN = 25;

const FOOCCI_SYNC_HEADERS = [
  'foocci_sync_status',
  'foocci_synced_at',
  'foocci_attempts',
  'foocci_last_error',
  'foocci_lead_id',
];

function sincronizarLeadsFoocci() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) return;

  try {
    const secret = PropertiesService.getScriptProperties().getProperty('FOOCCI_META_LEADS_KEY');
    if (!secret) {
      throw new Error('Configure FOOCCI_META_LEADS_KEY em Propriedades do script.');
    }

    const sheet = abaDosLeads_();
    garantirColunasDeSync_(sheet);

    const lastRow = sheet.getLastRow();
    const lastColumn = sheet.getLastColumn();
    if (lastRow < 2) return;

    const values = sheet.getRange(1, 1, lastRow, lastColumn).getValues();
    const headers = values[0].map(function (h) { return String(h).trim(); });
    const index = indiceDeCabecalhos_(headers);
    validarCabecalhosMeta_(index);

    let processed = 0;
    for (let i = 1; i < values.length && processed < FOOCCI_MAX_ROWS_PER_RUN; i++) {
      const rowNumber = i + 1;
      const row = values[i];
      const metaLeadId = texto_(row[index.id]);
      if (!metaLeadId) continue;

      const status = texto_(row[index.foocci_sync_status]).toUpperCase();
      if (status === 'SINCRONIZADO' || status === 'ERRO_PERMANENTE') continue;

      processed++;
      const attempts = numero_(row[index.foocci_attempts]) + 1;
      const payload = payloadDaLinha_(row, index, metaLeadId);

      try {
        const response = UrlFetchApp.fetch(FOOCCI_META_LEADS_URL, {
          method: 'post',
          contentType: 'application/json',
          headers: { 'x-foocci-integration-key': secret },
          payload: JSON.stringify(payload),
          muteHttpExceptions: true,
          followRedirects: false,
        });

        const code = response.getResponseCode();
        const bodyText = response.getContentText() || '';
        let body = {};
        try { body = JSON.parse(bodyText); } catch (_) {}

        if (code >= 200 && code < 300) {
          escreverResultado_(sheet, rowNumber, index, {
            status: 'SINCRONIZADO',
            syncedAt: new Date(),
            attempts: attempts,
            error: '',
            leadId: body.leadId || '',
          });
          continue;
        }

        const message = body.error || ('HTTP ' + code + ': ' + bodyText.slice(0, 300));
        const permanent = code === 400 || code === 422;
        escreverResultado_(sheet, rowNumber, index, {
          status: permanent ? 'ERRO_PERMANENTE' : 'ERRO_RETRY',
          syncedAt: '',
          attempts: attempts,
          error: message,
          leadId: body.leadId || '',
        });
      } catch (error) {
        escreverResultado_(sheet, rowNumber, index, {
          status: 'ERRO_RETRY',
          syncedAt: '',
          attempts: attempts,
          error: error && error.message ? error.message : String(error),
          leadId: '',
        });
      }
    }
  } finally {
    lock.releaseLock();
  }
}

function instalarTriggerFoocci() {
  const secret = PropertiesService.getScriptProperties().getProperty('FOOCCI_META_LEADS_KEY');
  if (!secret) throw new Error('Configure FOOCCI_META_LEADS_KEY antes de instalar o trigger.');

  ScriptApp.getProjectTriggers().forEach(function (trigger) {
    if (trigger.getHandlerFunction() === 'sincronizarLeadsFoocci') {
      ScriptApp.deleteTrigger(trigger);
    }
  });

  ScriptApp.newTrigger('sincronizarLeadsFoocci')
    .timeBased()
    .everyMinutes(1)
    .create();

  sincronizarLeadsFoocci();
}

function reprocessarErrosPermanentesFoocci() {
  const sheet = abaDosLeads_();
  garantirColunasDeSync_(sheet);
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return;

  const index = indiceDeCabecalhos_(values[0].map(function (h) { return String(h).trim(); }));
  for (let i = 1; i < values.length; i++) {
    if (texto_(values[i][index.foocci_sync_status]).toUpperCase() === 'ERRO_PERMANENTE') {
      sheet.getRange(i + 1, index.foocci_sync_status + 1).setValue('');
      sheet.getRange(i + 1, index.foocci_last_error + 1).setValue('');
    }
  }
}

/**
 * A aba dos leads: pelo nome, e — se ele não existir — a primeira da planilha.
 *
 * Cair na primeira aba NÃO afrouxa nada: `validarCabecalhosMeta_` roda em
 * seguida e recusa qualquer aba que não tenha as 16 colunas da Meta. O que essa
 * queda evita é o modo de falha que custou 36 horas: o script morrer no nome da
 * aba e nunca chegar a conferir cabeçalho nenhum.
 */
function abaDosLeads_() {
  const planilha = SpreadsheetApp.getActiveSpreadsheet();
  const porNome = planilha.getSheetByName(FOOCCI_SHEET_NAME);
  if (porNome) return porNome;

  const abas = planilha.getSheets();
  if (!abas.length) throw new Error('A planilha não tem nenhuma aba.');
  return abas[0];
}

/**
 * "ISTO ESTÁ LIGADO?" — a resposta, sem precisar de um lead para descobrir.
 *
 * Rode esta função no editor do Apps Script e leia o log. Ela responde as três
 * perguntas que ninguém conseguia responder em 18/09/2026: o segredo está
 * configurado, o gatilho existe, e as colunas de controle já foram criadas
 * (ou seja: o script já rodou pelo menos uma vez).
 */
function verificarInstalacaoFoocci() {
  const secret = PropertiesService.getScriptProperties().getProperty('FOOCCI_META_LEADS_KEY');
  const gatilhos = ScriptApp.getProjectTriggers().filter(function (t) {
    return t.getHandlerFunction() === 'sincronizarLeadsFoocci';
  });

  const sheet = abaDosLeads_();
  const headers = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), 1)).getValues()[0]
    .map(function (h) { return String(h).trim(); });

  const diagnostico = {
    aba: sheet.getName(),
    segredoConfigurado: Boolean(secret),
    gatilhosInstalados: gatilhos.length,
    jaRodouAlgumaVez: headers.indexOf('foocci_sync_status') !== -1,
    linhas: Math.max(sheet.getLastRow() - 1, 0),
  };

  Logger.log(JSON.stringify(diagnostico, null, 2));
  return diagnostico;
}

function payloadDaLinha_(row, index, metaLeadId) {
  return {
    metaLeadId: metaLeadId,
    createdTime: texto_(row[index.created_time]),
    adId: texto_(row[index.ad_id]),
    adName: texto_(row[index.ad_name]),
    adsetId: texto_(row[index.adset_id]),
    adsetName: texto_(row[index.adset_name]),
    campaignId: texto_(row[index.campaign_id]),
    campaignName: texto_(row[index.campaign_name]),
    formId: texto_(row[index.form_id]),
    formName: texto_(row[index.form_name]),
    isOrganic: booleano_(row[index.is_organic]),
    platform: texto_(row[index.platform]),
    fullName: texto_(row[index.nome_completo]),
    email: texto_(row[index.email_comercial]),
    phone: texto_(row[index.telefone]),
    leadStatus: texto_(row[index.lead_status]),
  };
}

function garantirColunasDeSync_(sheet) {
  const lastColumn = Math.max(sheet.getLastColumn(), 1);
  const currentHeaders = sheet.getRange(1, 1, 1, lastColumn).getValues()[0]
    .map(function (h) { return String(h).trim(); });

  let nextColumn = currentHeaders.length + 1;
  FOOCCI_SYNC_HEADERS.forEach(function (header) {
    if (currentHeaders.indexOf(header) === -1) {
      sheet.getRange(1, nextColumn).setValue(header);
      currentHeaders.push(header);
      nextColumn++;
    }
  });
}

function validarCabecalhosMeta_(index) {
  const required = [
    'id', 'created_time', 'ad_id', 'ad_name', 'adset_id', 'adset_name',
    'campaign_id', 'campaign_name', 'form_id', 'form_name', 'is_organic',
    'platform', 'nome_completo', 'email_comercial', 'telefone', 'lead_status',
  ];

  const missing = required.filter(function (header) { return index[header] === undefined; });
  if (missing.length) throw new Error('Cabeçalhos da Meta ausentes: ' + missing.join(', '));
}

function indiceDeCabecalhos_(headers) {
  const result = {};
  headers.forEach(function (header, i) { result[header] = i; });
  return result;
}

function escreverResultado_(sheet, rowNumber, index, result) {
  sheet.getRange(rowNumber, index.foocci_sync_status + 1).setValue(result.status);
  sheet.getRange(rowNumber, index.foocci_synced_at + 1).setValue(result.syncedAt);
  sheet.getRange(rowNumber, index.foocci_attempts + 1).setValue(result.attempts);
  sheet.getRange(rowNumber, index.foocci_last_error + 1).setValue(result.error);
  sheet.getRange(rowNumber, index.foocci_lead_id + 1).setValue(result.leadId);
}

function texto_(value) {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString();
  return String(value).trim();
}

function numero_(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function booleano_(value) {
  if (typeof value === 'boolean') return value;
  const normalized = texto_(value).toLowerCase();
  return normalized === 'true' || normalized === '1' || normalized === 'sim' || normalized === 'yes';
}
