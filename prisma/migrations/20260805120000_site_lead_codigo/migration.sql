-- Código curto do lead — o que liga o "oi" do WhatsApp ao formulário preenchido.
--
-- Por que existe: o formulário do site passa a levar a pessoa ao WhatsApp com a
-- mensagem já escrita. Quem inicia a conversa é o CLIENTE (some o risco de
-- banimento e a exigência de modelo aprovado pela Meta), mas o "oi" chega sem
-- contexto nenhum se não carregar uma marca. `codigo` é essa marca: 5 caracteres
-- que viajam no fim da mensagem (`#A7K2M`) e voltam para cá.
--
-- NULLABLE de propósito: se a geração do código falhar, o lead é gravado do mesmo
-- jeito. Perder o código é aceitável; perder o lead nunca é. Por isso o UNIQUE
-- também tolera múltiplos NULL (comportamento padrão do Postgres).
--
-- Aditiva: coluna nova opcional, nenhuma linha existente muda.

ALTER TABLE "SiteLead" ADD COLUMN IF NOT EXISTS "codigo" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "SiteLead_codigo_key" ON "SiteLead"("codigo");
