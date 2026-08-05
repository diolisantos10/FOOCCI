# CRM da Foocci — a base de prospects da própria Foocci

> Criado em 2026-08-05. Domínio do especialista `crm`.
>
> **Não confundir com o CRM do produto.** Os dois se chamam "CRM" e são coisas
> diferentes:
>
> | | CRM do produto (`/crm`) | CRM da Foocci (`/admin/foocci-crm`) |
> |---|---|---|
> | De quem é | do lojista | da Foocci |
> | Sobre quem | quem come no restaurante | donos de restaurante |
> | Multi-tenant | sim, `restaurantId` em tudo | **não existe tenant** |
> | Tabelas | `Customer`, `CRMCampaign`, `CRMContactLedger` | `SiteLead`, `SiteLeadInteraction` |
> | Código | `src/services/crm/` | `src/services/foocci-crm/` |
>
> Cruzar as duas bases é vazamento. Se você está escrevendo `restaurantId` em
> `src/services/foocci-crm/`, está no diretório errado.

---

## O que é

A base de contatos que a Foocci captura — hoje pelo formulário de demonstração do
site, amanhã por outras portas. É a base comercial: quem pediu contato, em que pé
está a conversa, de qual anúncio veio e o que já foi falado com a pessoa.

Antes de 05/08 isso era uma lista chamada "Contatos do site": oito colunas, sem
estado, sem origem útil, sem histórico. O e-mail de aviso era o destino de fato e
a tela era só um arquivo morto. Hoje **o admin é o destino** e o e-mail é
conveniência.

---

## O funil

Etapas (enum `SiteLeadStage`, ordem importa):

`NOVO` → `CONTATADO` → `QUALIFICADO` → `PROPOSTA` → `FECHADO`

`PERDIDO` é terminal e fica **fora da sequência**. Quem se perdeu saiu do funil,
não avançou nele — contá-lo como etapa faria a conversão mentir para cima.

**Pular etapa é permitido.** Uma máquina de estados rígida no comercial só produz
o hábito de mentir no registro. Quem guarda a verdade é o histórico, que registra
o pulo com autor e data.

### Três regras que o código trava

1. **Nenhuma mudança de etapa sem registro.** `moverEtapa` escreve o estado e a
   interação **na mesma transação**. Não existe caminho que mude `stage` sem gerar
   histórico. Provado em `FoocciCrmService.test.ts`.
2. **`actor` é obrigatório e vem do canal**, nunca do corpo do pedido. Quem entra
   pela rota de admin é `"admin"`; o agente SDR será `"sdr-agent"`.
3. **Taxa com amostra pequena não é calculada.** Abaixo de
   `MIN_LEADS_PARA_TAXA` (10) o cálculo devolve `null` + a explicação por extenso,
   e a tela escreve *"ainda não dá para dizer"*. Vale para o funil **e para cada
   linha da tabela por origem** — foi o caminho mais provável de escapar.

### O funil é por coorte de chegada

O período filtra `createdAt` do contato, não a data da mudança de etapa. A
pergunta que decide mídia é *"dos contatos que chegaram em julho, quantos
fecharam?"*. A outra leitura misturaria contato de março com anúncio de julho.

E um contato conta na etapa mais alta que **já alcançou**, mesmo que hoje esteja
perdido — é assim que o funil mostra **onde** vaza.

---

## A origem

### Como era (e por que não servia)

`origem = window.location.pathname` no momento do envio. Resultado: **todo contato
tinha origem `/site/demonstracao`**. Uma resposta que é sempre a mesma não é
resposta — não dava para saber qual anúncio funcionava.

### Como é

Primeiro toque, guardado no navegador desde a página de **entrada** da visita:

```
LeadOriginTracker (no layout do /site)
   ↓ grava em sessionStorage (leadOriginStorage.ts)
DemoForm  ↓ manda junto com o formulário
POST /api/site/leads
   ↓
SiteLead.utmSource / utmMedium / utmCampaign / utmContent / utmTerm
         clickId (fbclid/gclid) / landingPath / referrer
```

- **Primeiro toque, não último.** O anúncio joga a pessoa na home; ela navega e só
  depois preenche. Quem trouxe o contato foi o anúncio.
- **Uma exceção:** se o guardado não tem nenhum sinal de campanha e a URL de agora
  tem, o guardado é substituído. Guardar "direto" por cima de um anúncio real
  jogaria fora a informação que o CEO está pagando para ter.
- **`sessionStorage`, não `localStorage`.** A origem vale para esta visita; 30 dias
  fariam a campanha de julho levar crédito por um formulário de agosto.
- **Macro não substituída é descartada.** `utm_campaign={{campaign.name}}` de uma
  campanha mal configurada vira `null`, não uma campanha fantasma no relatório.
- **Sem sinal nenhum → "Direto / não identificado".** Não se inventa canal.

### O que colocar no anúncio

```
https://foocci.com.br/site?utm_source=facebook&utm_medium=cpc&utm_campaign=NOME_DA_CAMPANHA&utm_content=NOME_DO_ANUNCIO
```

`utm_content` é o que separa criativo de criativo dentro da mesma campanha.
Sem esses parâmetros o contato entra como "não identificado" e a tela avisa
quantos são — ausência de atribuição não pode parecer ausência de tráfego pago.

**Isto não é tag de analytics.** Nenhum pixel, nenhum terceiro, nenhuma
requisição. A medição do site continua sendo `SiteAnalytics` + `SiteSettingsService`.

---

## ⭐ Ponto de integração do agente SDR

O agente **não existe ainda**. O que existe é tudo de que ele precisa, pronto.

### Para ler — o dossiê

