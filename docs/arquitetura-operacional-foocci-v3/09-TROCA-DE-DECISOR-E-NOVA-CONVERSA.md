# Troca de decisor e abertura de nova conversa

**Decisão CEO — 15/09/2026**

A prospecção fria da Foocci procura primeiro o interlocutor correto. Um telefone inicial pertence à conta/restaurante, mas não necessariamente ao decisor. Quando surgir um novo número ou cartão compartilhado, o sistema precisa preservar a conta e abrir uma nova conversa vinculada ao novo contato.

## Entidades operacionais

- **Conta/Restaurante**: identidade comercial que permanece durante toda a prospecção.
- **Contato**: pessoa ou canal de WhatsApp pertencente à conta. Uma conta pode ter vários contatos.
- **Conversa**: thread de WhatsApp de um contato. Cada telefone normalizado possui sua própria conversa.
- **Indicação**: vínculo entre contato de origem e contato indicado (`referredBy`), com data, canal e mensagem/origem.

## Regra de troca de contato

Ao receber número ou cartão de contato:
1. extrair nome e telefone somente quando explícitos;
2. normalizar o telefone e deduplicar;
3. preservar a conta/restaurante original;
4. marcar o interlocutor anterior como `NAO_DECISOR` quando isso tiver sido confirmado;
5. criar ou vincular o contato indicado como `DECISOR_INDICADO` — isso NÃO significa `QUALIFICADO`;
6. registrar `referredBy`, data e origem;
7. criar/localizar a conversa do novo telefone;
8. definir a próxima ação como `ABORDAR_CONTATO_INDICADO`;
9. iniciar essa conversa somente por uma forma permitida pela Meta: texto livre se houver janela válida para aquele novo número; fora dela, template APPROVED adequado;
10. quando o novo contato responder, retornar à descoberta de papel (`HUMAN_UNKNOWN_ROLE`) e então qualificar.

## Recuperação das conversas já existentes

A base já abordada deve ser reprocessada pelo último estado conhecido, sem disparo cego:
- sem resposta → aguardar/nurture, sem mensagem adicional imediata;
- resposta humana sem papel conhecido → perguntar pelo responsável comercial;
- automação com menu → selecionar apenas uma opção semanticamente equivalente a humano/atendente/comercial/outros assuntos; nunca adivinhar número ambíguo;
- automação aberta → pedir atendimento humano ou responsável comercial;
- automação sem rota útil → aguardar/fila humana, sem loop;
- contato/número indicado → executar a troca de contato acima;
- opt-out/recusa inequívoca → encerrar e bloquear nova abordagem.

## Guardrails

- Bot nunca é marcado como lead qualificado.
- Uma indicação nunca é tratada como consentimento nem como qualificação.
- Não enviar pitch enquanto o objetivo for localizar o decisor.
- Não contornar a janela/template da Meta ao abrir conversa com número indicado.
- Não sobrescrever o telefone original: contato novo é um novo contato da mesma conta.
- Não criar chats duplicados para o mesmo telefone normalizado.
- Não responder indefinidamente a automações; após tentativa sem progresso, aguardar ou escalar.
- Toda abertura/troca registra autor, origem e próxima ação para auditoria.

## Fluxo canônico

`Conta → contato inicial → bot/humano → localizar decisor → contato indicado → NOVA CONVERSA → confirmar papel → SDR/TA → Consultor`

Essa capacidade pertence ao CRM/Sala Comercial e não cria um novo agente.