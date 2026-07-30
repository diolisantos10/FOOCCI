# Raio-x do CRM — o que era código e o que era entulho

> 30/07/2026. Mapeamento do painel de CRM inteiro (13.533 linhas em 16 arquivos,
> com `CRMClient.tsx` sozinho carregando 7.135) e corte do que não estava sendo
> usado por ninguém.
>
> **1.832 linhas a menos. Zero mudança de comportamento** — 4.420 testes
> passando, os mesmos de antes.

---

## O mapa, antes

| Arquivo | Linhas | Papel |
|---|---:|---|
| `CRMClient.tsx` | 7.135 | o painel inteiro: 9 abas, modais de campanha, clientes, configurações |
| `ImportModal.tsx` | 1.555 | importação de base |
| `OverviewTab.tsx` | 1.128 | visão geral |
| `ProgramaTab.tsx` | 1.015 | programa de relacionamento |
| `SaiposNemoClient.tsx` | 522 | migração Saipos/Nemo |
| `MigracaoTab.tsx` | 466 | aba de migração |
| + 10 arquivos menores | 1.712 | |

Serviços: 79 arquivos, 26.365 linhas.

---

## O que foi cortado, e por quê

### 1. A aba Automações — duplicada e morta (321 linhas)

A maior descoberta. A aba Automações do CRM **existia inteira e nunca era
renderizada**. O componente estava lá, com `AUTOMATION_META`, o fetch, o form, os
toggles — e nenhuma linha do painel chamava ele.

Pior: a aba continuava no mapa de URL. Abrir `/crm?tab=automacoes` levava a uma
**tela em branco** — o `Tab` aceitava o valor, o painel não sabia desenhar nada.

O motivo estava escrito num comentário: as automações recorrentes migraram para
dentro de Campanhas. Mas a migração só removeu o botão da navegação. O código,
a rota de URL e o tipo ficaram.

A UI viva de automações hoje é a de **Promoções** (`PromotionsClient.tsx`), que
chama as mesmas rotas `/api/crm/automations/*`. Eram duas cópias; sobrou a que
funciona. **O backend de automações não foi tocado** — as automações configuradas
seguem rodando.

### 2. Performance de campanha + cupom — nunca renderizado (251 linhas)

Um bloco inteiro: tipos de resposta, badge de qualidade de atribuição, tabela de
cupons, seletor de período, o fetch. Ninguém montava `CampaignCouponPerformance`.

### 3. Componentes definidos e nunca usados (mais 470 linhas)

| Onde | O quê |
|---|---|
| `CRMClient.tsx` | `ActiveCampaignCard`, `CampaignPerformanceSummary`, `getOperationalStatus`, `BLANK_CAMPAIGN_TEMPLATE`, `PRIORITY_CONFIG` |
| `OverviewTab.tsx` | `ActionCard`, `CompactOpportunitiesSection`, `ConfigAlertsSection`, `DraftPreviewPanel`, `MessagePreview` |

`DraftPreviewPanel` chama atenção: 136 linhas de prévia de mensagem por IA
("W6 — draft-only, no send"), completa, nunca montada em lugar nenhum.

### 4. Arquivos órfãos (427 linhas)

- **`BrainPanel.tsx`** (206) — painel do "cérebro adaptativo" do CRM. Nenhum
  import em lugar nenhum. Era também o **único** consumidor de `/api/crm/brain` e
  `/api/crm/brain/tone` — as duas rotas caíram junto.
- **`DataNormalizationService.ts`** (221) — zero referências no repositório
  inteiro, nem em teste.

### 5. Rotas de API sem chamador (257 linhas)

Nenhuma delas era chamada por nada — nem no código, nem em teste, nem em doc.

| Rota | Nota |
|---|---|
| `/api/crm/brain` + `/brain/tone` | só o `BrainPanel` órfão chamava |
| `/api/crm/action-center` | caminho duplicado: o dado já vem pelo servidor no `page.tsx` |
| `/api/crm/opportunities` | mesmo caso |
| `/api/crm/coupons` | o comentário dizia "o editor de campanha usa esta lista". Não usa. |
| `/api/crm/actions` + `/actions/[id]/outcome` | sem chamador |
| `/api/crm/cleanup-uncontactable` | **apagava clientes** e nenhuma tela chamava |

O último merece destaque. Endpoint destrutivo — deleta clientes sem pedido —
documentado como "a UI protege isto com confirmação explícita". A UI que
protegia não existe mais. Ficou uma porta aberta sem porteiro.

`AdaptiveCRMService` **não** foi removido: ele ainda é usado pelo
`lib/crm-messages`. Só as rotas órfãs em cima dele saíram.

---

## Um bug de verdade, corrigido de quebra

O tipo `Tab` existia **duas vezes** — em `CRMClient.tsx` e em `page.tsx` — e as
duas cópias já tinham divergido:

- a de `page.tsx` **não tinha `migracao`** (aba que existe e funciona);
- as duas ainda tinham `automacoes` (aba que não existe mais).

Ou seja: `/crm?tab=migracao` não abria a aba de migração, e `/crm?tab=automacoes`
abria uma tela em branco. Agora o tipo é exportado do `CRMClient` e a `page.tsx`
importa — uma fonte só, com os dois slugs certos.

---

## O placar

| | Antes | Depois |
|---|---:|---:|
| `CRMClient.tsx` | 7.135 | **6.367** |
| `OverviewTab.tsx` | 1.128 | **746** |
| Painel CRM (total) | 13.533 | **12.179** |
| Arquivos órfãos | 2 | 0 |
| Rotas sem chamador | 8 | 0 |

**1.832 linhas removidas, 11 adicionadas.** Type-check limpo, 4.420 testes
passando, ESLint sem erro novo.

---

## O que NÃO foi cortado, de propósito

- **Backend de automações** (`/api/crm/automations/*`, `AutomationSchedulerService`)
  — vivo e em uso pela tela de Promoções.
- **`AdaptiveCRMService`** — ainda alimenta `lib/crm-messages`.
- **`CRMClient.tsx` continua com 6.367 linhas.** Cortar entulho não é quebrar em
  módulos. A quebra do monolito em arquivos por aba é trabalho de refatoração
  com risco próprio, e merece um passo separado — este aqui foi só tirar o que
  não estava sendo usado, sem mexer em nada que funciona.
