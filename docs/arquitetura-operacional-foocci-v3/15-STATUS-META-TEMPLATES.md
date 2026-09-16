# Status Meta na Sala Comercial

A Sala Comercial deve mostrar o estado retornado pela Meta sem fabricar aprovação local.

`foocci_contato_inicial_03` já havia sido observado como `PENDING`/Em análise antes desta correção. Esta alteração não recria nem substitui um template já existente; a rota é idempotente e preserva o modelo encontrado pelo nome.

Os modelos 01 e 02 somente serão considerados submetidos quando a Meta aceitar a criação e devolver sucesso.
