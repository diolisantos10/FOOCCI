-- P0: the human-attention alert must behave like an operational alarm that
-- repeats until an operator assumes/resolves the conversation. Default the
-- `repeatHumanAttentionUntilSeen` flag ON and enable it for existing restaurants.
-- Operators can still turn it off in Configurações → Sons e alertas.
ALTER TABLE "restaurant_sound_settings" ALTER COLUMN "repeatHumanAttentionUntilSeen" SET DEFAULT true;
UPDATE "restaurant_sound_settings" SET "repeatHumanAttentionUntilSeen" = true WHERE "repeatHumanAttentionUntilSeen" = false;
