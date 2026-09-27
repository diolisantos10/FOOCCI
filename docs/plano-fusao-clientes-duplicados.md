# Plano — juntar os clientes duplicados pelo telefone

> 27/09/2026 · Diretor do Foocci · **Nada foi executado em produção.** Decisão do CEO.
> Origem: auditoria do CRM no Sushi Cazza, PR #278 (merge 114023b).

## O problema, em uma linha

A importação gravou celular antigo **sem o 9**, e o checkout grava **com o 9**.
O mesmo cliente virou duas fichas. A venda caía na ficha nova, e a campanha que
trouxe o cliente (ele está na ficha antiga) ficava com zero. O #278 impede que
isso aconteça de novo, mas não conserta as fichas que já foram duplicadas.

## Tamanho — estimativa, não contagem

- **Não há contagem verificada.** Esta sessão não tem leitura do banco de produção.
- **Indício nos logs de produção (28/08 a 27/09):** 16 pedidos caíram numa ficha
  criada minutos antes do pedido (`[CRMAttribution] no_context`, cliente
  recém-criado). Esse é o **teto** do que o checkout gerou nesse mês: parte
  desses clientes é gente nova de verdade, não duplicata.
- **Ordem de grandeza provável:** dezenas de fichas no Sushi Cazza, não
  milhares. Isso **pode estar errado para cima** se a própria importação tiver
  gerado duplicatas entre si, porque os logs não mostram esse caso.
- **Como virar número:** rodar `npx tsx scripts/contar-clientes-duplicados.ts --restaurant sushi-cazza`.
  O script é somente leitura. Ele mostra pessoas duplicadas, fichas a absorver
  e quantos pedidos, cupons e envios mudam de dono.

## Como a fusão funciona (se aprovada)

1. **Quem sobrevive:** a ficha com mais pedidos; no empate, a mais antiga. É a
   mesma regra que o checkout já usa (`CUSTOMER_LOOKUP_ORDER`).
2. **O que muda de dono**, dentro de uma transação por pessoa:
   - pedidos e rascunhos de pedido;
   - cupons da carteira;
   - envios de campanha;
   - conversas e registros do CRM;
   - endereços.
3. **A ficha absorvida não é apagada.** Ela fica inativa, sem telefone e com a
   marca de em qual ficha foi fundida. Se algo der errado, dá para desfazer.
4. **Totais recalculados** na ficha sobrevivente (pedidos, gasto, último pedido).
5. **Opt-out vence:** se qualquer uma das fichas pediu para não receber
   mensagem, a sobrevivente herda o pedido.
6. **Antes de tudo:** cópia das tabelas tocadas, como já foi feito na limpeza
   das conversas. Primeiro roda em modo ensaio, que só relata o que faria;
   depois vem a execução.

## Duas saídas

**A — Fundir tudo, com ensaio antes (recomendada).**
- **Custa:** cerca de um dia de trabalho, mais uma janela de madrugada para executar.
- **Arrisca:** ficha errada fundida, se duas pessoas diferentes dividem o mesmo
  telefone. Mitigação: o ensaio lista os casos, e a fusão é reversível.
- **Destrava:**
  - o histórico volta para uma ficha só;
  - "Cliente perdido" deixa de mandar oferta de reconquista para quem já
    voltou a pedir (hoje a ficha antiga continua "perdida" mesmo com o
    cliente comprando);
  - as conversões antigas podem ser recontadas.

**B — Não fundir; só impedir que novos duplicados apareçam (o #278 já faz isso).**
- **Custa:** nada agora.
- **Arrisca:**
  - quem já foi duplicado continua recebendo mensagem de "sumido" enquanto
    compra, o que queima a marca e vira denúncia no WhatsApp;
  - o painel continua subcontando o que as campanhas antigas trouxeram.
- **Destrava:** nada; apenas estanca.

**Descartada:** fundir direto, sem ensaio e sem cópia. Uma fusão errada mistura
o histórico de duas pessoas, e isso não se desfaz a olho.

## Recomendação

**A**, em dois passos:
1. Rodar a contagem, que é somente leitura, e trazer o número real ao CEO.
2. Executar a fusão só depois do ok dele sobre esse número.
