# Plano de construção do projeto inteiro

A execução é um programa de construção. Cada fase termina com PR próprio, testes, migração/rollback e aceite antes da seguinte.

## Fase 0 — Raio-X e mapa de reaproveitamento

- Auditar schema, rotas, componentes, serviços, autenticação, integrações e documentos.
- Para cada capacidade do plano mestre, classificar: `EXISTE`, `PARCIAL`, `A CONSTRUIR` ou `NÃO SE APLICA`.
- Produzir mapa “capacidade → arquivo/tabela/rota atual → lacuna → ação”.
- Registrar ADRs para decisões estruturais.
- Rodar baseline de testes, type-check e build.
- Não mudar produção.

## Fase 1 — Núcleo operacional compartilhado

- Identidade interna, sessão e RBAC por hierarquia/departamento.
- Cadastro de departamentos, posições, agentes e modo AI/HUMAN/HYBRID.
- Ordens de serviço, projetos, tarefas, dependências, comentários e anexos.
- Aprovações, decisões executivas, handoffs, notificações e auditoria.
- Dashboard executivo e “Meu Trabalho”.
- Eventos e contratos para integrar módulos sem acoplamento direto.

## Fase 2 — Vendas e Receita

- Sala de Vendas completa, CRM, WhatsApp, SDR IA/humano, funil, tarefas, agenda, handoff e métricas.
- Seguir integralmente documentos 02 a 05.
- Primeiro em modo humano/sombra; IA ativa somente após gates.

## Fase 3 — Marketing & Growth

- Campanhas, canais, orçamento, calendário, ativos, UTMs, leads, atribuição e performance.
- Handoff rastreável Marketing → SDR.
- Integrações existentes são adaptadas; não duplicar analytics.
- Aprovação humana para orçamento, publicação e mudanças de campanha.

## Fase 4 — Implantação e Onboarding

- Fila de clientes ganhos, checklist por plano, kickoff, coleta/configuração, importação, treinamento, go-live e pendências.
- Dossiê recebido de Vendas sem redescoberta.
- Gate de ativação e termo de aceite interno.
- Handoff para Sucesso do Cliente.

## Fase 5 — Sucesso do Cliente e Suporte

- Carteira, saúde, onboarding concluído, tickets/escalonamentos, riscos, QBR/check-ins, renovação e expansão.
- Reaproveitar a Central de Conversas/atendimento existente.
- Separar suporte de cliente ativo da conversa comercial de prospect.
- Feedback estruturado para Produto e Qualidade.

## Fase 6 — Produto e Experiência

- Backlog de produto, discovery, hipóteses, evidências, priorização, roadmap, especificações, pesquisa, protótipos e aceite.
- Pedidos recebidos de Vendas/CS/Suporte entram como evidência, não como promessa automática.
- Aprovação executiva para mudança de prioridade estratégica.

## Fase 7 — Agentes e Inteligência do Produto

- Catálogo e governança dos agentes Waiter, CRM, WhatsApp e Analytics.
- Versões de prompt/política, ferramentas permitidas, avaliações, datasets, métricas, incidentes, rollout e rollback.
- “Cérebro” permanece camada interna de orquestração, não agente vendido.
- Ativação por gates e kill switch.

## Fase 8 — Tecnologia, Operações e Integrações

- Demandas técnicas, incidentes, mudanças, releases, ambientes, integrações, observabilidade e capacidade.
- Não reconstruir GitHub/Railway/Meta dentro do Foocci; integrar status e links quando seguro.
- Segredos permanecem no provedor apropriado.
- Runbooks, ownership e rollback obrigatórios.

## Fase 9 — Qualidade, Segurança e Compliance

- Auditorias, riscos, controles, incidentes, LGPD, evidências, planos de ação e aceite de release.
- Quality gates transversais.
- Acesso mínimo, retenção, exportação/exclusão e trilha imutável.
- Nenhuma área aprova o próprio desvio crítico sem revisor autorizado.

## Fase 10 — Financeiro e Administrativo

- Contratos/metadados, planos, faturamento, cobrança, inadimplência, despesas, orçamento e indicadores.
- Integrar fontes financeiras confiáveis; não inventar receita a partir de status comercial.
- Acesso altamente restrito.
- Ações bancárias, fiscais e pagamentos externos exigem confirmação humana e ficam fora da automação inicial.

## Fase 11 — Integração ponta a ponta e governança

- Fluxos Marketing → Vendas → Implantação → CS → expansão.
- Fluxos CS/Suporte → Produto → Tecnologia → Qualidade → release.
- Fluxos Vendas/CS → Financeiro.
- Dashboard executivo com indicadores reais e decisões pendentes.
- Testes E2E, carga, segurança, acessibilidade, recuperação e documentação operacional.
- Desativar rotas duplicadas somente após migração comprovada e plano de rollback.

## Restrições

- Um PR por fase ou subfase revisável.
- Nada de big-bang.
- Não apagar estruturas existentes.
- Não criar tela vazia apenas para “cumprir departamento”.
- Não automatizar decisão crítica sem política e aprovador.
- Não ativar envio, IA, cobrança ou produção automaticamente.
