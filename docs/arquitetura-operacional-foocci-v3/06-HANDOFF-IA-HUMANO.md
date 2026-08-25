# Handoff IA ↔ humano (v3)

> **A regra:** *"Nenhuma transferência pode perder histórico ou contexto."*

## Assumir é atômico

O jeito natural de escrever seria: ler a conversa, conferir se ainda está livre, e escrever quem assumiu.

Entre a leitura e a escrita cabe uma requisição inteira. **Dois SDRs clicando "assumir" no mesmo segundo passam os dois pela conferência e escrevem os dois.** O segundo sobrescreve o primeiro em silêncio: dois humanos acham que são donos da mesma conversa, e o lead recebe duas respostas diferentes.

A janela é pequena — e é exatamente por isso que machuca. Ela só aparece quando a operação está cheia, que é quando ninguém pode parar para investigar.

**A condição vai dentro da escrita.** Quem perde a corrida recebe uma resposta clara ("Fulano assumiu primeiro"), nunca um sucesso falso.

Isso já está implementado e provado contra banco real: dez pedidos simultâneos produzem **um dono, um evento na linha do tempo e nove recusas explicadas**. Trocando pela versão ingênua, os testes reprovam — foi conferido nas duas direções.

## A IA silencia ANTES do próximo envio

Não adianta marcar o humano como responsável se a IA já tem uma resposta a caminho. A ordem importa:

1. a posse muda, dentro da transação;
2. **só então** a fila de envio da IA é consultada;
3. a IA lê a posse antes de cada envio — não só ao começar a conversa.

O passo 3 é o que evita a mensagem fantasma: a IA começou a redigir quando era dela, e terminou quando já não era.

## O que viaja no handoff

Uma transferência sem dossiê é uma conversa recomeçada. O destino recebe:

- **o histórico inteiro**, na mesma linha do tempo — sem "aba da IA" e "aba do humano";
- **o resumo** do que aconteceu até aqui;
- **o motivo** do handoff;
- **o que já foi prometido** ao lead — o campo que evita a contradição;
- **as pendências** em aberto;
- **os entregáveis**;
- **o objetivo** de quem devolve ("volte a agendar", "só confirme o endereço").

Handoff sem entregável e sem pendência é uma conversa, não uma passagem de trabalho — e é recusado.

## Humano → IA também é handoff

Devolver para a IA exige **objetivo escrito**. Sem isso, a IA retoma sem saber o que se espera dela, e a chance de contradizer o que o humano prometeu é alta.

## O item fica com o emissor até o aceite

Enquanto o destino não aceitar, o responsável é quem enviou. Isso evita o limbo entre dois donos — e limbo não tem dono.

Estados: **enviado** (é do emissor) · **aceito** (é do destino) · **recusado** e **devolvido** (voltou ao emissor).

**Aceito é final.** Desfazer um aceite apagaria uma passagem que aconteceu. Devolver trabalho aceito é um handoff **novo**, na direção contrária — e aí a linha do tempo mostra as duas passagens, em vez de esconder uma.

## O que é registrado

Todo envio, aceite, recusa e devolução vira evento append-only, com autor e horário. A linha do tempo não se corrige: corrigir o passado seria reescrever a história, não consertar o dado. Registra-se um evento **novo**.
