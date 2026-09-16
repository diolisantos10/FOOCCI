# Templates frios da Meta

Contrato operacional da primeira abordagem da base fria Foocci.

## Objetivo
A primeira mensagem não vende. Ela identifica se o número pertence ao restaurante e abre caminho para localizar o decisor correto.

## Templates canônicos

- `foocci_contato_inicial_01`: `Olá! Tudo bem? Este contato é do {{1}}, certo?`
- `foocci_contato_inicial_02`: `Olá! Tudo bem? Falo com o {{1}} por aqui?`
- `foocci_contato_inicial_03`: `Olá! Tudo bem?`

`{{1}}` representa o nome do restaurante. Para os modelos parametrizados, a submissão à Meta deve incluir exemplo de `body_text` para a variável. A variável não encerra o texto do template.

## Regras

- categoria atual: `MARKETING`;
- idioma: `pt_BR`;
- submissão não dispara mensagem para leads;
- status de aprovação vem da Meta;
- fora da janela de 24 horas, somente template aprovado pode iniciar a conversa;
- `rejected_reason = NONE` significa ausência de motivo de rejeição e não deve ser exibido como erro;
- opt-out encerra a abordagem;
- automação nunca é tratada como interesse ou qualificação.
