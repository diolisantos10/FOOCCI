# Plano Mestre do Projeto Inteiro do Foocci

## 1. Visão

O Foocci terá um único sistema operacional interno, construído dentro do admin existente. Ele governa a empresa sem duplicar as funções do produto vendido aos restaurantes.

A plataforma organiza:

- pessoas, agentes de IA e times híbridos;
- ordens de serviço, projetos, tarefas e prioridades;
- decisões, aprovações e handoffs;
- operação dos nove departamentos;
- indicadores, auditoria e segurança;
- jornada completa, da geração do lead à retenção do cliente.

## 2. Hierarquia e comando

```
CEO
└── Diretor Foocci
    └── Gerente Geral
        ├── Gerente de Marketing & Growth
        ├── Gerente de Vendas e Receita
        ├── Gerente de Implantação e Onboarding
        ├── Gerente de Sucesso do Cliente e Suporte
        ├── Gerente de Produto e Experiência
        ├── Gerente de Agentes e Inteligência
        ├── Gerente de Tecnologia, Operações e Integrações
        ├── Gerente de Qualidade, Segurança e Compliance
        └── Gerente Financeiro e Administrativo
```

Uma pessoa pode acumular funções no início. O sistema preserva a posição organizacional para permitir crescimento sem reconstrução.

## 3. Fundação compartilhada

### 3.1 Estrutura organizacional

Entidades/capacidades equivalentes a:

- Department;
- Position;
- InternalUser;
- DepartmentMembership;
- AgentDefinition;
- AgentAssignment;
- Role/Permission/Scope.

Cada agente possui nome, função, departamento, gestor, modo AI/HUMAN/HYBRID, capacidades permitidas, status, versão de política e owner humano.

### 3.2 Ordens de serviço e execução

Uma OS nasce de uma solicitação executiva ou departamental e pode gerar um projeto.

Campos mínimos:

- objetivo e resultado esperado;
- solicitante, sponsor, dono e departamento;
- prioridade, prazo e critério de aceite;
- contexto, arquivos, riscos e restrições;
- projetos/tarefas gerados;
- dependências e handoffs;
- status `NOT_STARTED`, `IN_PROGRESS`, `DONE`, `CANCELLED`;
- decisões requeridas;
- timeline imutável.

Não usar “bloqueado” como lista principal. Dependências/impedimentos aparecem dentro do item e as decisões do CEO em área separada.

### 3.3 Aprovações e decisões

Ações: aprovar, rejeitar, solicitar refação, cancelar e comentar. Toda decisão registra autor, papel, horário, versão analisada, justificativa e consequência.

Fila executiva mostra apenas decisões que realmente exigem CEO/Diretor, com recomendação, opções, impacto e prazo.

### 3.4 Handoffs

Todo handoff contém origem, destino, responsável, resumo, evidências, entregáveis, pendências, SLA e confirmação do recebimento. O item permanece com o emissor até o aceite do destino ou regra explícita.

### 3.5 Experiência comum

- Dashboard Executivo;
- Meu Trabalho;
- Departamentos;
- Ordens de Serviço;
- Projetos;
- Aprovações;
- Decisões;
- Relatórios;
- Configurações conforme permissão.

## 4. Departamentos

### 4.1 Marketing & Growth

**Objetivo:** gerar demanda qualificada e rastreável.

Células/agentes:

- estratégia de crescimento;
- mídia paga;
- conteúdo/social;
- campanhas e calendário;
- CRO/landing pages;
- atribuição e analytics.

Capacidades:

- campanha, canal, público, objetivo, orçamento e período;
- briefing, ativos e aprovação;
- UTMs e vínculo com SiteLead;
- gastos/resultados importados de fonte confiável;
- performance por campanha/canal/criativo;
- handoff de lead para Vendas;
- feedback de qualidade e perda recebido de Vendas.

Gate humano obrigatório para publicar, alterar orçamento ou assumir custo externo.

### 4.2 Vendas e Receita

**Objetivo:** transformar demanda em receita.

Células/agentes:

- Pré-vendas: SDR IA, SDR humano e coordenação;
- Fechamento: consultor e closer;
- RevOps: CRM, dados e previsibilidade.

Capacidades completas estão nos documentos 02 a 05: Sala de Vendas, WhatsApp, conversa única IA/humano, funil, agenda, tarefas, proposta, motivos de perda, fechamento e dossiê para Implantação.

### 4.3 Implantação e Onboarding

**Objetivo:** levar cliente ganho ao primeiro valor.

Células/agentes:

- kickoff;
- configuração da conta;
- cardápio/dados;
- canais e integrações;
- treinamento;
- go-live.

Capacidades:

- fila vinda de FECHADO;
- dossiê comercial e validação do vendido;
- checklist por plano/tipo de restaurante;
- responsáveis, dependências e datas;
- coleta de dados e arquivos;
- configuração e testes;
- treinamento e evidência;
- gate de go-live;
- pendências, aceite e handoff para CS.

### 4.4 Sucesso do Cliente e Suporte

**Objetivo:** adoção, retenção, expansão e resolução.

Células/agentes:

- Customer Success;
- suporte N1/N2;
- retenção e expansão;
- voz do cliente.

Capacidades:

