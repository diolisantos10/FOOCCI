# Dados, APIs, integrações e permissões

## Decisão de arquitetura

`SiteLead` continua sendo a entidade comercial. Conversas de prospects devem ter tabelas próprias e **não** reutilizar `Customer`, `Conversation` ou `Message` dos restaurantes.

Modelo aditivo sugerido:

- `FoocciSalesConversation`: lead, estado operacional, canal, responsável humano, modo atual, timestamps e versão de lock.
- `FoocciSalesMessage`: conversa, direção, autoria, conteúdo/mídia, providerMessageId único, status, erro sanitizado e timestamps.
- `FoocciSalesHandoff`: origem/destino, motivo, solicitado/reconhecido/expirado e atores.
- `FoocciSalesTask`: tipo, título, vencimento, responsável, status, resultado e vínculo ao lead.
- `FoocciInternalUser` ou integração equivalente ao mecanismo de autenticação existente: identidade interna, papel, ativo e auditoria.
- `FoocciSalesAuditEvent`: ação sensível, ator, entidade, antes/depois seguro e correlação.

Nomes finais podem se adequar às convenções do schema, mas as fronteiras e invariantes são obrigatórias.

## Invariantes

- `providerMessageId` único garante idempotência.
- Um lead pode ter histórico contínuo e, se necessário, mais de uma conversa lógica sem perder mensagens.
- Apenas um modo envia por vez: IA ou humano.
- Assumir/devolver usa transação e controle de concorrência.
- Mensagem recebida persiste antes de qualquer resposta.
- Falha de envio nunca apaga a intenção nem cria falso sucesso.
- Notas internas nunca são enviadas ao WhatsApp.
- Eventos e mensagens são append-only; correções geram novo evento.
- Telefone normalizado, opt-out e consentimento são verificados antes de envio.
- Dados de prospects e dados de restaurantes permanecem isolados.

## APIs esperadas

Sob `/api/admin/vendas/` ou convenção equivalente:

- filas/listagem e dossiê;
- conversa e paginação de mensagens;
- assumir, devolver à IA e reatribuir;
- enviar mensagem;
- alterar etapa;
- tarefas e agenda;
- métricas;
- equipe/configurações protegidas;
- webhook inbound/status do provedor com verificação e idempotência.

Evitar rota monolítica. Validação de entrada, autorização e regras de domínio ficam no servidor/serviço, não no componente React.

## Autenticação e RBAC

O guard atual baseado somente em `ADMIN_SECRET` não é suficiente para consultores. Implementar identidade interna real e sessão segura, reutilizando o stack de autenticação existente quando compatível.

- ADMIN: tudo;
- SALES_MANAGER: operação e gestão comercial;
- SALES_CONSULTANT: operação permitida e leads atribuídos/filas autorizadas;
- SALES_VIEWER: leitura;
- SYSTEM_AI: ator técnico sem login interativo.

Toda rota valida sessão, papel e escopo. Logs devem registrar `userId`, nunca senha/token.

## WhatsApp e segurança

Reutilizar `FoocciSalesInbound`, `FoocciSalesChannel`, `LeadContactSafety` e `LeadParaSondagem`. O canal comercial é do Foocci e separado dos números dos restaurantes.

- manter `FOOCCI_SDR_SEND_ENABLED` como kill switch;
- credenciais somente em variáveis seguras;
- validar assinatura do webhook;
- respeitar janela de atendimento e templates aprovados;
- tratar opt-out imediatamente;
- aplicar rate limit, retries limitados e dead-letter/reconciliação;
- não registrar conteúdo sensível/PII desnecessária;
- LGPD: finalidade, minimização, retenção, exportação e exclusão conforme política.

## Observabilidade

Correlation ID da entrada ao envio, latência, falhas, duplicatas, handoffs, backlog, mensagens presas e alarmes. Métricas técnicas não devem expor o texto integral das conversas.
