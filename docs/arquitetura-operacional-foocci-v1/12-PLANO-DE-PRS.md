# Plano de PRs — do raio-x ao aceite dos 9 departamentos

> ⛔ **SUPERADA em 25/08/2026.** A arquitetura oficial da Foocci é a de 6 departamentos, em `docs/arquitetura-operacional-foocci-v3/`. Este arquivo fica para auditoria — não é fonte para construir nada.

**Regra do programa:** um PR revisável por fase ou subfase. Nada de big-bang. Nenhuma fase avança sem o gate do documento 07.

Cada PR carrega, sem exceção: resumo, mapa de reaproveitamento, ADRs, migração e rollback, variáveis necessárias **sem valores**, screenshots desktop e mobile, testes executados, riscos e checklist de aceite.

---

## PR 0 — Raio-X e mapa *(pronto para revisão)*

`claude/fase-0-raio-x-e-fundacao` · **somente documentação, zero código**

Auditoria, mapa de reaproveitamento, 37 fichas de agente, 4 ADRs, status e este plano. Nenhuma migração, nenhum dado tocado.

**Gate:** aceite dos ADRs (D-01) e nomes da hierarquia (D-02).

---

## Fase 1 — Núcleo operacional compartilhado

*Quatro PRs, nesta ordem. Cada um funciona sozinho; nenhum depende do seguinte para não quebrar.*

### PR 1.1 — Identidade interna e RBAC
`InternalUser`, `Department`, `Position`, `DepartmentMembership`, papéis e escopo departamental. Sessão sobre o NextAuth existente. Toda rota nova nasce exigindo sessão interna; `ADMIN_SECRET` não abre o que é novo e passa a deixar rastro (ADR-003).

**Aceite:** gerente de um departamento não enxerga outro; tentativa negada fica em log; `ADMIN_SECRET` continua abrindo o que já abria.

### PR 1.2 — Fichas de agente sobre `AgentProfile`
Estende `AgentProfile` com `population`, `departmentId`, `executionMode` (AI/HUMAN/HYBRID), `ownerPositionId` e `managerPositionId` (ADR-002, emendado por ADR-006 — dono é cargo, não pessoa). Semeia as fichas do documento 11. `/admin/sala-dos-agentes` passa a listar por departamento.

**Aceite:** as 4 fichas existentes continuam funcionando sem alteração; toda ficha nova tem dono humano; nenhuma ficha nasce ativa.

### PR 1.3 — Trabalho: OS, projetos, tarefas e handoffs
`WorkOrder`, `Project`, `Task`, `TaskDependency`, `Handoff` e `DomainEvent` (a linha do tempo imutável, antecipada do PR 1.4 para não existirem duas tabelas de evento). `Comment`, `Attachment` e `Notification` ficaram para o PR 1.4, junto com as telas que os usam — modelo sem tela é tabela morta. Handoff com dossiê, aceite e SLA — o item fica com o emissor até o destino aceitar.

**Aceite:** OS gera projeto e tarefas com responsável e prazo; handoff exige reconhecimento; nada perde histórico.

### PR 1.4 — Governança: aprovações, decisões, eventos e dashboard
Fila única de aprovação (as três filas existentes viram origens dela), `Decision` transversal, `Comment`, `Attachment` e `Notification`. O `DomainEvent` append-only já existe desde o PR 1.3. Dashboard Executivo e "Meu Trabalho". O tipo `Medida` promovido a contrato do programa (ADR-003 do documento 07).

**Aceite:** decisão executiva aparece separada do backlog; **nenhum indicador exibe "0" quando o dado é indisponível** — exibe "não medido" com motivo.

### PR 1.5 — Divisão do schema por domínio *(isolado)*
ADR-004. Movimentação mecânica; **a prova de correção é a migração sair vazia**.

---

## Fase 2 — Vendas e Receita · Sala de Vendas

*A primeira entrega operacional. Três PRs.*

### PR 2.1 — Persistência da conversa comercial
`FoocciSalesConversation`, `FoocciSalesMessage`, `FoocciSalesHandoff`, `FoocciSalesTask`, `FoocciSalesAuditEvent` (ADR-001). `providerMessageId` único. Append-only. Os módulos de `src/services/foocci-sdr/` passam a gravar aqui.

**Aceite:** prospect não encosta em `Conversation`/`Message`/`Customer`; mensagem recebida persiste antes de qualquer resposta.

### PR 2.2 — Sala de Vendas
`/admin/vendas` com fila, conversa e dossiê. Assumir **atômico** com lock e transação. Devolver para IA explícito e auditado. Todos os estados do documento 04, inclusive canal sem credencial, envio desligado, fora da janela de 24h e opt-out com composer desabilitado.

**Aceite:** assumir silencia a IA antes do próximo envio; conflito de duas pessoas assumindo é tratado; **a tela nunca simula envio nem marca entrega sem confirmação do provedor**.

### PR 2.3 — Funil, agenda, métricas e handoff
Kanban sobre `SiteLeadStage` (o enum existente, não um novo). Tarefas, agenda, motivos de perda, dossiê para Implantação.

**Aceite:** métrica sem denominador aparece como "não medido", nunca como 0%.

---

## Fases 3 a 10 — um PR por departamento

Mesma estrutura em todos: modelo de dados → fluxo → permissões → indicadores → aceite. **Nenhum departamento entrega tela vazia.**

| Fase | Departamento | Peça mais pesada |
| --- | --- | --- |
| 3 | Marketing & Growth | atribuição sobre os UTMs que já existem |
| 4 | Implantação e Onboarding | checklist por plano e gate de go-live |
| 5 | Sucesso e Suporte | health score com fatores explicáveis |
| 6 | Produto e Experiência | **começa do zero** — evidência → backlog → roadmap |
| 7 | Agentes e Inteligência | formalizar a governança dos 27 models que já existem |
| 8 | Tecnologia e Operações | incidente, release e runbook com dono |
| 9 | Qualidade e Compliance | gate transversal; nenhuma área assina o próprio desvio |
| 10 | Financeiro | acesso mais restrito do sistema |

---

## Fase 11 — Integração ponta a ponta

Os quatro fluxos do comando, comprovados de ponta a ponta. E2E, carga, segurança, acessibilidade e recuperação. Rota duplicada só é desativada depois da migração comprovada e com rollback pronto.

---

## O que exige o proprietário parar e decidir

Em qualquer fase, o trabalho **para** e volta ao CEO antes de: ativação externa, custo, produção, credencial, Meta, envio real de WhatsApp, cobrança, pagamento, deploy, merge ou mudança irreversível.

Isso não é formalidade. É o que separa "construído" de "ligado" — e neste programa as duas coisas nunca acontecem no mesmo PR.
