-- Impressão — o job deixa de sumir entre o poll e o papel.
--
-- Antes: o poll marcava CLAIMED e NADA devolvia o job para a fila. Carteiro
-- fechado, PC dormindo, resposta perdida ou ack sem internet = comanda parada
-- para sempre, sem ninguém ver. E ack com falha virava FAILED terminal: papel
-- acabando por 10 segundos matava o pedido.
--
-- Aditiva: duas colunas novas e o resgate dos jobs já presos.

ALTER TABLE "print_jobs" ADD COLUMN IF NOT EXISTS "attempts" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "print_jobs" ADD COLUMN IF NOT EXISTS "nextAttemptAt" TIMESTAMP(3);

-- Serve a fila: pega PENDING vencido na ordem de chegada sem varrer a tabela.
CREATE INDEX IF NOT EXISTS "print_jobs_restaurantId_status_nextAttemptAt_idx"
  ON "print_jobs" ("restaurantId", "status", "nextAttemptAt");

-- Resgate, com juízo. O que travou nas últimas 6 horas ainda é pedido de hoje:
-- volta para a fila e imprime na primeira batida do Carteiro depois do deploy.
UPDATE "print_jobs"
   SET "status" = 'PENDING', "nextAttemptAt" = NULL, "attempts" = 0
 WHERE "status" IN ('CLAIMED', 'FAILED')
   AND "createdAt" > NOW() - INTERVAL '6 hours';

-- O que é mais velho que isso NÃO pode voltar a imprimir sozinho: despejar a
-- comanda de ontem na cozinha do meio do almoço é pior que não imprimir. Vai
-- para DEAD, aparece na tela de impressão e o lojista reimprime se quiser.
UPDATE "print_jobs"
   SET "status" = 'DEAD',
       "error"  = COALESCE("error", 'Ficou preso antes do conserto da fila (30/07).')
 WHERE "status" IN ('CLAIMED', 'FAILED');
