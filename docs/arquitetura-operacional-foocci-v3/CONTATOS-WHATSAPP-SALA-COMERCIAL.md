# Cartões de contato no WhatsApp — Sala Comercial

## Decisão
Cartão de contato é uma capacidade transversal da Sala Comercial, não um novo agente.

## Recebimento
Quando um contato abordado disser que não é o decisor e enviar um cartão, o sistema deve:
1. preservar o restaurante/conta e o contato original;
2. registrar o contato original como `NAO_DECISOR`;
3. criar/vincular o novo contato como `DECISOR_INDICADO`, guardando a origem da indicação;
4. não marcar nenhum dos dois como qualificado apenas pela indicação;
5. devolver o novo decisor para CRM/Abordagem, respeitando consentimento, opt-out, horário e janela/template da Meta;
6. impedir duplicata por telefone normalizado.

## Envio
TA, SDR humano e Consultor podem enviar cartão de contato quando isso reduz atrito (por exemplo, encaminhar um contato comercial/humano). O envio deve usar `type=contacts` da Meta Cloud API e nunca texto que simule cartão.

## Governança
- Recepção/Qualificação continuam capacidades internas do TA; nenhum personagem novo é criado.
- Fora da janela de 24h, o cartão não é usado para contornar a política de templates.
- Nome/telefone ausentes ou inválidos não viram lead por inferência.
- Toda troca de decisor registra `referredBy`, data, origem e próxima ação no CRM.

## Fluxo
`CRM/Abordagem → resposta → TA/SDR → decisor errado + cartão → CRM/Abordagem(novo decisor) → TA/SDR → Consultor`
