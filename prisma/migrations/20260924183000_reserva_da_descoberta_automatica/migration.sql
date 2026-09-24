-- ⭐ A RESERVA DA VARREDURA DE DESCOBERTA
--
-- Duas colunas ANULÁVEIS e novas. Nada é renomeado, nada muda de tipo e nada
-- é preenchido de ofício: a base existente continua válida exatamente como
-- está, e a primeira varredura é a que escreve o primeiro valor.
--
-- São o par de `ultimaRodadaAutomaticaEm/Por`, e separadas dela de
-- propósito: a descoberta enche a fila de manhã cedo e a rodada aborda às 9h.
-- Um campo só faria uma reservar o dia da outra.
ALTER TABLE "prospeccao_config"
  ADD COLUMN IF NOT EXISTS "ultimaDescobertaAutomaticaEm" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "ultimaDescobertaAutomaticaPor" TEXT;
