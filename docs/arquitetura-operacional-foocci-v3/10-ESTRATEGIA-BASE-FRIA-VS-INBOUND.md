# Estratégia comercial por origem do lead

**Decisão CEO — 15/09/2026**

A Sala Comercial não trata base fria e inbound como se fossem o mesmo lead.

## Base fria

Objetivo inicial: chegar a uma pessoa responsável/decisora antes de apresentar a Foocci.

`LISTA_PROSPECCAO → template aprovado → bot/menu ou humano → localizar responsável → SDR/TA → Consultor`

- automação nunca é qualificada;
- menu é navegado apenas por opção explicitamente oferecida;
- prioridade: atendente/humano, depois comercial/vendas/outros assuntos;
- sem rota segura: parar, nunca inventar opção nem criar loop;
- resposta humana chega ao TA para descoberta curta;
- contato indicado abre nova conversa comercial e preserva a origem;
- opt-out encerra automação;
- fora da janela da Meta, nova abertura usa template APPROVED aplicável.

## Inbound (formulário/campanha)

O lead já demonstrou intenção. Não precisa passar pelo ritual de localizar decisor como premissa universal.

`FORMULÁRIO/CAMPANHA → WhatsApp/CRM → TA → qualificação → Consultor`

O contexto de campanha, UTM, restaurante, desafio e dados já capturados devem ser reutilizados para evitar perguntas repetidas.

## Regra de prioridade

Inbound que pediu contato tem precedência operacional sobre prospecção fria disponível. A base fria continua em fila própria (`DISPONIVEL_PARA_PROSPECCAO`).

## Regra de qualidade

Volume não substitui condução. O sistema não deve escalar milhares de abordagens frias enquanto respostas, menus e indicações não tiverem próximo passo rastreável.
