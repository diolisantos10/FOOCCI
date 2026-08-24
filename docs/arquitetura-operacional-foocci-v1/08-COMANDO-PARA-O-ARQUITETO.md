# Comando para o Arquiteto — projeto inteiro

Copie e envie exatamente o bloco abaixo.

```text
ARQUITETO — CONSTRUA O SISTEMA OPERACIONAL COMPLETO DO FOOCCI, COM OS 9 DEPARTAMENTOS, AGENTES HUMANOS/IA/HÍBRIDOS E FLUXOS PONTA A PONTA.

REPOSITÓRIO
- Repositório: diolisantos10/FOOCCI
- Branch de planejamento: claude/sala-de-vendas-levantamento
- Fonte canônica: docs/arquitetura-operacional-foocci-v1/
- Plano mestre: docs/arquitetura-operacional-foocci-v1/09-PLANO-MESTRE-DO-PROJETO-INTEIRO.md

MISSÃO
Transforme o admin atual do Foocci no sistema operacional interno completo da empresa. O projeto deve contemplar e integrar:
1. Marketing & Growth
2. Vendas e Receita
3. Implantação e Onboarding
4. Sucesso do Cliente e Suporte
5. Produto e Experiência
6. Agentes e Inteligência do Produto
7. Tecnologia, Operações e Integrações
8. Qualidade, Segurança e Compliance
9. Financeiro e Administrativo

A hierarquia canônica é CEO → Diretor Foocci → Gerente Geral → gerentes de departamento → agentes. Agente é uma função executada por IA, pessoa ou modo híbrido.

ANTES DE CODIFICAR
1. Leia TODOS os arquivos da fonte canônica na ordem definida em 00-LEIA-PRIMEIRO.md.
2. Audite o repositório inteiro relacionado a admin, schema, auth, CRM, atendimento, agentes, restaurantes, pedidos, pagamentos, integrações e analytics.
3. Crie o mapa EXISTE / PARCIAL / A CONSTRUIR / NÃO SE APLICA.
4. Para cada capacidade, indique arquivos/tabelas/rotas existentes, lacuna e ação.
5. Preserve dados e comportamentos. Toda divergência relevante deve gerar ADR.
6. Apresente o plano de PRs/fases antes do primeiro bloco de implementação.

NÚCLEO COMPARTILHADO OBRIGATÓRIO
- identidade interna, sessão e RBAC real por hierarquia e departamento;
- cadastro de departamentos, cargos, membros e agentes AI/HUMAN/HYBRID;
- dashboard executivo e visão “Meu Trabalho”;
- ordens de serviço, projetos, tarefas, dependências, prioridades e prazos;
- comentários, arquivos, notificações e timeline;
- aprovar, rejeitar, solicitar refação, cancelar e comentar;
- decisões do CEO/direção em fila própria, sem confundir com tarefas;
- handoffs interdepartamentais com dossiê, aceite e SLA;
- indicadores com fonte, período, atualização e indisponibilidade explícita;
- eventos de domínio e auditoria append-only;
- configurações e feature flags sem segredo no código.

MÓDULOS OBRIGATÓRIOS
- Marketing: campanhas, canais, orçamento, calendário, ativos, UTMs, leads, atribuição e performance.
- Vendas: CRM, Sala de Vendas, WhatsApp, SDR IA/humano na mesma conversa, funil, agenda, proposta, fechamento e RevOps.
- Implantação: fila de ganhos, kickoff, checklist, configuração, treinamento, go-live e handoff para CS.
- Sucesso/Suporte: carteira, saúde, check-ins, tickets, escalonamento, retenção, expansão e feedback.
- Produto/UX: discovery, evidências, backlog, priorização, roadmap, especificação, pesquisa e aceite.
- Agentes/IA: governança de Waiter, CRM, WhatsApp e Analytics; versões, avaliações, ferramentas, gates, rollout, incidentes e rollback. Cérebro é orquestração interna, não quinto agente vendido.
- Tecnologia/Operações: demandas, integrações, incidentes, releases, ambientes, observabilidade, runbooks e capacidade.
- Qualidade/Segurança/Compliance: auditorias, riscos, controles, LGPD, evidências, planos de ação e gates.
- Financeiro/Administrativo: contratos, planos, faturamento, cobrança, inadimplência, despesas, orçamento e indicadores, com acesso restrito.

FLUXOS PONTA A PONTA
- Marketing → SDR → Consultor/Closer → Implantação → Sucesso/Expansão.
- Suporte/CS → Produto → Tecnologia → Qualidade → Release.
- Vendas/CS → Financeiro.
- CEO → Diretor → Gerente Geral → departamentos, por OS/projeto/tarefas.
Nenhum handoff pode perder histórico, dono, prazo, decisão ou anexo.

REGRAS ESPECÍFICAS DE VENDAS
- Reaproveite SiteLead, Foocci CRM, funil e serviços comerciais existentes.
- Mantenha NOVO, CONTATADO, QUALIFICADO, PROPOSTA, FECHADO e PERDIDO.
- Conversas de prospects usam armazenamento comercial próprio e não tabelas dos restaurantes.
- Assumir é atômico e silencia a IA; devolver à IA é explícito e auditado.
- Reutilize FoocciSalesInbound, FoocciSalesChannel, LeadContactSafety, LeadParaSondagem e diário/entrevista SDR.
- Preserve FOOCCI_SDR_SEND_ENABLED como kill switch.
- Implemente opt-out, consentimento, webhook verificado, providerMessageId idempotente, janela/template, rate limit, retry e observabilidade sem PII.

EXECUÇÃO
- Siga 06-PLANO-DE-CONSTRUCAO.md, da Fase 0 à Fase 11.
- Não faça big-bang: use uma branch e um PR revisável por fase/subfase.
- A Sala de Vendas é a primeira entrega operacional, mas não encerra o programa.
- Cada fase deve reaproveitar capacidades existentes antes de criar novas.
- Não entregue “departamento” como tela vazia: cada módulo precisa de fluxo, dados, permissões, métricas e aceite.
- Cumpra integralmente 07-TESTES-E-ACEITE.md.

IDENTIDADE
Use o Brand Book oficial. Interface branca, preta e cinza, laranja #F97316 apenas para CTA/destaques, Inter, alta legibilidade, sem tema escuro dominante e sem excesso de cards. Priorize o anagrama F no produto; não combine logo, anagrama e mascote na mesma composição.

PROIBIDO
- criar outro repositório, ERP ou CRM paralelo;
- apagar ou reescrever dados existentes;
- misturar prospects e conversas de restaurantes;
- duplicar funcionalidade já existente;
- confiar em menu oculto para autorização;
- inventar números, receita ou integrações;
- colocar segredo em código/log;
- ativar IA, envio, cobrança ou produção;
- enviar WhatsApp real ou submeter template Meta;
- executar pagamento/ação bancária;
- fazer deploy ou merge automático.

ENTREGA DO PROGRAMA
Crie primeiro o plano de execução e o PR da Fase 0/1. Depois prossiga fase a fase, mantendo um índice de progresso em docs/arquitetura-operacional-foocci-v1/STATUS-DA-CONSTRUCAO.md com Feito, Em andamento, Não iniciado e Decisões do CEO. Cada PR deve trazer resumo, mapa de reaproveitamento, ADRs, migração/rollback, variáveis sem valores, screenshots desktop/mobile, testes executados, riscos e checklist de aceite.

Pare e solicite decisão do proprietário antes de qualquer ativação externa, custo, produção, envio, credencial, Meta, cobrança, pagamento ou mudança irreversível. O projeto só termina após a integração e o aceite dos 9 departamentos.
```
