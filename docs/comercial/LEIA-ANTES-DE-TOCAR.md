# LEIA ANTES DE TOCAR — a sala comercial do Foocci

> **Ordem do CEO:** nenhum agente escreve uma linha da sala comercial sem antes
> ter lido o projeto inteiro. Este arquivo é essa leitura, feita uma vez, para
> que os próximos leiam **um arquivo só** em vez de redescobrir tudo.
>
> Leitura feita em **19/09/2026**, na branch `claude/remove-legacy-runner-q8iXa`.
> Cobre: os 14 agentes de `.claude/agents/`, `CLAUDE.md`, `DESIGN.md`,
> `src/services/salaDeVendas/**`, `src/services/foocci-sdr/**`,
> `src/services/sales/**`, `src/services/meta-leads/**`,
> `src/services/whatsapp/**`, `src/lib/sala/rotas.ts`, as telas de
> `src/app/comercial/**`, `prisma/schema.prisma`,
> `reestruturação da área comercial do FOOCCI/` e
> `docs/crm/jornada-desenhada-pelo-ceo.md`.
>
> ⚠️ **Regra deste documento:** o que não foi medido está escrito como
> **"não medido"**. Nada aqui é suposição. Toda afirmação carrega arquivo e,
> quando a linha importa, a linha.

---

## 0. A primeira coisa a saber: são DUAS casas comerciais, e elas não se tocam

| | A sala comercial da **Foocci** | O **CRM do restaurante** |
|---|---|---|
| Quem vende para quem | A Foocci vendendo o plano para o dono do restaurante | O restaurante falando com o cliente final dele |
| Código | `src/services/salaDeVendas/**`, `foocci-sdr/**`, `sales/**`, `meta-leads/**` | `src/services/crm/**`, `customer/**`, `promotions/**` |
| Models | `SiteLead`, `LeadMensagem`, `Empresa`, `Contato`, `Oportunidade`, `Cliente` | tudo com `restaurantId`: `Customer`, `Campaign`, `CRMContactLedger` |
| Endereço | `/comercial` | `/admin/crm-agente`, `/atendimento` |
| Doutrina | este arquivo | `docs/crm/jornada-desenhada-pelo-ceo.md` |

**Este documento é sobre a primeira.** A confusão entre as duas é tratada como
defeito grave: `raioX/raioXDasConversas.ts:30-38` tem teste de contrato que
**proíbe a palavra `restaurantId`** naquele arquivo, porque uma junção errada
vazaria conversa de cliente do cliente.

⚠️ Os dois caminhos usam a **mesma conta de WhatsApp da Foocci** só no lado da
sala comercial (`FoocciSalesChannel`); o CRM do restaurante usa o número do
restaurante. Não misture os tetos: os 900/dia de
`docs/crm/jornada-desenhada-pelo-ceo.md` são do CRM do restaurante; o teto da
sala comercial é 2.000/24h (`freioDeRitmo.ts:51`).

---

## 1. ⭐ O CAMINHO DE UM LEAD — do nascimento ao fechamento

Este é o coração do documento. Cada elo traz **arquivo + função**.

### 1.1 Nascimento — as quatro portas por onde um lead entra

| Porta | Arquivo · função | `fonte` gravada | Liga o relógio de SLA? |
|---|---|---|---|
| **Formulário do site / agendamento** | `src/services/site/SiteLeadService.ts:322` | `FORMULARIO_DEMONSTRACAO`, `AGENDAMENTO` | **Sim** (`slaVenceEm: prazoDaPrimeiraResposta(new Date())`) |
| **WhatsApp direto** (a pessoa escreve primeiro) | `foocci-sdr/FoocciSalesInbound.ts:62` · `criarContatoDeWhatsApp` | `WHATSAPP_DIRETO` | **Sim** (na mesma linha) |
| **Meta Lead Ads** (formulário do anúncio) | `meta-leads/importarMetaLead.ts:220` · `importarMetaLead` → `SiteLeadService.capture` (`:280`) | `CAMPANHA_PAGA` (`:57`) | **Só se a ficha for nova.** Ficha que já existia (contato da base fria promovido) fica sem relógio — ver buraco **B-02** |
| **Lista fria importada** (planilha) | `salaDeVendas/prospeccao/importacao.ts` → `lerPlanilha.ts` → `lote.ts` | `LISTA_PROSPECCAO` (só vira `SiteLead` em `selecao.ts:589` `materializarLead`) | **NÃO** — e é de propósito: lista fria não é alguém a quem devemos resposta |

A distinção que governa tudo o que vem depois é `FONTES_QUE_NOS_PROCURARAM`
(`recepcao/portasDeEntrada.ts:28`) — uma lista **positiva**, nunca "tudo menos
lista fria". `IMPORTACAO`, `MANUAL` e `OUTRO` ficam de fora de propósito:
ninguém sabe dizer se aquela pessoa nos procurou.

### 1.2 Quem começa a conversa — os TRÊS disparadores, e só três

Existe **um único lugar por onde uma abordagem sai**:
`salaDeVendas/abordar.ts:483` · `abordarLead`. Três caminhos o chamam:

