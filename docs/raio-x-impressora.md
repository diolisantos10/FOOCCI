# Raio-x da impressora — por que o restaurante parou de imprimir

> 30/07/2026. Auditoria do caminho inteiro: disparo → fila → Carteiro → papel.
> Três defeitos encontrados, os três corrigidos. Todos do lado do **servidor** —
> o restaurante não precisa reinstalar nada.

---

## O caminho, como ele é

```
pedido CONFIRMED
   → PrintQueueService.maybeEnqueueOrder()     carimba printQueuedAt (uma vez só)
   → PrintQueueService.enqueue()               cria 1 PrintJob por estação
   → [PrintJob PENDING]
   → POST /api/print-agent/poll                Carteiro bate de 4 em 4 segundos
   → [PrintJob CLAIMED]                        job entregue ao PC
   → Carteiro imprime (ESC/POS RAW, GDI se falhar)
   → POST /api/print-agent/ack                 confirma
   → [PrintJob PRINTED]
```

Os disparos estão todos ligados — pedido pelo painel, pedido manual, checkout do
cardápio, pagamento no cartão e webhook do MercadoPago. **O problema nunca foi o
disparo.** Era o que acontecia depois.

---

## Defeito 1 — `CLAIMED` era um beco sem saída (a causa principal)

O `poll` marcava o job como `CLAIMED` e ia embora. **Nada, em lugar nenhum,
devolvia `CLAIMED` para a fila.**

Bastava qualquer uma destas coisas normais do dia a dia:

- o Carteiro ser fechado no meio do expediente;
- o PC dormir ou reiniciar;
- a resposta do poll se perder no caminho (o job já tinha saído da fila, mas o
  Carteiro nunca recebeu a lista);
- a impressão falhar e o `ack` não sair por falta de internet.

Resultado: comanda parada em `CLAIMED` **para sempre**. Sem papel, sem erro, sem
nada aparecendo em lugar nenhum.

O mais revelador: o próprio Carteiro documentava o contrário. No `catch` do ack
estava escrito *"o FOOCCI re-tenta no próximo poll se não receber o ack"*. O
servidor nunca implementou isso. O comentário descrevia um comportamento que não
existia.

**Conserto:** `CLAIMED` virou empréstimo com prazo (`LEASE_MS = 90s`). O próprio
poll resgata o que venceu e devolve para a fila. Nenhum estado prende comanda
para sempre.

---

## Defeito 2 — `FAILED` era sentença de morte

`ack` com `ok: false` gravava `FAILED`, e `FAILED` era terminal. Papel acabando,
impressora offline por dez segundos, driver travado, spooler engasgado — qualquer
falha transitória **matava a comanda em definitivo**.

**Conserto:** falha volta para a fila com um respiro que cresce (10s → 30s → 60s
→ 2min → 5min). O respiro não é enfeite: sem ele, uma impressora sem papel
receberia o mesmo job a cada 4 segundos e queimaria as cinco tentativas em vinte
segundos, antes de qualquer humano ter chance de pôr papel. Esgotadas as
tentativas, o job vira `DEAD` — que é para ser **visto por gente**, não para
sumir.

---

## Defeito 3 — o carimbo queimava o pedido mesmo sem enfileirar nada

`maybeEnqueueOrder` carimbava `printQueuedAt` **antes** de tentar enfileirar. Se
`enqueue` devolvesse zero jobs, o carimbo ficava lá — e aquele pedido nunca mais
tentava imprimir.

Zero jobs acontece exatamente no pior momento: **restaurante ainda configurando**.
Nenhuma estação tem impressora atribuída ainda, ou o banco engasgou naquele
instante. O pedido saía marcado como "já tratado" e não imprimia nem depois de o
lojista terminar a configuração.

**Conserto:** job nenhum criado = nada para duplicar, então o carimbo é solto. O
carimbo continua fazendo o trabalho dele (impedir papel em dobro) sem queimar
pedido que nunca chegou a ser enfileirado.

---

## Defeito 4 — o lojista era cego

Não existia tela, número nem erro em lugar nenhum sobre a fila. Quando a comanda
não saía, o lojista só sabia que **não saiu**.

**Conserto:** card "Fila de impressão" em Configurações → Impressoras, com
`na fila / no Carteiro / impressas 24h`, a lista do que travou **com o motivo
escrito**, e um botão de "Tentar de novo".

---

## O que muda na prática

| | Antes | Depois |
|---|---|---|
| Carteiro fechado no meio do turno | comanda perdida em silêncio | volta para a fila em 90s |
| Impressora sem papel | comanda morta | 5 tentativas espalhadas em ~6min |
| Pedido antes de configurar a impressora | nunca mais imprime | imprime quando configurar |
| Comanda travada de vez | invisível | aparece na tela com o motivo + reenvio |

**Chega sem reinstalar nada.** Todo o conserto é servidor. O Carteiro 0.3.0 que
está no PC do restaurante continua servindo — ele já fazia a parte dele.

A migration ainda resgata o que ficou preso: o que travou nas **últimas 6 horas**
volta para a fila e imprime na primeira batida do Carteiro depois do deploy. O
que é mais velho vira `DEAD` e aparece na tela — despejar a comanda de ontem na
cozinha no meio do almoço seria pior que não imprimir.

---

## O que eu NÃO posso afirmar

Auditei o código, a fila e o caminho inteiro, e os três defeitos são reais e
reproduzíveis em teste. **Não consigo confirmar que voltou a sair papel no
restaurante** — isso precisa de alguém lá olhando a bobina.

O que fazer para conferir, em ordem:

1. Abrir Configurações → Impressoras e olhar o card **Fila de impressão**.
2. Se houver comanda travada, o motivo está escrito nela.
3. Botão **Testar** de cada estação → o papel tem que sair em segundos.
4. Se não sair: conferir se o Carteiro está aberto no PC e se o nome da
   impressora no Windows bate **exatamente** com o nome configurado no painel.

---

## Onde mora o conserto

| Arquivo | O quê |
|---|---|
| `src/services/print/PrintJobLease.ts` | as regras de vida do job (empréstimo, resgate, respiro, morte) |
| `src/app/api/print-agent/poll/route.ts` | resgata os vencidos antes de servir |
| `src/app/api/print-agent/ack/route.ts` | falha volta para a fila em vez de matar |
| `src/services/print/PrintQueueService.ts` | solta o carimbo quando não enfileirou nada |
| `src/app/api/integracoes/impressao/fila/route.ts` | a fila visível + reenvio |
| `prisma/migrations/20260730060000_print_job_lease_retry/` | colunas + resgate do que estava preso |