- carteira e owner;
- health score com fatores explicáveis;
- adoção, uso, pedidos, incidentes e satisfação;
- check-ins, planos de sucesso e tarefas;
- tickets, conversa, SLA e escalonamento;
- risco de churn, renovação e expansão;
- feedback estruturado para Produto/Qualidade;
- integração com atendimento existente sem misturar prospects.

### 4.5 Produto e Experiência

**Objetivo:** decidir e desenhar o valor do produto.

Células/agentes:

- gestão de produto;
- discovery;
- UX/UI;
- pesquisa;
- documentação/aceite.

Capacidades:

- repositório de evidências;
- problema, hipótese, impacto e segmento;
- backlog e priorização explicável;
- roadmap por resultado;
- requisitos, critérios de aceite e dependências;
- pesquisas, entrevistas, protótipos e testes;
- release outcome e aprendizado;
- rastreabilidade da evidência até a entrega.

Solicitação comercial não vira compromisso automaticamente.

### 4.6 Agentes e Inteligência do Produto

**Objetivo:** garantir qualidade e segurança dos agentes oficiais.

Escopo de produto:

- Waiter;
- CRM;
- WhatsApp;
- Analytics.

Capacidades:

- catálogo de agentes e owners;
- objetivo, limites, ferramentas e fontes;
- prompt/política versionados;
- datasets/casos de avaliação;
- métricas de qualidade, custo e latência;
- shadow, allowlist, rollout e kill switch;
- incidentes, regressões e rollback;
- aprovações para alteração crítica.

O “Cérebro” é governança/orquestração interna. Não aparece como quinto agente comercializado.

### 4.7 Tecnologia, Operações e Integrações

**Objetivo:** construir e manter a plataforma confiável.

Células/agentes:

- engenharia;
- QA técnico;
- plataforma/SRE;
- dados;
- integrações.

Capacidades:

- demandas técnicas ligadas a Produto/OS;
- incidentes, severidade e comunicação;
- mudanças, releases e rollback;
- ambientes e feature flags;
- integrações e saúde;
- observabilidade e SLOs;
- runbooks e ownership;
- dívida técnica e capacidade.

GitHub, Railway, Meta e provedores permanecem fontes externas; o Foocci exibe status/links seguros, não replica seus segredos.

### 4.8 Qualidade, Segurança e Compliance

**Objetivo:** proteger clientes, dados, produto e marca.

Células/agentes:

- qualidade operacional;
- segurança;
- privacidade/LGPD;
- compliance;
- auditoria.

Capacidades:

- registro de risco;
- controles e evidências;
- auditoria e plano de ação;
- incidentes de segurança/privacidade;
- gate de release;
- retenção, exportação e exclusão;
- acessos e revisões periódicas;
- políticas, aceite e exceções com prazo.

### 4.9 Financeiro e Administrativo

**Objetivo:** sustentar economicamente e administrativamente a operação.

Células/agentes:

- contratos;
- faturamento/cobrança;
- contas a pagar/receber;
- orçamento/controladoria;
- compras/fornecedores.

Capacidades:

- cliente, plano, contrato e vigência;
- faturamento e status de cobrança;
- inadimplência e régua autorizada;
- despesas, orçamento e realizado;
- centro de custo por departamento;
- indicadores com fonte confiável;
- aprovações e segregação de função.

A primeira versão registra/governa; pagamentos, fiscal e operações bancárias permanecem externos e exigem autorização humana.

## 5. Fluxos integrados

### Receita

Marketing cria campanha → lead rastreado → SDR qualifica → consultor/closer fecha → Implantação executa → CS assume → expansão volta a Vendas/Financeiro.

### Produto

CS/Suporte registra evidência → Produto avalia/prioriza → Tecnologia constrói → Agentes/IA valida quando aplicável → Qualidade aprova → release → resultado volta a Produto/CS.

### Gestão

CEO cria OS/decisão → Diretor estrutura → Gerente Geral distribui → gerente departamental cascateia → agentes executam → aprovações sobem somente quando necessárias.

## 6. Indicadores executivos

O dashboard não substitui os dashboards operacionais. Deve mostrar:

- demanda, pipeline, receita e conversão;
- clientes em implantação e tempo até go-live;
- saúde, retenção, suporte e expansão;
- roadmap, releases e qualidade;
- agentes/IA: qualidade, incidentes, custo e kill switches;
- riscos de segurança/compliance;
- faturamento, inadimplência, despesas e orçamento;
- OS/projetos por Feito, Em andamento e Não iniciado;
- decisões executivas pendentes.

Todo indicador mostra fonte, período e última atualização.

## 7. Rotas sugeridas

Ajustar às convenções existentes após auditoria:

- `/admin/operacao`
- `/admin/marketing`
- `/admin/vendas`
- `/admin/implantacao`
- `/admin/sucesso`
- `/admin/produto`
- `/admin/agentes`
- `/admin/tecnologia`
- `/admin/qualidade`
- `/admin/financeiro`

Rotas não são autorização. APIs/serviços sempre validam identidade, papel, departamento e escopo.

## 8. Entrega incremental

O projeto inteiro é o destino; a execução é faseada. Cada módulo deve ser funcional quando entregue e compartilhar a mesma fundação. Nenhuma fase pode criar fonte de verdade paralela nem acoplamento que impeça as fases seguintes.