| Disparador | Arquivo · função | Quem o aciona | Para quem |
|---|---|---|---|
| **A recepção** — quem chegou sozinho | `recepcao/recepcaoDeLeads.ts:328` · `rodadaDaRecepcao` → `:201` `receberUmLead` → `abordarLead` (`:275`) | `GET /api/cron/comercial/recepcao` (`src/app/api/cron/comercial/recepcao/route.ts:66`), agendado por `.github/workflows/comercial-recepcao.yml` (`*/20 11-23 * * 1-5` UTC) | leads de `FONTES_QUE_NOS_PROCURARAM` sem contato anterior |
| **A rodada de prospecção** — a lista fria | `prospeccao/abordarDaFila.ts` · `abordarARodadaDoDia` / `abordarItemDaFila` | `src/app/api/cron/prospeccao/rodada/route.ts:46`, agendado por `.github/workflows/prospeccao-rodada.yml` (`0 12 * * 1-5` UTC = 09h SP) | `ItemDeProspeccao` de um `LoteDeProspeccao` liberado |
| **"Abordar agora"** — a ordem manual | `abordarAgora/abordarAgora.ts:161` · `abordarAgora` | `POST /api/admin/comercial/abordar-agora` (`route.ts:108`), com segredo próprio (`abordarAgora/guarda.ts`) | lead nominado por código/ID, com fila de modelos declarada |

Existe ainda a **campanha de reabordagem**, que é caminho separado (§1.6).

### 1.3 A saída de uma abordagem — as cinco travas de `abordarLead`, nesta ordem

`src/services/salaDeVendas/abordar.ts`, e a ordem é regra, não acaso:

| # | Trava | Linha | O que ela pergunta |
|---|---|---|---|
| 1 | **O portão do lead** | `:552` `avaliarPortaoDoLead` → `foocci-sdr/LeadContactSafety.ts:246` `avaliarContatoDeLead` | fala do **destinatário**: pediu silêncio? tem telefone? consentimento vale? já tentamos demais? está na janela? |
| 2 | **O freio de ritmo** | `:570` `conferirRitmo` → `freioDeRitmo.ts:149` | fala de **nós**: quantas já saíram nas últimas 24h |
| 3 | **Gravar antes de enviar** | `:697` `registrarSaida` → `conversa.ts:280` | o pior caso vira uma linha `PENDENTE` visível, nunca um cliente que recebeu sem o sistema saber |
| 4 | **A Supervisora** | `:715` `avaliarAdequacaoDoTemplate` → `supervisora/adequacaoDoTemplate.ts` | segunda opinião sobre **o momento** — nunca reescreve o template, só libera ou barra. Em `OFF`/`SHADOW` nunca impede |
| 3.5 | **A trava de repetição** | `:737` `reservarEnvio` → `travaDeRepeticao.ts:236` | este conteúdo já saiu para este número? saiu algo há menos de 20h? |
| 5 | **A entrega** | `:759` `enviarModeloDeVendas` → `foocci-sdr/FoocciSalesChannel.ts:519` | a Meta aceita? e o resultado volta escrito na linha (`:769` `confirmarEnvio`) |

**A fila de modelos** (ordem do CEO, 18/09/2026): cada estágio devolve uma
FILA, e o laço de `:670` desce por ela. Quem decide se a fila desce ou para é
`foocci-sdr/familiasDeErroDaMeta.ts` · `classificarErroDaMeta` — **só a família
`doModelo` desce a fila**; `desconhecido` PARA (foi o que fez o lead Jones
Sartori receber quatro mensagens).

### 1.4 Quem responde quando o lead escreve de volta

```
webhook da Meta
  → src/app/api/whatsapp/... (roteamento)
  → foocci-sdr/FoocciSalesChannel.ts:222 · decidirDesvioParaVendas
  → foocci-sdr/FoocciSalesInbound.ts:33 · receberMensagemDeVendas
       ├─ interpretarMensagemDeVendas (:25) → detecta opt-out e código do lead
       ├─ encontrarLead → por código, senão por telefone; NUNCA cria segundo lead
       ├─ registrarEntrada (conversa.ts:92) → trava UNIQUE em waMessageId
       ├─ ColdLeadInboundPolicy.ts · aplicarPoliticaAntesDoTA
       ├─ WhatsappBotGate.ts → se do outro lado é um bot/menu
       └─ salaDeVendas/ta/atender.ts:? · atenderComOTA  (o Time de Atendimento)
             └─ responsavel.ts:318 · iaAssumeSeEstaLivre
```

⛔ **A janela comercial NÃO se aplica aqui.** `janelaComercial.ts:22-40` diz
com todas as letras: ela barra **nós iniciarmos**, nunca **nós respondermos**.
`ta/atender.ts` usa a janela configurável do TA
(`LeadContactSafety.ts:229` `foraDaJanela`), e há teste de contrato
(`janelaComercial.test.ts:189-193`) que **proíbe** `ta/atender.ts` de importar
`podeAbordarAgora`.

### 1.5 A fala LIVRE (não-template) — o outro caminho de saída

`salaDeVendas/entrega.ts:134` · `entregarMensagem` é a **única** função por onde
passa toda fala livre da empresa — IA, humano digitando na tela, e o conector do
handoff. Ordem interna:

1. `pediuSilencio` (`:205`) — opt-out reavaliado **na hora da entrega**, porque
   entre compor e entregar a pessoa pode ter pedido para parar;
2. `revisarAntesDeEntregar` (`:229`, `supervisora/revisao.ts`) — em `GUARD`/
   `INTERVENTION` pode reescrever o texto ou impedir;
3. `reservarEnvio` (`:263`) com `naturezaDaFala(m.autor, m.tipo)` (`:126`);
4. `enviarTextoDeVendas` (`:279`, `FoocciSalesChannel.ts:411`).

### 1.6 A reabordagem — a campanha de recuperação da base

Caminho próprio, **sem cron**, só por comando:

```
POST /api/admin/comercial/reabordagem/disparar
  → reabordagem/executar.ts:120 · dispararUmLote
       ├─ :152 podeAbordarAgora        (janela comercial)
       ├─ :158 conferirInterruptor     (interruptor.ts:36 — fail-closed)
       ├─ :164 ultimoLoteEm            (≥30 min entre lotes, lido do banco)
       ├─ :184 selecionarProximoLote   (selecao.ts:70 — 40 por lote)
       └─ por contato:
            ├─ :208 conferirInterruptor  ← DE NOVO, uma vez por PESSOA
            ├─ :220 decidirReabordagem   (rota.ts:173 — a tabela do CEO, pura)
            └─ :333 porta.porTemplate  /  :335 porta.naJanela
                 (portaDeEnvio.ts:63 · portaDeEnvioReal → abordarLead / entregarMensagem)
```

`POST /api/admin/comercial/reabordagem/parar` aciona `interruptor.ts:66`
`pararTudo`.

### 1.7 Dentro do funil — qualificação, distribuição, proposta, fechamento

| Elo | Arquivo · função |
|---|---|
| Quem é o dono do lead | `responsavel.ts:100` `assumirComoHumano` · `:163` `devolverParaIA` · `:220` `pedirHumano` · `:318` `iaAssumeSeEstaLivre` — todos por `updateMany` com a condição **dentro** do `where` (atômico) |
| Distribuição entre vendedores | `distribuicao.ts:109` `escolherResponsavel` · `:255` `distribuir` · `:332` `transferir` · `:380` `assuncaoDoGerente` |
| Filas de trabalho | `filas.ts:54` `FILAS` · `:111` `escopoDaConsulta` (o RBAC vive no `where`, não na tela) · `:334` `listarFila` |
| Qualificação e score | `salaDeVendas/score.ts`, `telas/qualificacao.ts`, model `LeadQualificacao` |
| Funil / estágios | `funil.ts` · enum `SiteLeadStage` (`schema.prisma:5237`) · `sales/commercialFlow.ts:62` `COMMERCIAL_TRANSITIONS` |
| Copiloto do vendedor | `copiloto.ts`, `copilotoNoCrm.ts` |
| Proposta e preço | `propostas.ts`, `precos.ts`, `checkoutDaProposta.ts` → model `LeadProposta` (`schema.prisma:6868`) |
| Handoff entre papéis | `handoff.ts` → model `LeadHandoff` (`:6922`) |
| Follow-up / cadência | `crm/estadoDeFollowUp.ts` (14 estados) · `crm/cadenciaPorComportamento.ts` · `crm/planoDoDia.ts` · `followUp.ts` |
| Pós-venda | `crm/posVenda.ts` · models `Cliente` (`:8645`), `EventoDaJornada` (`:8722`) |
| Perda | model `MotivoDePerda` (`:6723`) — **sem catálogo semeado, nenhum lead pode ser marcado como perdido** (por isso o passo 5 de `scripts/start-production.sh`) |

### 1.8 Os models que a sala comercial usa (`prisma/schema.prisma`)

**O lead e a conversa:** `SiteLead` (`:4974`), `SiteLeadInteraction` (`:5306`),
`LeadMensagem` (`:6456`), `TravaDaConversa` (`:6573`), `ConversaArquivada`
(`:8962`).
**Enums que governam:** `SiteLeadStage` (`:5237`), `SiteLeadSource` (`:5284`),
`LeadTemperatura` (`:5274`), `LeadAtendidoPor` (`:5336`), `DirecaoDaMensagem`
(`:6402`), `StatusDaMensagem` (`:6426`), `AutorDaMensagem` (`:6437`).
**O trabalho:** `LeadQualificacao` (`:6601`), `LeadScoreFator` (`:6697`),
`MotivoDePerda` (`:6723`), `LeadTarefa` (`:6773`), `LeadCompromisso` (`:6822`),
`LeadProposta` (`:6868`), `LeadHandoff` (`:6922`), `Cadencia` (`:7574`),
`LeadCadencia` (`:7620`), `LeadAvaliacaoQA` (`:7688`).
**O time:** `SdrDisponibilidade` (`:6972`), `SdrIaConfig` (`:7018`) —
**esta é a coluna que de fato liga o TA**.
**A Supervisora:** `SupervisoraConfig` (`:7241`), `SupervisoraAvaliacao`
(`:7285`), `AcademiaRevisaoRetrospectiva` (`:7354`).
**A prospecção:** `ProspeccaoConfig` (`:7860`), `LoteDeProspeccao` (`:7902`),
`ItemDeProspeccao` (`:7967`), `ImportacaoDeLeads` (`:8060`), `ModeloDeVendas`
(`:8132`).
**O Revenue OS:** `Empresa` (`:8324`), `EmpresaProveniencia` (`:8461`),
`Contato` (`:8497`), `Oportunidade` (`:8568`), `Cliente` (`:8645`),
`EventoDaJornada` (`:8722`).
**As travas:** `TravaDeAbordagemRitmo` (`:8807`), `TravaDeAbordagemEnviada`
(`:8816`), `TravaDeAbordagemRecusa` (`:8833`), `ReabordagemInterruptor`
(`:8893`), `ReabordagemExecucao` (`:8912`).

