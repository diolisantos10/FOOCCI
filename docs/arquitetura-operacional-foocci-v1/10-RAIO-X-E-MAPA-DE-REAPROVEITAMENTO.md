# Fase 0 — Raio-X do repositório e mapa de reaproveitamento

**Data:** 24/08/2026 · **Branch:** `claude/fase-0-raio-x-e-fundacao`
**Base auditada:** `claude/sala-de-vendas-levantamento` (commit `5ce60f8`)
**Escopo:** schema, rotas, serviços, autenticação, integrações e documentos.
**Produção não foi tocada.** Nenhuma migração foi aplicada nesta fase.

---

## 1. O que o repositório é hoje

| Dimensão | Medida |
| --- | --- |
| Stack | Next.js 14.2.35 · React 18 · TypeScript 5.5 · Prisma 5.16 · Tailwind 3.4 · NextAuth 4.24 · Zod · Vitest |
| Nome do pacote | `crm-restaurante` |
| Arquivos versionados | 2.741 |
| Models no `schema.prisma` | **143** (5.404 linhas) |
| Páginas em `/admin` | 37 |
| Rotas de API em `/api/admin` | ~190, concentradas em `diagnostics` (28), `agents` (28), `training` (23), `crm` (13) |
| Serviços em `src/services/` | 45 diretórios |

O produto vendido aos restaurantes é maduro: 30 models cobrem restaurante, cardápio, pedido, pagamento, fiscal, impressão e entrega. A camada de agentes de IA é a mais desenvolvida do repositório: 27 models cobrem perfil, versão, treino, simulação, avaliação e roteamento.

**O que praticamente não existe é a empresa.** Zero models descrevem colaborador interno, departamento, cargo, ordem de serviço, projeto, tarefa, aprovação, decisão ou handoff.

---

## 2. Três achados que mudam o plano

Nenhum dos três é opinião: cada um tem arquivo e linha.

### 2.1 As quatro entidades que a doutrina manda reusar existem como CÓDIGO, não como tabela

O documento `05-DADOS-APIS-E-PERMISSOES.md` manda "reutilizar `FoocciSalesInbound`, `FoocciSalesChannel`, `LeadContactSafety` e `LeadParaSondagem`".

Elas existem — em `src/services/foocci-sdr/` — mas como **módulos TypeScript**, não como models do Prisma. Uma busca por `FoocciSales` no `schema.prisma` devolve zero.

**Consequência:** o armazenamento próprio de conversas de prospect (`FoocciSalesConversation`, `FoocciSalesMessage`, `FoocciSalesHandoff`, `FoocciSalesTask`, `FoocciSalesAuditEvent`) é **A CONSTRUIR por inteiro**, não adaptação. O que se reaproveita é a lógica de canal, safety e sondagem que já está escrita — o que muda é ganhar persistência.

### 2.2 Não existe identidade interna. O admin inteiro é uma senha compartilhada

`src/lib/admin-auth.ts` documenta a si mesmo com clareza:

> *"Global admin access is gated by `ADMIN_SECRET` env var — no DB user required."*

O model `User` existe, mas é **do restaurante**: tem `restaurantId` obrigatório e `@@unique([email, restaurantId])`. É o funcionário do cliente, não o da Foocci.

**Consequência:** hoje não há como distinguir CEO, Diretor, Gerente e consultor — todos são a mesma senha. Isso torna impossível, na ordem: RBAC por hierarquia e departamento, "Meu Trabalho", responsável por tarefa, autoria de decisão, e a regra do documento 02 de que *"assumir é atômico"* — sem identidade não existe "quem assumiu".

**Este é o bloqueio de raiz da Fase 1.** Nada do núcleo compartilhado é construível antes dele.

### 2.3 A ficha de agente já existe, e é melhor do que o pedido

O CEO pediu "as fichas de cada agente". O model `AgentProfile` já tem exatamente isso, e mais:

`mission`, `objectives`, `responsibilities`, `skills`, `allowedActions`, `forbiddenActions`, `tools`, `knowledgeAreas`, `businessRules`, `safetyRules`, `escalationRules`, `promptInstructions`, `outputRules`, `evaluationCriteria`, `status`, `visibility`.

Tem versionamento (`AgentProfileVersion`), tela viva (`/admin/sala-dos-agentes`) e contrato de tipos (`salaDosAgentes.types.ts`) que já resolve o problema que este programa também teria: o tipo `Medida` **proíbe a tela de escrever zero quando a resposta é "não sei"** — exatamente o critério de aceite do documento 07.

