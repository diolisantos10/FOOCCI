# Modelo de dados (v3)

> **A regra:** antes de criar tabela, auditar o schema e reutilizar o que já existe. Não duplicar `Customer`, `Lead`, `Conversation`, `User`, `Agent` ou `Campaign` sem justificativa técnica escrita.

## O que JÁ EXISTE e é reaproveitado

| Entidade | O que é hoje | Como a v3 usa |
| --- | --- | --- |
| `AgentProfile` | ficha de agente, com missão, pode/não pode, versão, status | **estendida** com departamento, tipo, dono e população. Não nasce uma segunda tabela de ficha |
| `AgentProfileVersion` | versionamento da ficha | reaproveitado inteiro |
| `SiteLead` | lead do site, **já com** `utmSource`, `utmMedium`, `utmCampaign`, `clickId` e WhatsApp | é a porta de entrada do lead da Dioli. **Não se cria outra tabela de lead do zero** |
| `PlanSubscription` / `PlanInvoice` | assinatura e fatura da Foocci (Mercado Pago) | é a **fonte financeira da Foocci**. Faturamento é fatura confirmada, não fechamento no funil |
| `SupportTicket` / `HelpThread` | chamado e conversa de ajuda do lojista | é o N1 do departamento 2. Já existe e opera |
| `Department`, `Position`, `InternalUser`, `DepartmentMembership` | criados na v1 | **reaproveitados**, com a planta corrigida de 9 para 6 |
| `InternalAuditEvent` | trilha de acesso interno | reaproveitada |
| `WorkOrder`, `Project`, `Task`, `TaskDependency`, `Handoff` | ordem, backlog e passagem de bastão (v1) | reaproveitados inteiros — a v3 muda a planta, não o motor do trabalho |
| `DomainEvent` | linha do tempo append-only, com gatilho no banco | reaproveitada |

## O que NÃO pode ser reaproveitado, e por quê

### `Conversation` **não** serve para a Sala de Vendas

`Conversation` tem `restaurantId` **obrigatório**: ela é a conversa entre o restaurante e o **cliente final dele**. Um prospect da Foocci não tem restaurante — ele ainda **é** o restaurante que talvez assine.

Enfiar prospect ali obrigaria a inventar um restaurante fictício para cada lead. Um tenant falso, no sistema cuja regra número um é não misturar as bases.

**Decisão:** a conversa comercial nasce em tabela própria, e a fronteira é dura:

> **Suporte é de cliente ativo. A Sala de Vendas é de prospect. As duas bases não se cruzam — por desenho e por trava.**

### `Customer` **não** serve para o lead comercial

`Customer` é o cliente **do restaurante** (quem faz pedido). Não tem relação com quem quer contratar a Foocci.

### Os dois CRMs são dois

Exigência expressa do CEO, e é a confusão mais cara possível neste sistema:

| | Cuida de quem | Quem opera |
| --- | --- | --- |
| **CRM comercial** | leads e restaurantes **interessados em contratar** a Foocci | Agente CRM e RevOps (dep. 1) |
| **CRM do produto** | os **clientes dos restaurantes** já clientes | Agente CRM do Produto (dep. 3) |

Misturar os dois faria a Foocci mandar campanha de venda para o cliente final de um restaurante — e faria o funil comercial contar como lead quem já é cliente.

## O que NASCE na v3

Só o que não tem equivalente. Cada tabela nova carrega o motivo.

| Novo | Por que não deu para reaproveitar |
| --- | --- |
| Conversa comercial e mensagem | `Conversation` exige `restaurantId`; prospect não tem |
| Etapa e histórico do funil comercial | não existe funil de venda da Foocci hoje |
| Responsabilidade pelo lead (quem atende agora) | é o que sustenta o handoff IA↔humano sem perda |
| Delegação | registra Diretor → Gerente → agente, com autor e caminho |
| Avaliação de qualidade / não conformidade | o QA de conversa não tem onde gravar hoje |

## Extensões em tabela existente

| Tabela | Campo | Para quê |
| --- | --- | --- |
| `AgentProfile` | `population` | separa agente de produto, de desenvolvimento e da empresa |
| `AgentProfile` | `executionMode` | IA · HUMANO · HÍBRIDO, configurável |
| `AgentProfile` | `departmentId`, `ownerPositionId` | a qual departamento pertence e qual cargo responde |
| `SiteLead` | vínculo com responsável e etapa | o lead da Dioli entra no funil sem virar outra tabela |

## Regras que valem para toda tabela nova

1. **Aditiva.** Zero `DROP`, zero `ALTER` destrutivo. Nenhuma linha existente muda de sentido.
2. **Migração aplicada num banco com a forma da produção** antes de existir — não só gerada.
3. **Nada nasce ligado.** Toda ficha nasce em rascunho, com runtime desligado.
4. **Chave estrangeira que aponta para pessoa ou cargo usa `ON DELETE SET NULL`.** Apagar um departamento não pode apagar o registro do trabalho que existiu ali. O vínculo se perde, o histórico não.
5. **Evento é append-only por gatilho**, não por convenção.

## Um achado herdado, ainda aberto

A cadeia de migrações **não replica do zero**: uma migração de 2025 falha em banco limpo. Não bloqueia hoje — produção existe e está adiante disso — mas atinge ambiente de teste novo, onboarding e recuperação de desastre.

Por isso as migrações desta arquitetura são geradas por **diferença de schema** e testadas contra um banco moldado na forma da produção, e não pela reprodução do histórico.