### 1.9 As telas (`src/lib/sala/rotas.ts` → `src/app/comercial/(area)/`)

A raiz é **`/comercial`** (`rotas.ts:37`), **não** `/atendimento` — aquele
endereço já é a caixa de conversas **do restaurante** e tomá-lo derrubaria a
tela de trabalho de todo cliente pagante (`rotas.ts:28-36`).

`filas` (raiz) · `conversas` · `carteira` · `funil` · `agentes` · `precos` ·
`ensaio` · `meus-numeros` · `painel` · `agente` · `whatsapp` · `prospeccao` ·
`importacoes` · `base-fria` · `acessos` · `supervisora` · `torre` ·
`atendimento` · `crm` · `oferta` · `qualificacao` · `relacionamento` ·
`roteamento` · `sdr` · `lead`.

⚠️ **`src/app/admin/**` NÃO serve mais a sala de vendas.** A área mudou de
`/admin/sala-de-vendas` para `/comercial` em 26/08/2026. O que sobrou em
`src/app/admin/(area)/sala-de-vendas` e as rotas
`/api/admin/sala-de-vendas/**` são a **API**, ainda no endereço antigo, servindo
telas que hoje vivem em `/comercial`. Quem for renomear endereço mexe em
`src/lib/sala/rotas.ts`, e só lá.

---

## 2. AS TRAVAS QUE EXISTEM — e o que cada uma barra

