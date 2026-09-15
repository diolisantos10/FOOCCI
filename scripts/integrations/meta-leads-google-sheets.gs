/*
 * Meta Lead Ads -> Google Sheets -> Foocci Comercial
 *
 * Planilha oficial: "Leads Campanha Facebook Ads"
 * Aba: Página1
 *
 * O script trabalha por NOME de cabeçalho, nunca por posição fixa. Assim a Meta
 * pode inserir colunas sem deslocar o mapeamento do Foocci.
 *
 * Script Properties obrigatórias:
 *   FOOCCI_META_LEADS_URL = https://foocci.com.br/api/integrations/meta-leads
 *   FOOCCI_META_LEADS_KEY = <segredo forte configurado no Railway>
 */

const FOOCCI_SHEET_NAME = 'Página1';
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
    const props = PropertiesService.getScriptProperties();
    const endpoint = props.getProperty('FOOCCI_META_LEADS_URL');
    const secret = props.getProperty('FOOCCI_META_LEADS_KEY');

    if (!endpoint || !secret) {
      throw new Error(
        'Configure FOOCCI_META_LEADS_URL e FOOCCI_META_LEADS_KEY em Script Properties.'
      );
    }

    const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = spreadsheet.getSheetByName(FOOCCI_SHEET_NAME);
    if (!sheet) throw new Error('Aba "' + FOOCCI_SHEET_NAME + '" não encontrada.');

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

      const payload = {
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

      try {
        const response = UrlFetchApp.fetch(endpoint, {
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

/**
 * Execute UMA vez depois de configurar as Script Properties.
 * Remove triggers antigos do mesmo handler para nunca instalar dois robôs.
 */
function instalarTriggerFoocci() {
  const props = PropertiesService.getScriptProperties();
  if (!props.getProperty('FOOCCI_META_LEADS_URL') || !props.getProperty('FOOCCI_META_LEADS_KEY')) {
    throw new Error('Configure as duas Script Properties antes de instalar o trigger.');
  }

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

/** Reabre linhas com erro permanente depois de uma correção manual dos dados. */
function reprocessarErrosPermanentesFoocci() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(FOOCCI_SHEET_NAME);
  if (!sheet) throw new Error('Aba "' + FOOCCI_SHEET_NAME + '" não encontrada.');

  garantirColunasDeSync_(sheet);
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return;

  const headers = values[0].map(function (h) { return String(h).trim(); });
  const index = indiceDeCabecalhos_(headers);

  for (let i = 1; i < values.length; i++) {
    if (texto_(values[i][index.foocci_sync_status]).toUpperCase() === 'ERRO_PERMANENTE') {
      sheet.getRange(i + 1, index.foocci_sync_status + 1).setValue('');
      sheet.getRange(i + 1, index.foocci_last_error + 1).setValue('');
    }
  }
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
  if (missing.length) {
    throw new Error('Cabeçalhos da Meta ausentes: ' + missing.join(', '));
  }
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
