# ADR-002 — A ficha de agente estende `AgentProfile`; não nasce uma segunda

**Data:** 24/08/2026 · **Estado:** proposto, aguardando aceite do proprietário
**Fase:** 0 · **Afeta:** Fase 1 (núcleo) e Fase 7 (Agentes e Inteligência)

## Contexto

O comando pede fichas para os agentes dos 9 departamentos, com "nome, função, departamento, gestor, modo AI/HUMAN/HYBRID, capacidades permitidas, status, versão de política e owner humano".

O repositório já tem `AgentProfile`, e ele cobre quase tudo: `mission`, `objectives`, `responsibilities`, `skills`, `allowedActions`, `forbiddenActions`, `tools`, `knowledgeAreas`, `businessRules`, `safetyRules`, `escalationRules`, `promptInstructions`, `outputRules`, `evaluationCriteria`, `status`, `visibility` — com versionamento em `AgentProfileVersion` e tela viva em `/admin/sala-dos-agentes`.

Faltam três coisas: vínculo com departamento, modo de execução e gestor responsável.

Há uma tentação real de criar um `DepartmentAgent` novo "porque o `AgentProfile` é do produto e estes são da empresa". Ceder a ela produziria duas tabelas de ficha, duas telas, dois lugares para procurar quem faz o quê — e a pergunta "esta ficha está atualizada?" passaria a ter duas respostas.

## Decisão

Estender `AgentProfile`, aditivamente:

- `departmentId` → `Department` (nulo para os agentes de produto que não pertencem a departamento);
- `executionMode` → enum `AI` · `HUMAN` · `HYBRID`, com default `AI` (o comportamento de hoje, para nenhuma ficha existente mudar de sentido na migração);
- `ownerInternalUserId` → `InternalUser`, o humano responsável;
- `managerInternalUserId` → `InternalUser`, o gestor na hierarquia.

O enum `AgentArea` **permanece como está** e continua descrevendo a área técnica. Departamento é outra dimensão: um agente da área `CRM` pode pertencer a Vendas ou a Marketing, e forçar as duas coisas no mesmo enum perderia essa distinção.

## Consequências

- Uma ficha só, uma tela só, um lugar para procurar.
- Os agentes de produto (Waiter, CRM, WhatsApp, Analytics) continuam funcionando sem alteração: campos novos são nulos ou têm default.
- O tipo `Medida` de `salaDosAgentes.types.ts` passa a valer para as fichas dos 9 departamentos — inclusive a regra de que **a tela não escreve zero quando a resposta é "não sei"**.
- Fica explícito no schema que uma pessoa executa função: `executionMode = HUMAN` com `ownerInternalUserId` preenchido é uma ficha de gente, não de IA.