| Trava | Arquivo | Onde age | O que barra | Fail-closed? |
|---|---|---|---|---|
| **Opt-out** | `foocci-sdr/LeadContactSafety.ts:250` (`avaliarContatoDeLead` §1) e `:?` `pediuSilencio` | portão + `entrega.ts:205` | quem pediu silêncio, em qualquer canal, para sempre. **Lei, não configuração** — nem `ignorarJaContatado` perdoa | — |
| **Portão do lead** | `LeadContactSafety.ts:246` | `abordar.ts:552` | sem telefone, telefone implausível, canal não pronto, histórico desconhecido, consentimento ausente/vencido (>N dias), teto de tentativas, descanso de 48h | **Sim** — a ordem das perguntas é deliberada; "pediu para parar" nunca é encoberto por "fora do horário" |
| **Janela comercial** | `janelaComercial.ts:240` `podeAbordarAgora` | `LeadContactSafety.ts:319` e `:532`; `reabordagem/executar.ts:152` | **iniciar** conversa fora de seg–sex 09–20, sáb 09–14, domingo nunca (America/Sao_Paulo, fuso explícito). **Não barra responder** | **Sim** — fuso inválido, hora ilegível, variável malformada = não aborda |
| **Freio de ritmo (orçamento de contato)** | `freioDeRitmo.ts:149` `conferirRitmo` | `abordar.ts:570` | mais de **2.000 abordagens em 24h** (`TETO_DURO_POR_DIA`, `:51`). Conta só `tipo: TEMPLATE` com status `ENVIADA/ENTREGUE/LIDA` — **não conta resposta livre**, senão viraria mordaça de atendimento. O ambiente (`FOOCCI_SDR_TETO_DIA`) **só aperta**; o tier da Meta aperta também (`tetosEmVigor`, `:72`) | Não é transacional, e não precisa ser (`:141`) |
| **Reserva de envio / trava de repetição** | `travaDeRepeticao.ts:236` `reservarEnvio` | `abordar.ts:737`, `entrega.ts:263` | (a) **conteúdo**: `@@unique(telefoneDigits, impressao)` — o mesmo texto nunca vai duas vezes para o mesmo número, nem daqui a um ano; (b) **ritmo**: `updateMany` condicional (comparar-e-trocar) — **20h** mínimas entre duas abordagens ao mesmo número. Só `natureza: "abordagem"` passa por ela; `"conversa"` sai livre (`:222`) | **Sim** — telefone ilegível, texto vazio ou erro de banco = recusa. Toda recusa vira linha em `TravaDeAbordagemRecusa` |
| **Devolução da reserva** | `travaDeRepeticao.ts:203` `devolverReserva` | `conversa.ts:496` | desfaz a reserva quando a entrega **não** aconteceu — mensagem que não chegou não gastou a paciência de ninguém | — |
| **Fila de modelos** | `abordar.ts:607-650` + `foocci-sdr/modelosDoPrimeiroContato.ts` + `modelosLiberados.ts` | `abordar.ts` | só modelos **APPROVED na Meta com "Pode enviar" ligado**. Estágio 1 (número frio) sorteia **só** entre os três `foocci_contato_inicial_*`; estágio 2 (`fonte = INDICACAO`) sorteia entre os demais. **Os grupos não se misturam**. Modelo forçado vira **fila de um** e, se não estiver liberado, devolve `modeloNaoLiberado` — nunca um sorteio de consolação | **Sim** |
| **Variável sem fonte** | `abordar.ts` `montarParametros` / `camposDoModelo` | dentro do laço da fila | modelo cujo `{{n}}` não tem dado é **pulado**, nunca sai com `{{1}}` vazio (já custou ~10% dos disparos) | **Sim** |
| **Supervisora** | `supervisora/adequacaoDoTemplate.ts` (template) e `supervisora/revisao.ts` (texto livre) | `abordar.ts:715`, `entrega.ts:229` | frequência, repetição, opt-out, tom. Em `OFF` não roda; em `SHADOW` grava e não muda nada | modos em `SupervisoraConfig` |
| **Interruptor de pânico (reabordagem)** | `reabordagem/interruptor.ts:36` | `executar.ts:158` e **`:208` antes de cada contato** | para a campanha no meio do lote. Mora no **banco**, não em variável de ambiente (variável exigiria redeploy) | **Sim** — falha de leitura = PARADO |
| **Freio entre lotes** | `executar.ts:55` `INTERVALO_MINIMO_ENTRE_LOTES_MIN = 30` | `executar.ts:164` | 40 por lote (`:53`), no máximo 80/h. **Não é `sleep`** — é recusa lida do banco | — |
| **Chave do canal** | `FoocciSalesChannel.ts:125` `canalDeVendasPronto` | toda saída | exige as duas chaves da Meta **e** `FOOCCI_SDR_SEND_ENABLED`. Sem elas, a mensagem fica `PENDENTE` | **Sim** |
| **Chave da recepção** | `recepcao/portasDeEntrada.ts:51` `FOOCCI_RECEPCAO_LIGADA` | `recepcaoDeLeads.ts:205` e `:335` | chave **própria**, separada da do canal: ligar o canal para responder um cliente não autoriza abrir conversa com milhares de contatos antigos. Ausência = **desligada** | **Sim** |
| **Entrada duplicada** | `conversa.ts:92` `registrarEntrada` | webhook | `@@unique(waMessageId)` — a Meta reentrega webhook em rajada. É a trava do Postgres, não um `findFirst` | **Sim** |
| **Assumir o lead** | `responsavel.ts:100` | tela | dois SDRs clicando "assumir" no mesmo segundo: um sai com `count: 1`, o outro com `count: 0` e resposta clara | **Sim** |
| **Limpeza de conversas** | `limpeza/limparConversas.ts:115` | rota admin | copia para `ConversaArquivada` e **confere** antes de apagar; se a cópia falhar, nada é apagado. **Nunca apaga** `SiteLead`, `optOutAt`/`optOutCanal`, nem os leads de `CAMPANHA_PAGA` e os códigos de `CODIGOS_PRESERVADOS` (`:49`) | **Sim** |

### As leituras que, por contrato, NÃO podem escrever

- `raioX/raioXDasConversas.ts` — teste de contrato (`raioX/contrato.test.ts`)
  lê o fonte e reprova se ele importar canal, `entregarMensagem`,
  `registrarSaida`, `abordar` ou `ta/`.
- `estadoDaCorrente/estadoDaCorrente.ts` — mesmo molde
  (`estadoDaCorrente/contrato.test.ts`).
- `prospeccao/selecao.ts` — **montar a fila é LEITURA** (`:1-23`). A primeira
  versão criava leads enquanto montava a lista e cinco recarregamentos da tela
  queimavam cem contatos. Materializar é ato separado: `:589` `materializarLead`.
- `reabordagem/selecao.ts` — só lê.

---

## 3. QUEM É DONO DE QUÊ (`.claude/agents/`)

São **14 agentes**: 12 especialistas + 2 cargos (`diretor`, `pm`).

