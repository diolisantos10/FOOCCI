# Raio-X do que existe e gaps para a v3

**Data:** 25/08/2026 · **Fase 1**

## Método

Auditoria do repositório antes de escrever qualquer linha nova: o que existe, o que serve, o que não serve e por quê. Nada foi apagado; nada foi recomeçado.

## O que já existe e SERVE

| Já existe | Estado | Uso na v3 |
| --- | --- | --- |
| `AgentProfile` + versionamento | maduro, em uso | ficha de agente — **estendida**, não substituída |
| `SiteLead` com `utmSource/Medium/Campaign` + `clickId` + WhatsApp | maduro | porta de entrada do lead da Dioli. **Não se cria outra tabela de lead** |
| `PlanSubscription` / `PlanInvoice` (Mercado Pago) | maduro, em produção | fonte financeira da Foocci. Fatura confirmada = receita |
| `SupportTicket` / `HelpThread` + rota de escalonamento | maduro, em produção | é o Agente de Suporte N1 do departamento 2 |
| `Department` / `Position` / `InternalUser` / `DepartmentMembership` | novo (v1) | reaproveitado; muda a planta, não o motor |
| `InternalAuditEvent` | novo (v1) | trilha de acesso interno |
| `WorkOrder` / `Project` / `Task` / `TaskDependency` | novo (v1) | ordem → backlog → tarefa |
| `Handoff` com aceite atômico | novo (v1), **provado contra Postgres real** | base do handoff IA↔humano da Fase 3 |
| `DomainEvent` append-only por gatilho | novo (v1) | linha do tempo que não se reescreve |
| Sessão interna com HMAC + RBAC de departamento | novo (v1) | perfis renomeados, mecanismo mantido |
| Portão de segurança de rotas admin | maduro | já pegou uma rota nova minha sem guarda |
| `Medida` (medido / não medido / zero provado) | maduro | contrato de indicador da v3 |
| 14 especialistas em `.claude/agents/` | maduro | população de DESENVOLVIMENTO — não é departamento |

## O que existe e NÃO serve

| Entidade | Por que não serve |
| --- | --- |
| `Conversation` | tem `restaurantId` obrigatório: é a conversa do restaurante com o cliente **dele**. Prospect da Foocci não tem restaurante. Usar exigiria inventar um tenant falso |
| `Customer` | é o cliente **do restaurante**, quem faz pedido. Nada a ver com quem quer contratar a Foocci |
| Perfis `GERENTE_GERAL`, `MEMBRO`, `VIEWER` | a v3 define seis perfis nomeados; estes não estão entre eles |

## Gaps — o que falta para cumprir a v3

| # | Gap | Fase |
| --- | --- | --- |
| G-01 | Perfis não batem com os seis oficiais | 2 |
| G-02 | Existem 9 departamentos; a v3 pede 6 | 2 |
| G-03 | Existe cargo de Gerente Geral; a v3 proíbe | 2 |
| G-04 | Cargos não começam com "Agente" | 2 |
| G-05 | Catálogo é o de 37 fichas da v1 | 2 |
| G-06 | Não existe tela de Departamentos e Agentes | 2 |
| G-07 | Não existe lead comercial da Foocci como entidade de funil | 3 |
| G-08 | Não existe conversa comercial (prospect) | 3 |
| G-09 | Não existe etapa de funil comercial nem histórico dela | 3 |
| G-10 | Não existe responsabilidade pelo lead ("quem atende agora") | 3 |
| G-11 | Não existe Sala de Vendas | 3 |
| G-12 | Não existe registro de delegação (Diretor → Gerente → agente) | 2 |
| G-13 | Não existe avaliação de qualidade / não conformidade | 4 |
| G-14 | Não existe devolução de conversão para a Dioli | 3 |
| G-15 | Nenhuma rota do Admin exige sessão interna ainda, exceto uma | 2 |

## Achados herdados, ainda abertos

| # | Achado | Impacto |
| --- | --- | --- |
| A-01 | A cadeia de migrações **não replica do zero** | atinge ambiente de teste novo, onboarding e recuperação de desastre. Por isso as migrações são geradas por diferença de schema |
| A-02 | Dois arquivos de teste diferem só na caixa da letra | em Mac ou Windows um sobrescreve o outro no clone, e um teste some sem avisar |
| A-03 | ~750 erros de tipo em ~150 arquivos de teste antigos | o `type-check` da casa exclui teste. O código deste programa é conferido à parte |
| A-04 | O agente de suporte escala para humano — e **não existe humano** | a escalada abre chamado e manda e-mail para um endereço configurado. Se estiver vazio, o chamado é salvo e ninguém é avisado. **Só o CEO consegue verificar** |
| A-05 | Banco criado por `db push` ou `migrate diff` sai **sem o gatilho** de append-only | o Prisma não representa gatilho. O banco parece completo, a aplicação sobe, e `domain_events` aceita UPDATE numa tabela cuja documentação inteira diz que a história não se reescreve. **Fechado**: `npm run db:travas` aplica e confere; o teste da trava reprova quando ela falta |

## Baseline medido antes de mexer

| Medida | Valor |
| --- | --- |
| `tsc --noEmit` | limpo |
| Suíte Vitest | 6.682 testes passando, 514 arquivos |
| `next build` | completo, sem erro |
| Migrações aplicadas em produção | **nenhuma** |
| Agentes ativados | **nenhum** |
