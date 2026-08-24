# Testes e critérios de aceite do projeto inteiro

> ⛔ **SUPERADA em 25/08/2026.** A arquitetura oficial da Foocci é a de 6 departamentos, em `docs/arquitetura-operacional-foocci-v3/`. Este arquivo fica para auditoria — não é fonte para construir nada.

## Fundação compartilhada

- Hierarquia e escopo departamental funcionam no servidor.
- CEO/Diretor/Gerente Geral enxergam os escopos autorizados.
- Gerente de departamento administra sua área sem obter acesso indevido às demais.
- Agente humano, IA ou híbrido possui identidade operacional e trilha.
- OS gera projeto/tarefas, responsáveis, prazos, dependências e notificações.
- Aprovação, rejeição, refação, cancelamento e comentário ficam auditados.
- Handoff transfere contexto e exige reconhecimento do destino.
- Decisão executiva aparece separada do backlog e retorna ao fluxo após decisão.
- Dashboard nunca exibe número inventado ou “0” quando o dado é indisponível.

## Aceite por departamento

| Departamento | Evidência mínima |
|---|---|
| Marketing & Growth | campanha/UTM/lead/performance e handoff ao SDR rastreáveis |
| Vendas e Receita | SDR IA/humano na mesma conversa, funil, tarefas e fechamento |
| Implantação e Onboarding | cliente ganho percorre checklist até go-live e handoff a CS |
| Sucesso e Suporte | carteira, saúde, ticket/escalonamento e feedback estruturado |
| Produto e Experiência | evidência vira backlog priorizado, especificação e aceite |
| Agentes e Inteligência | versão, avaliação, gate, rollout, incidente e rollback |
| Tecnologia e Integrações | demanda/release/incidente/runbook com ownership |
| Qualidade, Segurança e Compliance | risco/controle/evidência/plano de ação e gate |
| Financeiro e Administrativo | contrato/plano/faturamento/cobrança com acesso restrito |

## Vendas/WhatsApp

- Lead entra uma vez, preservando origem/UTM.
- Inbound chega à conversa correta com idempotência.
- IA e humano veem o mesmo histórico.
- Assumir silencia a IA antes do próximo envio.
- Devolver para IA é explícito e auditado.
- Opt-out e safety bloqueiam envio.
- Kill switch desligado impede envio sem simular sucesso.
- Prospect permanece separado das conversas dos restaurantes.

## Segurança e privacidade

- Toda API nega sessão, papel ou escopo inválido.
- Acesso financeiro, PII e configurações críticas segue menor privilégio.
- Webhooks inválidos são rejeitados.
- Tokens, segredos e PII não aparecem em logs, erros ou bundle.
- Notas internas nunca saem por canais externos.
- Auditoria é append-only para ações sensíveis.
- Operações irreversíveis exigem confirmação e política.

## Qualidade técnica

- testes unitários de domínio e permissões;
- integração de banco, eventos, handoffs e webhooks;
- concorrência para lock/assunção/aprovação;
- E2E dos fluxos interdepartamentais;
- type-check, lint, suíte existente e build;
- migrações aditivas e rollback documentado;
- loading, vazio, erro, offline e retry;
- responsividade em 375, 768 e 1280 px;
- acessibilidade por teclado, foco, labels e contraste;
- observabilidade sem exposição de conteúdo sensível.

## Gate de cada fase

Uma fase só avança quando possuir:

1. mapa do que foi reaproveitado;
2. código e migração revisáveis;
3. testes verdes;
4. screenshots/evidências;
5. documentação e ADRs atualizados;
6. riscos e limitações declarados;
7. rollback;
8. aceite do proprietário quando houver ativação, custo ou ação externa.

## Definição de pronto do programa

Os nove departamentos estão operacionais sobre a mesma fundação, os handoffs ponta a ponta foram comprovados, não existem fontes de verdade paralelas, RBAC e auditoria cobrem ações sensíveis, e todos os PRs foram revisados. Produção, credenciais, Meta, cobrança e pagamentos continuam exigindo autorização separada.
