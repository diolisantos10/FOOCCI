# Funil comercial e handoffs

## Funil macro canônico

Preservar o enum e as métricas atuais:

| Etapa | Dono primário | Critério de entrada | Critério de saída |
|---|---|---|---|
| NOVO | fila/SDR | lead capturado e deduplicado | primeira tentativa válida |
| CONTATADO | SDR | houve contato/tentativa rastreável | qualificação concluída |
| QUALIFICADO | SDR/consultor | aderência e próximo passo confirmados | proposta comercial emitida |
| PROPOSTA | consultor/closer | proposta registrada | ganho ou perda |
| FECHADO | closer | aceite verificável | handoff para implantação |
| PERDIDO | último responsável | motivo registrado | reabertura auditada ou nutrição |

Não multiplicar etapas no enum apenas para controlar a caixa de entrada. O estado da conversa e as tarefas são dimensões independentes.

## Estado operacional da conversa

`QUEUED`, `AI_ACTIVE`, `HANDOFF_REQUESTED`, `HUMAN_ACTIVE`, `WAITING_LEAD`, `RESOLVED`.

Cada transição grava ator, horário, motivo e estado anterior/novo. A transição IA→humano deve usar lock/transação para impedir dupla resposta.

## Jornada ponta a ponta

1. **Campanha/captura:** registra origem, UTMs e consentimento.
2. **Deduplicação:** telefone normalizado é a chave de contato; nunca sobrescrever histórico.
3. **Fila:** prioridade calculada por urgência, SLA, intenção e atividade.
4. **Primeiro contato:** inbound pode receber resposta; outbound depende de template e janela válidos.
5. **Sondagem:** perguntas curtas, dados estruturados e fatos separados de inferências.
6. **Qualificação:** registra aderência, dor, porte, autoridade, urgência e próximo passo.
7. **Demonstração/proposta:** tarefa, horário, proprietário e resultado.
8. **Fechamento:** evidência de aceite, plano/condições autorizadas e motivo de perda quando aplicável.
9. **Handoff à implantação:** dossiê imutável do vendido, contatos, promessa aprovada, integrações e pendências.
10. **Feedback:** Implantação devolve divergências para RevOps/Produto sem apagar o histórico.

## Handoffs obrigatórios

- Marketing → SDR: origem, anúncio, campanha, landing page, UTMs e consentimento.
- SDR → consultor: resumo, diagnóstico, objeções, aderência, participantes e agenda.
- Consultor → closer: escopo demonstrado, proposta, condições e riscos.
- Vendas → Implantação: pacote vendido, decisões, dados do restaurante, dependências e gravações/notas autorizadas.
- Vendas → Marketing: motivos agregados de perda e qualidade por origem, sem exposição indevida de PII.

## SLA inicial parametrizável

Valores não devem ser fixados no código. Configuração inicial sugerida:

- lead inbound novo: alerta imediato; primeira ação em até 5 minutos em horário comercial;
- handoff solicitado: alerta imediato; assumir em até 5 minutos;
- conversa humana sem resposta interna: alerta ao gerente;
- lead sem próximo passo: entra em fila de higiene;
- tarefa vencida: escalonamento ao responsável e, depois, ao gerente.

O administrador pode mudar SLA sem deploy, mantendo histórico de alteração.