**Consequência:** as fichas dos agentes dos 9 departamentos **estendem** `AgentProfile`. Criar uma segunda tabela de ficha seria a duplicação que o comando proíbe.

Duas lacunas reais nele:

1. **`AgentArea` não conhece os 9 departamentos.** O enum atual é técnico (`WAITER`, `WHATSAPP`, `CRM`, `QA`, `BRANDING`…), não organizacional. Falta o vínculo a `Department`.
2. **Não existe modo `AI` / `HUMAN` / `HYBRID`.** Uma busca por `HYBRID` no schema inteiro devolve 6 ocorrências, nenhuma ligada a agente. Hoje toda ficha presume IA.

E há apenas **4 fichas semeadas** (`waiter`, `crm`, `whatsapp`, `suporte-tecnico`) — contra as dezenas que os 9 departamentos exigem.

---

## 3. Mapa de reaproveitamento

Legenda: **EXISTE** = usar como está · **PARCIAL** = existe e precisa estender · **A CONSTRUIR** = não há nada · **N/A** = fora do escopo do Foocci.

### 3.1 Núcleo compartilhado (Fase 1)

| Capacidade | Estado | Onde está hoje | Lacuna | Ação |
| --- | --- | --- | --- | --- |
| Identidade interna | **A CONSTRUIR** | `src/lib/admin-auth.ts` (`ADMIN_SECRET` único) | sem usuário interno; `User` é do restaurante | `InternalUser` + sessão sobre o NextAuth existente |
| Sessão segura | **PARCIAL** | NextAuth 4.24 + `src/middleware.ts` | funciona para o restaurante, não para a Foocci | segundo provider/escopo interno; não trocar o stack |
| RBAC por hierarquia | **A CONSTRUIR** | enum `Role` existe, mas é do restaurante | sem papel interno nem escopo departamental | `Role`/`Permission`/`Scope` internos, validados no servidor |
| Departamentos e cargos | **A CONSTRUIR** | — | zero models | `Department`, `Position`, `DepartmentMembership` |
| Ficha de agente | **PARCIAL** | `AgentProfile`, `AgentProfileVersion`, `/admin/sala-dos-agentes` | sem `Department`, sem modo AI/HUMAN/HYBRID, sem gestor | estender (ADR-002) |
| Ordem de serviço | **A CONSTRUIR** | — | `BuildCommand` é comando de build por WhatsApp, não OS | `WorkOrder` novo, reusando o padrão de risco/confirmação do BuildOS |
| Projetos e tarefas | **A CONSTRUIR** | `BuildProject` é repositório-alvo de build, não projeto de trabalho | — | `Project`, `Task`, `TaskDependency` |
| Aprovações | **PARCIAL** | `BrainChangeRequest`, `OperationalManualChangeRequest`, `AgentImprovementProposal` | três filas separadas, cada uma com o seu formato | fila única de aprovação; as três viram origens |
| Decisões executivas | **PARCIAL** | `OperationalManualDecisionLog` | só cobre o manual | `Decision` transversal |
| Handoffs | **A CONSTRUIR** | — | — | `Handoff` com dossiê, aceite e SLA |
| Notificações | **A CONSTRUIR** | — | — | `Notification` + preferências |
| Eventos de domínio e auditoria | **PARCIAL** | `BuildCommandEvent`, `MenuEvent`, `AIInteractionLog`, `CRMActionLog` | por módulo, sem trilha comum append-only | `DomainEvent` transversal |
| Indicador com fonte e "não medido" | **EXISTE** | `salaDosAgentes.types.ts` → tipo `Medida` | usado só na Sala dos Agentes | promover a contrato do programa (ADR-003) |
| Feature flags sem segredo | **EXISTE** | `FOOCCI_SDR_SEND_ENABLED`, `InfraCredential` | — | manter; não replicar segredo |

### 3.2 Departamentos

