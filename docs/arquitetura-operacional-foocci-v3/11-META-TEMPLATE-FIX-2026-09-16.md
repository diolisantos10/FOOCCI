# Correção de submissão Meta — 2026-09-16

A Meta recusou os templates `foocci_contato_inicial_01` e `foocci_contato_inicial_02` com a mensagem de que variáveis não podem ficar no início ou no fim do modelo.

Correção aplicada:

- `Olá! Tudo bem? Este contato é do {{1}}?` → `Olá! Tudo bem? Este contato é do {{1}}, certo?`
- `Olá! Tudo bem? Falo com o {{1}}?` → `Olá! Tudo bem? Falo com o {{1}} por aqui?`

O payload da rota comercial já envia `example.body_text` com `Restaurante Exemplo` para modelos parametrizados, portanto esse contrato foi preservado.

A interface comercial também passa a esconder `rejected_reason = NONE`, que representa ausência de motivo de rejeição e não um erro.
