# Sala de Vendas — UX e fluxos

## Local e navegação

A Sala de Vendas vive dentro do admin atual.

- `/admin/vendas`: visão geral e prioridades.
- `/admin/vendas/conversas`: caixa de entrada unificada.
- `/admin/vendas/funil`: kanban do funil macro.
- `/admin/vendas/agenda`: tarefas, demonstrações e follow-ups.
- `/admin/vendas/equipe`: disponibilidade e distribuição, somente gerente/admin.
- `/admin/vendas/configuracoes`: canal, IA, SLA e políticas, somente gerente/admin.

O CRM atual deve ser incorporado/redirecionado de forma compatível, sem duplicar fonte de verdade.

## Tela principal de conversas

No desktop, usar três regiões:

1. **Fila de leads:** busca, filtros, prioridade, estágio, responsável, SLA e prévia.
2. **Conversa:** histórico único, autoria clara (lead/IA/humano/sistema), status de mensagem, composer e ações Assumir/Devolver para IA.
3. **Dossiê:** contato, origem/UTM, estágio, qualificação, notas, tarefas, próximo passo e timeline.

No celular, as regiões viram navegação progressiva, preservando contexto e ações essenciais.

## Estados obrigatórios

- carregando, vazio, erro recuperável, desconectado;
- canal sem credencial;
- envio global desligado;
- fora da janela de 24 horas/template necessário;
- IA ativa, humano ativo, handoff solicitado;
- mensagem em fila, enviada, entregue, lida e falhou;
- conflito quando outro humano assumiu primeiro;
- opt-out/bloqueado, com composer desabilitado e motivo visível.

A interface nunca deve simular envio ou marcar entrega sem confirmação do provedor.

## Ações

- assumir conversa;
- devolver para IA com objetivo/contexto;
- atribuir/repassar responsável;
- responder, anexar mídia permitida e usar template aprovado;
- mover etapa com motivo quando exigido;
- criar/concluir tarefa;
- agendar demonstração;
- registrar nota interna;
- encerrar/reabrir;
- marcar perda com motivo;
- abrir dossiê completo/auditoria conforme permissão.

## Identidade Foocci

- fundo branco `#FFFFFF`;
- texto/preto `#0B0B0B`;
- cinza de apoio `#E5E5E5`;
- laranja `#F97316` apenas para CTA e destaques importantes;
- tipografia Inter;
- visual limpo, com densidade de ferramenta operacional;
- não usar tema escuro dominante nem excesso de cards;
- no produto, priorizar o anagrama F; mascote é apoio pontual;
- não combinar logo, anagrama e mascote simultaneamente na mesma composição.

## Acessibilidade e responsividade

Teclado, foco visível, rótulos, contraste, regiões semânticas, anúncios de mensagens novas e alvos de toque adequados. Validar ao menos em 375 px, 768 px e 1280 px.