| # | Departamento | Estado | O que já existe |
| --- | --- | --- | --- |
| 1 | Marketing & Growth | **PARCIAL** | `Campaign`, `CampaignExecution`, `TrackingLink`, UTMs completos no `SiteLead`, `site-analytics` |
| 2 | Vendas e Receita | **PARCIAL** | `SiteLead` + `SiteLeadInteraction` + enum `SiteLeadStage` **idêntico ao funil canônico**; `foocci-crm`, `foocci-sdr`, `SdrDiarioTurno`, `SdrEntrevista`, `MeetingSlot`, `/admin/foocci-crm`, `/admin/leads` |
| 3 | Implantação e Onboarding | **PARCIAL** | `RestaurantOnboardingStatus`, `ImportJob`, `ImportMappingTemplate` |
| 4 | Sucesso e Suporte | **PARCIAL** | `SupportTicket`, `HelpThread`, `HelpMessage`, `HelpAttachment`, `/admin/support-inbox` |
| 5 | Produto e Experiência | **A CONSTRUIR** | nada de discovery, evidência, backlog ou roadmap |
| 6 | Agentes e Inteligência | **EXISTE** | 27 models; `/admin/sala-dos-agentes`, `/admin/brain`, `BrainShadowLog`, `BrainEngineRouting`, `AgentTraining*`, `AgentSimulation*`, `WaiterRuntimeVersion` |
| 7 | Tecnologia e Operações | **PARCIAL** | `IntegrationConfig`, `InfraCredential`, `MetaWhatsAppConfig`, `/admin/preflight`, `/admin/diagnostics` (28 rotas) |
| 8 | Qualidade, Segurança e Compliance | **PARCIAL** | `QualityAuditRun`, `QualityAuditFinding`, `RaioXRun`, `RaioXFinding`, `/admin/quality` |
| 9 | Financeiro e Administrativo | **PARCIAL** | `PlanSubscription`, `PlanInvoice`, `Payment`, `PaymentSettings`, `FiscalDocument`, `/admin/assinaturas` |

**Leitura executiva:** oito dos nove departamentos já têm alguma matéria-prima. Nenhum tem fila, dono, SLA ou indicador de departamento — porque a fundação que carregaria isso não existe. Só **Produto e Experiência** começa do zero.

### 3.3 O que a Sala de Vendas herda de pronto

| Peça | Onde | Observação |
| --- | --- | --- |
| Funil canônico | enum `SiteLeadStage` | `NOVO CONTATADO QUALIFICADO PROPOSTA FECHADO PERDIDO` — **exatamente** o exigido. Não recriar. |
| Consentimento e opt-out | `SiteLead.consentAt`, `consentPolicyVersion`, `optOutAt`, `optOutCanal` | opt-out é terminal por desenho. Reusar, nunca reimplementar. |
| Origem de verdade | `utmSource/Medium/Campaign/Content/Term`, `clickId`, `codigo` | primeiro toque, com código curto que liga o formulário ao "oi" no WhatsApp. |
| Deduplicação | `SiteLead.whatsappDigits` (indexado) | chave de contato normalizada já existe. |
| Kill switch de envio | `FOOCCI_SDR_SEND_ENABLED` | manter como está. |
| Canal, safety e sondagem | `src/services/foocci-sdr/` | lógica existe; falta persistência. |
| Diário e entrevista do SDR | `SdrDiarioTurno`, `SdrEntrevista` | reusar como fonte de qualificação. |

---

## 4. Baseline

Executado nesta fase, sem alterar produção. Baseline que não roda não é baseline, e declarar "verde" sem executar seria a primeira promessa que o código não cumpre — então segue o número:

| Verificação | Resultado |
| --- | --- |
| `npm ci` | ok |
| `prisma generate` | ok |
| `tsc --noEmit` | **limpo**, zero erros |
| `vitest run` | **502 arquivos · 6.558 testes passando · 2 pulados**, em 93s |
| `next build` | **ok**, compilou sem erro |

Esta é a régua contra a qual toda fase seguinte é medida. Fase que baixar este número não passa no gate.

---

## 5. Riscos declarados

1. **O `schema.prisma` tem 5.404 linhas e 143 models.** Somar ~25 models de fundação num arquivo único aumenta o custo de revisão. Ver ADR-004.
2. **`ADMIN_SECRET` continuará válido durante a transição.** Duas portas abertas ao mesmo tempo é risco real; o plano prevê convivência com prazo e fechamento explícito, não indefinida.
3. **A doutrina canônica descreve tabelas que não existem** (item 2.1). Seguir o documento ao pé da letra produziria código apontando para o vazio. Divergência registrada em ADR-001.
4. **Sem conta de teste e sem número de vendas** (as duas pendências já registradas no backlog do Foocci), a Fase 2 não fecha o ciclo com envio real — e não deve mesmo, porque envio real está proibido.

## 6. O que NÃO foi feito nesta fase, de propósito

Nenhuma migração aplicada. Nenhum dado alterado. Nenhuma rota desativada. Nenhuma credencial cadastrada. Nenhum envio. Nenhum deploy. Nenhum merge.
