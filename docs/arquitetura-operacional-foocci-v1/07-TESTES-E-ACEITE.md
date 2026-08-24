# Testes e critérios de aceite

## Critérios funcionais

- Lead de campanha entra uma vez, preservando origem/UTM.
- Inbound do WhatsApp aparece na conversa correta com idempotência.
- IA e humano veem o mesmo histórico.
- Humano assume e a IA não envia nenhuma resposta posterior.
- Devolver para IA exige ação explícita e fica auditado.
- Dois humanos tentando assumir geram um vencedor e um conflito claro.
- Funil macro permanece compatível com métricas existentes.
- Toda oportunidade ativa tem responsável ou fila e próximo passo visível.
- Opt-out bloqueia envio e informa o motivo.
- Envio desligado desabilita composer sem simular sucesso.
- Handoff de ganho gera dossiê completo para Implantação.

## Segurança e privacidade

- Acesso direto às APIs sem sessão/papel falha.
- Consultor não acessa escopos não autorizados.
- Prospect não aparece em tabelas/rotas de conversa de restaurante.
- Webhook inválido é rejeitado.
- Token, segredo e PII não aparecem em logs, erros ou bundle cliente.
- Segurança de contato falha fechada.
- Notas internas nunca saem pelo canal.
- Auditoria registra ações sensíveis sem conteúdo excessivo.

## Qualidade técnica

- testes unitários dos estados, funil, segurança e RBAC;
- testes de integração para persistência, transações, webhook e idempotência;
- testes de concorrência para assumir/devolver;
- testes E2E dos fluxos do gerente e consultor;
- type-check, lint, suíte existente e build sem regressões;
- migração sobe e rollback documentado é possível;
- tratamento de loading, vazio, erro, offline e retry;
- responsividade em 375, 768 e 1280 px;
- acessibilidade por teclado, foco, labels e contraste;
- estados sent/delivered/read/failed comprovados por evento, não inferidos.

## Gates antes de IA ativa

Casos avaliados devem incluir saudação, preço, objeção, integração, pedido de humano, opt-out, linguagem hostil, dado sensível, baixa confiança, repetição, fora de escopo e falha do provedor.

A ativação exige:

- zero envio durante modo humano nos testes de corrida;
- zero contato quando safety/opt-out bloqueia;
- handoff correto em todos os casos obrigatórios;
- respostas sem promessa não autorizada;
- kill switch testado;
- plano de monitoramento e rollback documentado.

## Definição de pronto

Código revisável, documentação atualizada, migrações seguras, testes verdes, screenshots das telas e PR aberto. “Pronto” não significa produção ativada: deploy, credenciais, templates e habilitação do canal são decisões separadas do proprietário.
