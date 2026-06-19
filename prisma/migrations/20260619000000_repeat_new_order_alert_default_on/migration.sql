-- P0: the NEW ORDER alert must be loud AND reliably repeating.
-- `repeatNewOrderSoundUntilAccepted` was previously unwired (the old code looped
-- unconditionally), so operators were used to it repeating. Now that the flag is
-- wired to a safe capped loop, default it ON and enable it for existing
-- restaurants so the behavior they relied on is preserved.
-- NOTE: human-attention (atendimento) repeat is intentionally left unchanged.
ALTER TABLE "restaurant_sound_settings" ALTER COLUMN "repeatNewOrderSoundUntilAccepted" SET DEFAULT true;
UPDATE "restaurant_sound_settings" SET "repeatNewOrderSoundUntilAccepted" = true WHERE "repeatNewOrderSoundUntilAccepted" = false;
