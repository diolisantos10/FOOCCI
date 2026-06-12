-- Volume range extended to 0–200 (boost via Web Audio gain); recommended default 120
ALTER TABLE "restaurant_sound_settings" ALTER COLUMN "soundVolume" SET DEFAULT 120;
