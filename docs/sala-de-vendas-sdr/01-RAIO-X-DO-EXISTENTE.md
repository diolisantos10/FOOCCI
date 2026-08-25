# 01 — Raio-x do que já existia

> Feito **antes** de escrever qualquer linha, como manda o item 23.1 do comando.
> O schema tinha 156 modelos. A pergunta não era "o que construir" — era "o que
> já está aqui e eu não vi".

## O que foi reusado

Nada foi recomeçado. Estas peças já existiam e passaram a servir à Sala:

| Peça | O que ela já fazia | O que ganhou |
|---|---|---|
| `SiteLead` | lead do site com UTM, consentimento e opt-out | 16 colunas da Sala (score, temperatura, próxima ação, SLA, espelho da última mensagem) |
| `SiteLeadInteraction` | linha do tempo append-only | nada — já servia |
| `InternalUser` / `InternalRole` | os seis perfis da v3 | disponibilidade do SDR |
| Webhook da Meta | já desviava o número de vendas | passou a **gravar** a mensagem |
| `FoocciSalesInbound` | reconhecia o "oi" pelo `#código` | grava a conversa |
| `LeadContactSafety` | opt-out, janela de horário, limite de toques | nada — é o mesmo portão |
| `MeetingSlot` | janelas que o CEO abre no site | continua servindo a isso |
| `InternalAuditEvent` | trilha de auditoria | recebe as negativas da Sala |
| `AgentProfile` + versões | fichas de agente com versionamento | serve de molde ao TA |

## O que NÃO serviu, com o motivo escrito

### `Conversation` e `Message`

**Não servem.** `Conversation.restaurantId` é obrigatório: é a conversa do
restaurante com o cliente **dele**. Um prospecto da Foocci não tem restaurante.

Usá-las exigiria inventar um tenant falso dentro do sistema cuja regra número um
é não misturar as bases — e o preço apareceria na Central de Conversas de algum
lojista, com prospecto da Foocci no meio das conversas dele.

Por isso nasceu `LeadMensagem`.

### `Task`

**Não serve.** `Task` pende de `Project`/`WorkOrder`: é o trabalho interno da
empresa, com dependência, estimativa e ordem de serviço. Um follow-up comercial
pende de um **lead**, some quando o lead fecha, e a pergunta central dele é
"venceu?".

Forçar as duas na mesma tabela encheria o quadro de engenharia de follow-up
comercial e o funil de tarefa de engenharia.

Por isso nasceu `LeadTarefa`.

### `Customer`

É o cliente do restaurante — quem faz pedido. Não tem relação com quem compra o
Foocci.

### `QualityAuditRun` / `QualityAuditFinding`

Auditam a **plataforma**: rodadas de verificação técnica com achados. O QA de
vendas avalia uma **conversa** contra um scorecard de quinze critérios, com
evidência ligada a mensagens. São perguntas diferentes.

## Os gaps que a auditoria encontrou

| # | O que faltava | Onde foi fechado |
|---|---|---|
| S-01 | a mensagem chegava e **não era gravada** | `LeadMensagem` + webhook |
| S-02 | não havia status de entrega para lead | escada de status em `conversa.ts` |
| S-03 | o funil tinha 6 etapas e nenhuma demo | 11 etapas, migração com `CASE` |
| S-04 | perda era texto livre | `MotivoDePerda`, catálogo |
| S-05 | não havia score, nem explicação | `score.ts` + `LeadScoreFator` |
| S-06 | handoff não carregava contexto | `LeadHandoff` com dossiê congelado |
| S-07 | não havia disponibilidade de SDR | `SdrDisponibilidade` |
| S-08 | não havia distribuição | `distribuicao.ts` |
| S-09 | não havia tarefa nem cadência comercial | `LeadTarefa`, `Cadencia` |
| S-10 | não havia agenda de compromissos | `LeadCompromisso` |
| S-11 | não havia QA de conversa | `LeadAvaliacaoQA` + critérios |
| S-12 | não havia painel de gestão | `painel.ts` |
| S-13 | o SDR alcançava **qualquer lead** por URL | `podeVerOLead` |

O S-13 é o mais importante desta lista, e o menos visível: `escopoDaConsulta`
protegia as listas, e a tela de atendimento não busca lista — busca um lead por
id, vindo da URL.