```ts
import { getDossie } from "@/services/foocci-crm/FoocciCrmService";
const dossie = await getDossie(leadId);
```

ou, por HTTP (guarda de admin): `GET /api/admin/foocci-crm/contatos/[id]`

Devolve, num objeto só:

| Campo | O que é |
|---|---|
| `nome`, `whatsapp`, `whatsappLink` | quem é e o link de conversa pronto |
| `restaurante`, `cidade`, `tipo`, `desafio` | o negócio dele |
| `respostas[]` | o que respondeu no formulário, pergunta e resposta em português |
| `origem` | canal, campanha, anúncio, referrer, página de entrada — cru e rotulado |
| `stage`, `stageChangedAt`, `stageChangedBy` | onde está no funil e quem o pôs ali |
| `lastContactedAt` | **null = ninguém abordou ainda** |
| `historico[]` | a linha do tempo inteira, em ordem cronológica |

### Para a fila de trabalho

```ts
import { listarContatos } from "@/services/foocci-crm/FoocciCrmService";
const fila = await listarContatos({ somenteNaoAbordados: true });
```

ou `GET /api/admin/foocci-crm/contatos?naoAbordados=1`

### Para escrever

```ts
import { registrarInteracao, moverEtapa } from "@/services/foocci-crm/FoocciCrmService";

await registrarInteracao({ leadId, tipo: "MENSAGEM_ENVIADA", actor: "sdr-agent", nota: "..." });
await registrarInteracao({ leadId, tipo: "RESPOSTA_RECEBIDA", actor: "sdr-agent", nota: "..." });
await moverEtapa({ leadId, para: "QUALIFICADO", actor: "sdr-agent", nota: "..." });
```

`actor: "sdr-agent"` já é um valor válido de `FoocciCrmActor`. Isso não é
detalhe: quando o robô e o CEO escrevem na mesma base, saber qual dos dois moveu
o contato é a diferença entre auditar o agente e adivinhar.

### O que o agente lê antes de abordar

`historico[]` é o equivalente comercial do `CRMContactLedger`: **o agente lê antes
de mandar mensagem**, exatamente como uma campanha do CRM do produto lê o ledger
antes de enviar. Uma abordagem que ignora o histórico manda o segundo "oi, tudo
bem?" para quem já respondeu.

### O que AINDA NÃO existe e o agente vai precisar decidir

Escrito aqui para não virar suposição de quem construir o agente:

- **Não há proteção de canal nesta base.** O CRM do produto tem horário de
  silêncio, teto diário e dedupe (`ContactSafetyService`, `crmDedupePolicy`).
  Nada disso está ligado no CRM da Foocci — porque hoje quem manda mensagem é
  gente, não robô. **Antes de o agente enviar qualquer coisa em volume, as
  proteções precisam existir aqui também**, e a decisão de qual delas vale para
  prospect (que não é cliente, e cuja base legal é o interesse manifestado) é do
  CEO, não do agente.
- **Não há cadência.** "Quantas tentativas antes de marcar perdido" não está
  modelado. O dado para modelá-lo já existe (`historico[]`).
- **Não há vínculo com o restaurante criado.** Quando um contato vira cliente, o
  `SiteLead` não aponta para o `Restaurant`. Ninguém pediu, e inventar a ligação
  agora criaria a primeira ponte entre a base sem tenant e a base com tenant.

---

## LGPD

Cada linha é uma pessoa identificável. A base legal existe (ela preencheu um
formulário pedindo contato), mas isso autoriza **a Foocci a falar com ela** — não
autoriza a internet a ler a lista.

- **Nenhuma rota pública.** Todas em `/api/admin/foocci-crm/**`, com
  `guardAdmin` (`src/app/api/admin/foocci-crm/_guard.ts`). Dois gates cobrem
  isso: o estrutural (`src/security/routeGuards.test.ts`, exige a menção) e o de
  comportamento (`routesAdminGuard.test.ts`, exige 401/403 **antes** de o serviço
  ser chamado).
- **Exclusão é exclusão.** `DELETE /api/admin/foocci-crm/contatos/[id]` apaga o
  contato e o histórico em cascata. Guardar a linha do tempo de quem pediu para
  sair seria manter o dado pessoal com outro nome.
- **A política de privacidade do site** já declara que registramos a data do envio
  e a página de origem (`/site/politica-de-privacidade`).

---

## Mapa dos arquivos

| Arquivo | O que faz |
|---|---|
| `src/services/foocci-crm/foocciCrmFunnel.ts` | **puro** — etapas, transições, taxa com trava de amostra |
| `src/services/foocci-crm/leadOrigin.ts` | **puro** — UTM/referrer → canal e rótulo; normaliza WhatsApp |
| `src/services/foocci-crm/FoocciCrmService.ts` | banco — mover etapa, registrar interação, dossiê, excluir |
| `src/services/foocci-crm/FoocciCrmPerformanceService.ts` | banco — funil e origem por período |
| `src/services/site/SiteLeadService.ts` | captura: grava → notifica; dedupe por WhatsApp |
| `src/components/marketing/LeadOriginTracker.tsx` | guarda o primeiro toque no `/site` |
| `src/components/marketing/leadOriginStorage.ts` | o `sessionStorage` da origem |
| `src/app/admin/(area)/foocci-crm/FoocciCrmClient.tsx` | a tela |
| `src/app/api/admin/foocci-crm/**` | as rotas, todas com guarda de admin |
| `prisma/migrations/20260805120000_foocci_crm_funil_e_origem/` | a migração |

`/admin/leads` continua funcionando: redireciona para `/admin/foocci-crm`.
