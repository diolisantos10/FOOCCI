-- CreateTable
CREATE TABLE "restaurant_sound_settings" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "soundEnabled" BOOLEAN NOT NULL DEFAULT true,
    "newOrderSoundEnabled" BOOLEAN NOT NULL DEFAULT true,
    "humanAttentionSoundEnabled" BOOLEAN NOT NULL DEFAULT true,
    "soundVolume" INTEGER NOT NULL DEFAULT 80,
    "repeatNewOrderSoundUntilAccepted" BOOLEAN NOT NULL DEFAULT false,
    "repeatHumanAttentionUntilSeen" BOOLEAN NOT NULL DEFAULT false,
    "soundTheme" TEXT NOT NULL DEFAULT 'DEFAULT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "restaurant_sound_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "restaurant_sound_settings_restaurantId_key" ON "restaurant_sound_settings"("restaurantId");

-- AddForeignKey
ALTER TABLE "restaurant_sound_settings" ADD CONSTRAINT "restaurant_sound_settings_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