| Agente | Responde por | Toca a sala comercial? |
|---|---|---|
| `cerebro` ⭐ | raciocínio, portões, verdade/snapshot, escada SHADOW→ALLOWLIST→WIDE, motores de IA, perfis de agente | **Sim, de lado** — o TA e a Supervisora são raciocínio de agente; `matrizDeVerdade.ts` é dele por natureza |
| `canais` | WhatsApp (Evolution e Meta Cloud), Instagram, Google, roteamento de mensagem, saúde do número, anti-bloqueio | **Sim** — `FoocciSalesChannel`, o webhook, `familiasDeErroDaMeta`, o tier da Meta |
| `meta` | **a chave**: App ID/Secret, permissões, App Review, tokens, registro de número, templates na Meta | **Sim** — `ModeloDeVendas`, `modelosDaMeta.ts`, `sincronizarModelos.ts`, todo `META_*` de erro |
| `crm` | campanhas, segmentação, cupons, níveis, atribuição de receita — **do restaurante** | **Não.** É a outra casa (§0) |
| `garcom` | a voz que fala com o **cliente final** do restaurante | **Não** |
| `operacao` | cardápio → pedido → pagamento → comanda → nota fiscal | **Não** |
| `interface` ⭐ | como a tela fica; dono do `DESIGN.md`; tokens, responsivo, estados obrigatórios | **Sim** — todas as telas de `/comercial` |
| `experiencia` ⭐ | se a tela **funciona** para quem usa: controle que mente, número em que não se pode confiar, passo que sobra | **Sim** — é o agente certo para todo "não medido" virar tela honesta |
| `qualidade` ⭐ | portões, golden sets, simuladores, varreduras, CI. **Sem permissão de escrita, de propósito** | **Sim** — é quem duvida dos testes listados em §4 |
| `seguranca` ⭐ | rota pública sem autenticação, webhook que aceita qualquer chamador, segredo que nunca rotacionou | **Sim** — os segredos das rotas `cron/*` e `admin/comercial/*` |
| `manual` | guias do lojista, assistente do widget, sync noturno | **Não** |
| `agencia` | a esteira de agência (SDR de marketing → PM de mídia → Oficina) | **Não** — e cuidado: "SDR" ali é outro SDR |
| `diretor` (cargo) | enquadrar o pedido, decidir trade-off, inspecionar o artefato, dar aceite, falar com o CEO | — |
| `pm` (cargo) | quebrar em tarefas com dono, prazo e critério de aceite; montar o despacho | — |

⭐ = um dos cinco **Essenciais** (constituição: `dioli-brain-kit/docs/23-constituicao-dos-essenciais.md`).

### ⛔ O achado que pesa mais nesta seção

**NENHUM dos 14 agentes declara a sala comercial como domínio.** Medido:
`grep -rn "salaDeVendas\|foocci-sdr\|sala de vendas" .claude/agents/*.md`
devolve **uma única ocorrência**, e ela é a palavra "comercial" solta no meio de
uma frase de `garcom.md:27`. Ver buraco **B-01**.

---

## 4. OS BURACOS ENCONTRADOS

> Cada item traz **arquivo e linha**. O que não foi medido está escrito como
> "não medido" — não é convite a supor.

### B-01 · ⛔ A sala comercial não tem dono declarado entre os agentes

**Medido:** os 14 arquivos de `.claude/agents/` não citam `salaDeVendas`,
`foocci-sdr`, `sales` nem `meta-leads` em nenhuma tabela de domínio. `crm.md:26`
aponta para `src/services/crm/` — que é o CRM **do restaurante**, a outra casa.
`CLAUDE.md:?` (tabela "Os especialistas desta casa") lista doze linhas e nenhuma
diz "comercial da Foocci".

**Efeito:** o maior subsistema do repositório (≈65 mil linhas em
`src/services/salaDeVendas/**` sozinho) é despachado por eliminação, e a
armadilha é nominal: quem lê "CRM" acha que é do `crm`, e o `crm` vai mexer no
CRM errado. A fronteira `meta` × `canais` está escrita com cuidado no `CLAUDE.md`;
a fronteira **comercial da Foocci × CRM do restaurante** não está em lugar
nenhum de `.claude/agents/`.

### B-02 · ⛔ Quem já estava na base e levanta a mão NÃO ganha relógio de SLA

O relógio (`slaVenceEm`) nasce em `SiteLeadService.ts:322` — mas **só no ramo
que cria ficha nova**. Medido em `SiteLeadService.capture`:

- **ficha nova** (`:322`, dentro do objeto `base`) → grava `slaVenceEm`. ✅
- **ficha que já existia** (ramo `if (existente)`, `:96-150`) → o `update`
  grava `consentAt: agora` e **não toca em `slaVenceEm`**. ❌

E é exatamente por aí que passa o lead pago:
`meta-leads/importarMetaLead.ts:280` chama `SiteLeadService.capture`; quando o
telefone já existe na base fria, `capturado.duplicado` é `true`, a ficha é
**promovida** a lead (`:293` `promoverFrioParaLead`) e a fonte vira
`CAMPANHA_PAGA` (`:313`). Em nenhum desses três passos alguém escreve
`slaVenceEm`. `prospeccao/selecao.ts:589` `materializarLead` também não escreve
— e nesse caso é de propósito (lista fria não é alguém a quem devemos resposta),
mas a promoção **deveria** ligar o relógio e não liga.

**Efeito:** o contato de lista fria que preenche o formulário do anúncio —
ou seja, quem acabou de levantar a mão depois de ter sido abordado a frio, o
lead mais caro e mais quente da casa — entra no funil **sem prazo de primeira
resposta**. `distribuicao.ts:434` `leadsComSlaEstourado` filtra por
`slaVenceEm: { not: null, lt: agora }`: ele **nunca aparece como atrasado**.
É a mesma classe de defeito que `prazoDaPrimeiraResposta.ts:6-12` descreve como
corrigida — corrigida para quem chega novo, não para quem é promovido.

