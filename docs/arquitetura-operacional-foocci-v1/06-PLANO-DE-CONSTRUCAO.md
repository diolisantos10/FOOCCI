# Plano de construção

A execução deve ser incremental. Cada fase termina com testes e evidência antes da próxima.

## Fase 0 — Proteção e baseline

- Ler este pacote, `docs/sala-de-vendas-levantamento.md`, schema e serviços existentes.
- Mapear dependências reais e escrever um ADR curto para decisões que divergirem dos nomes sugeridos.
- Rodar testes/type-check/build atuais e registrar baseline.
- Não alterar comportamento de produção.

## Fase 1 — Identidade, RBAC e dados comerciais

- Implementar identidade interna e papéis.
- Adicionar modelos de conversa, mensagem, handoff, tarefa e auditoria.
- Criar migração aditiva e seed seguro apenas de desenvolvimento.
- Criar serviços de domínio transacionais.
- Proteger APIs atuais do CRM com RBAC compatível.

**Saída:** consultas e mutações testadas, ainda sem envio real.

## Fase 2 — Sala de Vendas humana

- Construir layout/navegação, fila, conversa, dossiê, funil e tarefas.
- Ligar inbound existente à persistência de mensagens comerciais.
- Implementar assumir, reatribuir, timeline e composer.
- Com envio desligado, mostrar o estado corretamente; usar mocks/testes, não produção.

**Saída:** operação humana navegável e auditável.

## Fase 3 — Canal oficial e confiabilidade

- Integrar envio pelo `FoocciSalesChannel`.
- Status de mensagem, webhook verificado, idempotência, retry e reconciliação.
- Templates/janela do WhatsApp e opt-out.
- Observabilidade e painel de saúde.

**Saída:** tecnicamente pronto para ambiente controlado, ainda sem ativação automática.

## Fase 4 — SDR IA em modo sombra

- Conectar entrevista/sondagem/diário ao dossiê e à conversa.
- IA produz sugestão e classificação sem enviar ao lead.
- Avaliar precisão, segurança, completude e handoff em conjunto de casos.
- Versionar prompt/política e registrar modelo/versão, sem armazenar raciocínio privado.

**Saída:** gates de qualidade aprovados por responsável humano.

## Fase 5 — IA ativa controlada

- Habilitar somente por allowlist/ambiente e kill switch.
- Implementar IA ativa, pedido de handoff, assumir atômico e devolver para IA.
- Garantir silêncio imediato da IA durante atendimento humano.
- Escalonar baixa confiança, negociação, pedido humano e temas sensíveis.

**Saída:** piloto controlado com rollback simples.

## Fase 6 — Gestão e handoff de fechamento

- Dashboard, SLA, distribuição, agenda, motivos de perda e métricas por origem.
- Dossiê de fechamento e contrato de handoff para Implantação.
- Relatórios honestos e trilha de auditoria.

## Restrições de entrega

- Não fazer big-bang.
- Não reescrever o CRM funcional.
- Não migrar prospect para tabelas de cliente antes do fechamento e processo definido.
- Não ativar flag de produção, cadastrar segredo, enviar WhatsApp real, submeter template Meta, criar cobrança, fazer deploy ou merge.
- Entregar em commits pequenos e PR com checklist, migração, rollback e screenshots.
