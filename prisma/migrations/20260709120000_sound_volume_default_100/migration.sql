-- Standard alert volume lowered to 100% (already loud and clean; the device
-- volume is now the recommended way to go louder). Change the column default and
-- reset rows still on the old forced default of 120 — deliberate custom values
-- (anything other than 120) are left untouched.
ALTER TABLE "restaurant_sound_settings" ALTER COLUMN "soundVolume" SET DEFAULT 100;
UPDATE "restaurant_sound_settings" SET "soundVolume" = 100 WHERE "soundVolume" = 120;