**Onde consertar:** ou no ramo duplicado de `SiteLeadService.capture`, ou
chamando `marcarPrazoDePrimeiraResposta` (`recepcao/prazoDaPrimeiraResposta.ts:66`,
que já é idempotente por `where: { slaVenceEm: null }`) depois da promoção em
`importarMetaLead.ts`. **Não conserte nos dois** — duas definições do mesmo
relógio é o defeito que este repositório nomeia em meia dúzia de arquivos.

**Não medido:** quantos leads existem hoje com `fonte = CAMPANHA_PAGA` e
`slaVenceEm = null`. A conta está construída em `estadoDaCorrente.ts:626-628` e
nunca foi rodada por agendador (ver B-03).

### B-03 · ⛔ Duas rotas de cron existem e nada as chama

**Medido:** `grep -rln "raio-x-conversas\|estado-da-corrente" .github/workflows/`
devolve **nenhum arquivo**.

- `src/app/api/cron/comercial/raio-x-conversas/route.ts` — sem agendador.
- `src/app/api/cron/comercial/estado-da-corrente/route.ts` — sem agendador.

Os quatro workflows comerciais que existem são `comercial-recepcao.yml`,
`prospeccao-rodada.yml`, `prospeccao-pre-voo.yml` e `prospeccao-interruptor.yml`.

**Efeito:** a leitura que responde a pergunta do CEO — *"o lead que entrou foi
abordado e alguém vendeu um plano pra ele?"* (`estadoDaCorrente.ts:5-7`) — só
existe se um humano chamar a URL à mão. Peça pronta, ninguém chamando: é
literalmente o defeito que `recepcaoDeLeads.ts:8` nomeia como *"o lugar em que
esta casa já se machucou três vezes"*.

### B-04 · ⛔ Contradição doutrina × código: "nenhum código escreve `slaVenceEm`"

**Arquivo:** `src/services/salaDeVendas/telas/roteamento.ts:150` e `:266`.

Os dois textos afirmam, **na tela**, que *"nenhum código da casa escreve nessa
coluna"* / *"o que falta é alguém preencher `slaVenceEm` na entrada do lead"*.
Isso deixou de ser verdade em 18/09/2026, quando
`recepcao/prazoDaPrimeiraResposta.ts` e `SiteLeadService.ts:322` passaram a
escrever. O próprio `estadoDaCorrente.ts:755` já registra a data da mudança.

**Efeito:** a tela de roteamento ensina a operação a não confiar num número que
hoje é confiável para 3 das 4 portas de entrada — e esconde o buraco real, que
é B-02 (a porta que de fato continua sem escrever). Régua verde e régua
vermelha trocadas de lugar.

### B-05 · ⛔ A janela de sábado foi decidida e nenhum agendador a alcança

**Ordem do CEO, 18/09/2026** (transcrita em `janelaComercial.ts:8-12`):
sábado 09:00–14:00 é janela de abordagem.

**Medido nos agendadores:**
- `.github/workflows/comercial-recepcao.yml:26` → `cron: "*/20 11-23 * * 1-5"`
- `.github/workflows/prospeccao-rodada.yml:19` → `cron: "0 12 * * 1-5"`

Os dois param em **sexta** (`1-5`). O código de `janelaComercial.ts:95` libera
sábado; nenhuma rodada automática existe para usá-lo.

**Efeito:** a janela de sábado só é alcançável por "abordar agora" ou pela
reabordagem, que são atos manuais. A trava está certa e o relógio que a usaria
não existe — a decisão do CEO está implementada pela metade.

**Observação de fuso, medida:** `*/20 11-23 * * 1-5` em UTC é 08:00–20:00 em São
Paulo. A faixa das 08:00–08:59 cai **fora** da janela (que começa às 09:00), e
essas rodadas são recusadas pelo portão com `FORA_DA_JANELA` — desperdício, não
risco.

### B-06 · Dois interruptores com o mesmo nome, e um não liga nada

**Arquivo:** `src/services/salaDeVendas/matrizDeVerdade.ts:17-27` — e este é um
buraco **já documentado pela própria casa**, repetido aqui porque quem for mexer
em `/comercial/agentes` vai tropeçar nele:

`AgentProfile.isRuntimeEnabled` **não liga nada em produção**. Nasce `false`,
e os três lugares que o leem ou só exibem (`agentesComerciais.ts:244`,
`painelDeDepartamentos.ts:241`) ou estão atrás de flag desligada
(`AgentProfileService.ts:293`). Quem faz o TA falar é `SdrIaConfig.ligado` —
outra coluna, outra tabela, outra tela.

A tela `/comercial/agentes` mostra **nove cartões**; são **duas** inteligências
de fato (`matrizDeVerdade.ts:6-8`).

### B-07 · Teste da recepção passa com a Supervisora mockada inteira

**Arquivo:** `src/services/salaDeVendas/recepcao/oLeadQueChegaSozinho.test.ts:51`

```
vi.mock("@/services/salaDeVendas/supervisora/adequacaoDoTemplate", () => ({ ... }))
```

O teste prova a corrente recepção → `abordarLead` → envio, mas **substitui a
trava 4 por um dublê**. Verde ali não diz nada sobre a Supervisora barrando ou
liberando o momento de uma recepção automática.

