# Comando para o Arquiteto

Copie e envie exatamente o bloco abaixo ao agente Arquiteto responsável pela implementação.

```text
ARQUITETO — CONSTRUA A SALA DE VENDAS E A FUNDAÇÃO OPERACIONAL DO FOOCCI.

Repositório: diolisantos10/FOOCCI
Branch de origem: claude/sala-de-vendas-levantamento
Fonte canônica: docs/arquitetura-operacional-foocci-v1/
Levantamento existente: docs/sala-de-vendas-levantamento.md

Antes de codificar, leia TODOS os arquivos da fonte canônica na ordem indicada em 00-LEIA-PRIMEIRO.md e audite o código real citado. A documentação define as invariantes; o código existente define nomes e compatibilidades. Se houver divergência, preserve dados e comportamento, registre a decisão em ADR e escolha a alternativa aditiva mais segura.

OBJETIVO
Entregar dentro do admin atual uma Sala de Vendas para leads capturados em campanhas e atendidos pelo WhatsApp, com SDR IA e SDR humano compartilhando a mesma conversa, CRM, funil, tarefas, handoff e auditoria. O SDR pertence a Vendas e Receita > Pré-vendas.

OBRIGATÓRIO
1. Reaproveitar SiteLead, Foocci CRM, funil e serviços comerciais existentes.
2. Manter o funil macro NOVO, CONTATADO, QUALIFICADO, PROPOSTA, FECHADO e PERDIDO.
3. Criar armazenamento comercial próprio para conversas/mensagens; não reutilizar Customer/Conversation/Message dos restaurantes.
4. Implementar identidade interna e RBAC real no servidor para ADMIN, SALES_MANAGER, SALES_CONSULTANT e SALES_VIEWER.
5. Construir /admin/vendas com visão geral, conversas, funil, agenda, equipe e configurações conforme permissão.
6. Implementar histórico único, autoria clara, status reais de mensagem, dossiê, tarefas e próximo passo.
7. Implementar estados QUEUED, AI_ACTIVE, HANDOFF_REQUESTED, HUMAN_ACTIVE, WAITING_LEAD e RESOLVED, ou nomes equivalentes com as mesmas invariantes.
8. “Assumir” deve ser atômico e silenciar a IA antes do próximo envio; “Devolver para IA” deve ser explícito e auditado.
9. Reutilizar FoocciSalesInbound, FoocciSalesChannel, LeadContactSafety, LeadParaSondagem e diário/entrevista SDR.
10. Preservar FOOCCI_SDR_SEND_ENABLED como kill switch. Quando desligado, mostrar envio indisponível sem simular sucesso.
11. Implementar opt-out, consentimento, assinatura de webhook, idempotência por providerMessageId, janela/template, rate limit, retry controlado e observabilidade sem PII.
12. Seguir a identidade Foocci: branco, preto, cinza, laranja #F97316 para CTA, Inter, layout limpo e responsivo.
13. Fazer migrações aditivas, commits pequenos e testes unitários, integração, concorrência, E2E, RBAC e acessibilidade.
14. Executar as fases de 06-PLANO-DE-CONSTRUCAO.md em ordem, apresentando evidências/gates ao fim de cada fase.

PROIBIDO
- criar outro repositório ou um CRM paralelo;
- apagar ou reescrever dados existentes;
- misturar prospects com dados de restaurantes;
- confiar apenas em menu oculto para autorização;
- ativar envio/IA em produção;
- inserir segredos;
- enviar mensagens reais;
- submeter templates Meta;
- tocar no WhatsApp dos clientes;
- fazer deploy ou merge automático.

ENTREGA
Abra uma branch própria a partir de claude/sala-de-vendas-levantamento e um PR não-draft. Inclua resumo arquitetural, ADRs, migrações e rollback, variáveis necessárias sem valores, screenshots desktop/mobile, comandos executados, resultados dos testes, limitações e checklist integral de docs/arquitetura-operacional-foocci-v1/07-TESTES-E-ACEITE.md. Pare antes de qualquer ativação de produção e solicite revisão do proprietário.
```
