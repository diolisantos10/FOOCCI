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
4. Em **Configurações do projeto → Propriedades do script**, crie somente `FOOCCI_META_LEADS_KEY`, usando o mesmo segredo configurado no Railway.
5. Execute uma vez `instalarTriggerFoocci` e conceda as permissões do Google.

O endereço `https://foocci.com.br/api/v1/meta-leads` já está fixado no script. O instalador remove triggers duplicados do mesmo handler, cria um trigger de 1 minuto e executa uma primeira sincronização imediatamente.

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

---

## ⛔ 18/09/2026 — POR QUE NÃO CHEGAVA. Medido, não suposto.

Três leads pagos (`Formulário 15-09-2026`) estavam na planilha e não no Foocci —
o mais antigo havia 36 horas. A causa foi medida lendo a planilha:

**Ela tinha as 16 colunas da Meta e NENHUMA das colunas `foocci_*`.**

Essas colunas são criadas por `garantirColunasDeSync_` na **primeira execução**
do script. A ausência total delas prova uma coisa só: **este Apps Script nunca
rodou uma única vez nesta planilha.** Ninguém executou `instalarTriggerFoocci`.

O que foi **descartado por medição**, e não por palpite:

| Suspeita | Veredito |
|---|---|
| Assinatura do webhook na Meta | **Irrelevante.** Este caminho não usa webhook da Meta. |
| Formulário não inscrito na Meta | **Não.** Os três leads chegaram à planilha normalmente. |
| A chave `FOOCCI_META_LEADS_KEY` | **Presente** no serviço FOOCCI, ambiente production. |
| Permissão do app da Meta | **Irrelevante** para este hop. |

Ou seja: o hop **Meta → Planilha funciona**. O hop **Planilha → Foocci nunca foi
ligado**. Nada disso depende de configuração no Facebook.

### O passo exato para ligar (tudo dentro da planilha, nada no Facebook)

1. Abrir `Leads Campanha Facebook Ads`
   (`https://docs.google.com/spreadsheets/d/1LYijufDggX7eVVVOt5ZqBqvhBDfrnSTnVhTHpHyGwoI`),
   logado como **`foocci1@gmail.com`**, que é o dono.
2. **Extensões → Apps Script**.
3. Colar o conteúdo de `scripts/integrations/meta-leads-google-sheets.gs` e salvar.
4. **Configurações do projeto → Propriedades do script → Adicionar propriedade**:
   nome `FOOCCI_META_LEADS_KEY`, valor = o **mesmo** valor da variável
   `FOOCCI_META_LEADS_KEY` do serviço FOOCCI em production no Railway.
5. Selecionar a função **`instalarTriggerFoocci`** e clicar em **Executar**.
   Autorizar as permissões que o Google pedir.
6. Conferir com a função **`verificarInstalacaoFoocci`** (Executar → Ver registro
   de execução). O log tem de dizer `segredoConfigurado: true`,
   `gatilhosInstalados: 1`, `jaRodouAlgumaVez: true`.

Depois disso as colunas `foocci_sync_status`, `foocci_synced_at`,
`foocci_attempts`, `foocci_last_error` e `foocci_lead_id` aparecem na planilha, e
cada linha passa a dizer sozinha se entrou ou por que não entrou.

### Por que NÃO construímos uma sincronização do lado do servidor

A tentação era óbvia: um cron no Foocci lendo a planilha pela API do Google.
Foi recusada por dois motivos, nesta ordem:

1. **Credencial que não existe.** O Foocci só tem OAuth de Analytics e Business
   Profile (`GOOGLE_OAUTH_CLIENT_ID`/`_SECRET`). Ler esta planilha exigiria uma
   **conta de serviço do Google com escopo `spreadsheets.readonly`**, o JSON dela
   numa variável nova (`GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON`) e a planilha
   compartilhada com o e-mail dessa conta de serviço. Nada disso existe hoje, e
   segredo não se inventa nem se escreve em código.
2. **Seria o segundo caminho de nascimento do mesmo lead.** O push do Apps
   Script já existe, roda de minuto em minuto, carrega o próprio controle de
   estado na planilha e **não precisa de credencial nenhuma** — a autorização é
   a do dono da planilha, dada uma vez. Dois caminhos produziriam duas verdades
   sobre a origem do lead, e a que diverge é sempre a que ninguém atualiza.

**Intervalo:** 1 minuto, que é o que o gatilho já usa, e está certo. Errar para
mais é o erro caro — lead quente esfria em minutos, e o teto de 25 linhas por
execução (`FOOCCI_MAX_ROWS_PER_RUN`) já protege contra rajada. O piso do Apps
Script é 1 minuto; não há ganho em pedir menos.

## O comando de resgate — `/api/admin/meta-leads/backfill`

Para o que ficou de fora enquanto a ponte estava desligada. Segredo próprio
(`FOOCCI_META_LEADS_BACKFILL_KEY`), fail-closed, idempotente pelo `id` da Meta.
Não escreve em `SiteLead` por conta própria: chama `importarMetaLead`, a mesma
porta do webhook e da ponte. Ver `src/services/meta-leads/importarMetaLead.ts`.