**Não é erro grave** — o mesmo arquivo usa a trava de repetição de verdade, e
`reabordagem/naoRepete.test.ts:18` e `executar.e2e.test.ts:28` exercitam
`reservarEnvio` real contra banco falso. Fica registrado porque a pergunta
obrigatória desta casa é *"o teste alcança o código que responde ao cliente?"*,
e para a Supervisora, na recepção, a resposta é **não**.

### B-08 · Número que ninguém escreve: `FOOCCI_SDR_MODELO_ABORDAGEM`

**Arquivo:** `src/services/salaDeVendas/abordar.ts:130-142` · `modeloConfigurado`.

A própria função declara (`:126-128`): *"Mantido para conferências/rotinas
legadas. O envio real não usa mais este valor."* Ela continua exportada e é
importada por `foocci-sdr/modelosDaMeta.ts:38`.

**Efeito:** existe uma variável de ambiente com cara de interruptor de modelo
que não escolhe modelo nenhum. Quem a setar acreditando ter trocado o texto da
abordagem não terá trocado nada — mesma família do B-06.

**Não medido:** se `FOOCCI_SDR_MODELO_ABORDAGEM` está setada em produção. As
variáveis do Railway vêm ocultas (`estadoDaCorrente.ts:11-15`); só uma chamada
de dentro do processo responde — e a rota que responderia é a de B-03.

### B-09 · Elo previsto e não construído: seis critérios de roteamento

**Arquivo:** `src/services/salaDeVendas/telas/roteamento.ts:140-160`.

O desenho do CEO (tela 07,
`reestruturação da área comercial do FOOCCI/especificacao-visual/01-TELAS.md`)
pede oito critérios de roteamento. O código declara, por escrito, que **seis não
existem**: produto/interesse, região/idioma, valor potencial, carteira, VIP
(`prioritario` é lido só para ordenar lista) e fallback.

Isto **não é defeito**: está honestamente declarado como "previsto, não
construído", que é exatamente o que `00-MOLDURA-COMUM.md:14-22` manda fazer.
Fica listado para que ninguém o descubra de novo do zero.

### B-10 · Elo previsto e não construído: a descoberta automática de empresas

**Arquivo:** `01-TELAS.md`, tela 14 (Hunter IA).
*"A descoberta automática NÃO EXISTE — depende de fonte de dados contratada."*
O que existe é planilha importada (`prospeccao/lerPlanilha.ts`) e base fria.
A política proíbe raspar o Maps.

**Não medido:** nada aqui foi verificado contra código novo; é a leitura do
próprio documento de especificação, que é a fonte declarada.

### B-11 · Contradição de escopo: `docs/crm/jornada-desenhada-pelo-ceo.md`

O documento traz, na tabela "regras de proteção do envio", **900/dia**, janela
**11h–20h** e **fim de semana permitido**. A sala comercial da Foocci usa
**2.000/24h** (`freioDeRitmo.ts:51`), **09h–20h** e **domingo nunca**
(`janelaComercial.ts:88-96`).

**Não são contraditórios: são casas diferentes** (§0). Está listado aqui porque
os dois arquivos falam de "limite de envio" e de "janela" com as mesmas
palavras, e um agente que leia o segundo achando que vale para o primeiro
afrouxa a janela de domingo sem perceber. **Quem mexer em janela: confira em
qual das duas casas está.**

### B-12 · A soma das audiências do CRM não fecha (medido, e é da outra casa)

`docs/crm/jornada-desenhada-pelo-ceo.md` registra: base de **5.479 clientes**,
audiências somando **~17.800**, "Siga nas redes" declarando **5.416** sozinha.
Parte é legítima (gatilho independente); **o resto não foi medido**.
Dono: agente `crm`. Fica aqui só para não se perder.

---

## 5. A régua para quem for mexer

1. **Existe UM caminho de abordagem** (`abordar.ts:483`) e **UM de fala livre**
   (`entrega.ts:134`). Caminho novo de saída é defeito, não recurso.
2. **`natureza` e `quemMandou` não têm valor padrão**, de propósito: chamador
   novo não compila sem declarar se está abordando ou respondendo.
3. **Ausência de informação não é informação.** Zero e "não medido" produzem
   telas idênticas e decisões opostas. Todo número sem fonte sai `null` com o
   motivo (`raioX`, `estadoDaCorrente`, `painel`, `telas/roteamento`).
4. **Prompt é aviso; código é trava.** As travas que importam são `@@unique` e
   `updateMany` condicional no Postgres, nunca um `if` antes de um `await`.
5. **Antes de aceitar qualquer conserto:** *o teste alcança o código que responde
   ao cliente?* Régua verde sobre o componente errado é pior que régua nenhuma.
6. **Janela barra iniciar, nunca responder.** Se for pendurar `podeAbordarAgora`
   em lugar novo, a pergunta é: **quem começou a conversa?**
7. **Nunca vender como pronto o que está em piloto.** Vários elos desta sala
   estão atrás de chave do dono (`FOOCCI_SDR_SEND_ENABLED`,
   `FOOCCI_RECEPCAO_LIGADA`) e **ligar é ato humano**.
