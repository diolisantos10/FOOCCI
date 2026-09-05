# Comercial Foocci P0 — relatório da madrugada de 05/09/2026

> Para o CEO. Conclusão primeiro, linguagem de negócio.
> Mandato: `control_room#53`. Entrega: PR #180 deste repositório.

## Em três frases

A Comercial já estava muito mais pronta do que o pacote P0 supunha — o que
faltava não era tela, era **a prospecção inteira**: não havia como uma lista
virar cliente em potencial preservando de onde veio, nem como parar de abordar
estranhos sem calar o atendimento de quem já fala com a gente. Isso foi
construído, e **nasce travado**: desligado por padrão, teto zero, e nenhuma
mensagem sai enquanto você não ligar a chave. Três revisões adversariais acharam
dois defeitos graves nesta obra — os dois foram corrigidos antes de qualquer
merge, e um deles teria queimado a sua lista de contatos.

## O que você ganha

| | |
|---|---|
| Carregar a lista | em lotes conferidos, com a origem escrita por quem carregou |
| Ver quem seria abordado hoje | **sem abordar ninguém** — é o modo de conferência |
| Ligar, pausar, e parar tudo | botões, sem depender de programador |
| Quem pediu silêncio | nunca mais é abordado, mesmo com cadastro antigo bagunçado |
| Quem já é seu cliente ou já fala com você | não entra como estranho, não ganha dois donos |
| Insistência | teto de duas tentativas e descanso obrigatório, que a configuração só pode **apertar** |

## Os dois defeitos graves que foram achados e corrigidos

**1. A tela de conferência queimava a lista.** Na primeira versão, só de abrir a
tela o sistema consumia contatos — eles saíam da fila para sempre sem ninguém ter
falado com eles. Cinco recarregamentos torrariam cem contatos. Pior: o texto que
eu mesmo escrevi vendia esse modo como "o jeito seguro de conferir antes de
começar". Corrigido: **olhar não consome**; consumir é outro ato, separado.

**2. Quem pediu silêncio podia ser abordado.** O sistema procurava a pessoa pelo
telefone em formato exato, e a base tem telefones gravados em formatos antigos
diferentes. Um contato que pediu para não receber mensagem simplesmente não era
encontrado — e o sistema liberava a abordagem **com confiança**. Corrigido: a
busca agora é pelos oito dígitos finais, a mesma régua que o recebimento do
WhatsApp já usava.

## O que foi provado, e como

- **7.918 testes automáticos** passando, incluindo 44 novos escritos nesta noite.
- **Uma jornada completa contra um banco de dados real**, criado do zero: carregar
  a lista → conferir que carregar não autoriza → ligar → conferir que olhar não
  consome → transformar em contato → conferir que ele nunca nasce com
  "consentimento" que ninguém deu → silêncio → freio do lote → freio geral.
- **As duas mudanças de banco foram aplicadas de verdade** num Postgres antes de
  chegar perto da produção.

## ⚠️ O que NÃO foi provado — e não vou dizer que foi

- **A tela nunca foi aberta num navegador.** Não havia como, nesta máquina.
- **Nenhuma mensagem real foi enviada, nenhuma lista real foi importada.**
- `vendas.foocci.com.br` **não existe ainda**: o código está pronto e adormecido,
  e criar o endereço é ato seu no Railway/DNS.

## ⛔ Um achado sério, que NÃO é desta obra e precisa de decisão sua

Ao montar a prova contra banco real, descobri que **a empresa hoje não consegue
recriar o banco do Foocci a partir do código**. Uma instrução de maio de 2025
quebra a reconstrução. Em produção isso é invisível — o banco já existe — e por
isso ninguém tinha percebido.

Ele acorda no único dia em que importa: o dia de restaurar um backup, ou montar um
ambiente de teste. **E conversa com o risco que já estava na sua mesa: o backup
nunca foi provado por restauração.** Um backup que só se restaura para um banco
que não pode ser reconstruído é meio backup.

Está registrado em `docs/pendencias.md` como frente separada. Não é escopo desta
noite, e não é o que destrava receita — mas é o tipo de coisa que só se resolve
antes de precisar.

## Como começar a vender, na ordem

1. **Entre** em `foocci.com.br/comercial/entrar` (já no ar, conferido agora).
2. **Carregue um lote pequeno** — dez, vinte contatos — escrevendo de onde vieram.
3. **Ligue a prospecção informando o teto do dia** e abra a fila: ela mostra quem
   seria abordado e quem foi barrado, com o motivo. **Nada sai ainda.**
4. Confira essa lista com o seu olho. Se ela estiver certa, **aí** ligamos a
   entrega — com você presente, lote pequeno, e o freio ao alcance da mão.
