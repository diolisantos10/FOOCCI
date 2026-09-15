# Meta Lead Ads → Google Sheets → Foocci Comercial

## Objetivo

Leads enviados pelo formulário da campanha Meta entram automaticamente no CRM comercial da Foocci.

Fluxo:

`Meta Lead Ads → Leads Campanha Facebook Ads / Página1 → Apps Script → POST /api/v1/meta-leads → SiteLeadService → Foocci Comercial`

Esses contatos **não são Base Fria**. O contato que nasce pela campanha entra como `CAMPANHA_PAGA` e permanece no estágio `NOVO`, com precedência sobre prospecção fria.

## Planilha oficial

Arquivo: `Leads Campanha Facebook Ads`

Aba: `Página1`

Cabeçalhos confirmados em 15/09/2026:

- `id`
- `created_time`
- `ad_id`
- `ad_name`
- `adset_id`
- `adset_name`
- `campaign_id`
- `campaign_name`
- `form_id`
- `form_name`
- `is_organic`
- `platform`
- `nome_completo`
- `email_comercial`
- `telefone`
- `lead_status`

O script usa os nomes dos cabeçalhos, não as letras das colunas.

## Segurança

A API exige o header:

`x-foocci-integration-key: <FOOCCI_META_LEADS_KEY>`

O segredo fica em dois lugares apenas:

1. Railway, variável `FOOCCI_META_LEADS_KEY` do serviço FOOCCI em production.
2. Google Apps Script, Script Property `FOOCCI_META_LEADS_KEY`.

Nunca salvar o segredo em uma célula da planilha nem no repositório.

A rota usa o namespace público de integrações externas já existente (`/api/v1/*`), portanto o middleware deixa a requisição chegar ao handler; o handler continua fail-closed e só aceita o segredo próprio `FOOCCI_META_LEADS_KEY`.

## Instalação no Google Apps Script

1. Abra a planilha `Leads Campanha Facebook Ads`.
2. Vá em **Extensões → Apps Script**.
3. Cole o conteúdo de `scripts/integrations/meta-leads-google-sheets.gs`.
4. Em **Configurações do projeto → Propriedades do script**, crie:
   - `FOOCCI_META_LEADS_URL` = `https://foocci.com.br/api/v1/meta-leads`
   - `FOOCCI_META_LEADS_KEY` = o mesmo segredo configurado no Railway.
5. Execute uma vez `instalarTriggerFoocci` e conceda as permissões do Google.

O instalador remove triggers duplicados do mesmo handler, cria um trigger de 1 minuto e executa uma primeira sincronização imediatamente.

## Colunas de controle adicionadas pelo script

Na primeira execução o script cria, se ainda não existirem:

- `foocci_sync_status`
- `foocci_synced_at`
- `foocci_attempts`
- `foocci_last_error`
- `foocci_lead_id`

Status:

- `SINCRONIZADO`: Foocci confirmou o lead.
- `ERRO_RETRY`: falha transitória; a próxima execução tenta novamente.
- `ERRO_PERMANENTE`: payload inválido (400/422). Corrija a linha e execute `reprocessarErrosPermanentesFoocci`.

## Mapeamento comercial

| Meta / Sheet | Foocci |
|---|---|
| `nome_completo` | `SiteLead.nome` |
| `telefone` | `SiteLead.whatsapp` + normalização existente |
| `email_comercial` | `SiteLead.email` |
| `platform` | `utmSource` |
| pago/orgânico | `utmMedium` = `paid_social` / `organic` |
| `campaign_name` | `utmCampaign` |
| `ad_name` | `utmContent` |
| `adset_name` | `utmTerm` |
| `form_name` | `origem` |
| `id` | marcador idempotente `meta-lead:<id>` + nota interna de integração |
| submissão Meta | `consentAt` |
| campanha Meta nova | `fonte = CAMPANHA_PAGA` |
| entrada nova | `stage = NOVO` |

IDs de campanha, conjunto, anúncio e formulário, além do `lead_status`, ficam registrados também em uma `NOTA_INTERNA` no histórico do lead.

## Deduplicação e idempotência

Há duas proteções diferentes:

1. O `SiteLeadService` continua deduplicando pessoas pelo WhatsApp, como já faz com o formulário do site.
2. A ponte reconhece o `id` da Meta pelo marcador de atribuição e, quando o telefone já tinha outro primeiro toque, também pela nota interna da integração. Se o Apps Script reenviar a mesma linha depois de um timeout, a chamada devolve o lead existente e não cria nova captura.

Se o mesmo telefone já existia por outra origem, a origem de primeiro toque é preservada; a submissão da Meta vira novo contexto/histórico, não reescreve a aquisição original.

## Teste de ponta a ponta

A planilha estava sem linhas de leads no momento da implementação. O teste final deve ser feito com o recurso de **lead de teste** do formulário Meta ou com o primeiro lead real, verificando:

1. linha criada na aba `Página1`;
2. `foocci_sync_status = SINCRONIZADO`;
3. `foocci_lead_id` preenchido;
4. contato visível no Foocci Comercial como lead inbound;
5. origem/campanha/anúncio preservados no histórico;
6. nenhum item criado em Base Fria.
