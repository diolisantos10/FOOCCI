# Exemplo da variável Meta

Para `foocci_contato_inicial_01` e `foocci_contato_inicial_02`, `{{1}}` é o nome do restaurante.

Na criação do template, o componente BODY envia:

```json
{
  "example": {
    "body_text": [["Restaurante Exemplo"]]
  }
}
```

Esse exemplo serve à análise do template pela Meta. No envio real, o valor deve vir do registro do prospect/restaurante correspondente; o exemplo não é o valor enviado ao cliente.
