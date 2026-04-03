-- Add description to restaurants
ALTER TABLE "restaurants" ADD COLUMN IF NOT EXISTS "description" TEXT;

-- delivery_configs
CREATE TABLE "delivery_configs" (
    "id"               TEXT NOT NULL,
    "restaurantId"     TEXT NOT NULL,
    "enabled"          BOOLEAN NOT NULL DEFAULT true,
    "fee"              DECIMAL(10,2),
    "estimatedMinutes" INTEGER,
    "areaDescription"  TEXT,
    "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"        TIMESTAMP(3) NOT NULL,
    CONSTRAINT "delivery_configs_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "delivery_configs_restaurantId_key" ON "delivery_configs"("restaurantId");
ALTER TABLE "delivery_configs" ADD CONSTRAINT "delivery_configs_restaurantId_fkey"
    FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- business_hours
CREATE TABLE "business_hours" (
    "id"           TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "dayOfWeek"    INTEGER NOT NULL,
    "isOpen"       BOOLEAN NOT NULL DEFAULT true,
    "openTime"     TEXT NOT NULL DEFAULT '09:00',
    "closeTime"    TEXT NOT NULL DEFAULT '22:00',
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"    TIMESTAMP(3) NOT NULL,
    CONSTRAINT "business_hours_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "business_hours_restaurantId_dayOfWeek_key" ON "business_hours"("restaurantId", "dayOfWeek");
CREATE INDEX "business_hours_restaurantId_idx" ON "business_hours"("restaurantId");
ALTER TABLE "business_hours" ADD CONSTRAINT "business_hours_restaurantId_fkey"
    FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- payment_settings
CREATE TABLE "payment_settings" (
    "id"           TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "acceptPix"    BOOLEAN NOT NULL DEFAULT true,
    "acceptCash"   BOOLEAN NOT NULL DEFAULT true,
    "acceptCard"   BOOLEAN NOT NULL DEFAULT true,
    "acceptLink"   BOOLEAN NOT NULL DEFAULT false,
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"    TIMESTAMP(3) NOT NULL,
    CONSTRAINT "payment_settings_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "payment_settings_restaurantId_key" ON "payment_settings"("restaurantId");
ALTER TABLE "payment_settings" ADD CONSTRAINT "payment_settings_restaurantId_fkey"
    FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- store_policies
CREATE TABLE "store_policies" (
    "id"                 TEXT NOT NULL,
    "restaurantId"       TEXT NOT NULL,
    "termsOfUse"         TEXT,
    "privacyPolicy"      TEXT,
    "cancellationPolicy" TEXT,
    "createdAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"          TIMESTAMP(3) NOT NULL,
    CONSTRAINT "store_policies_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "store_policies_restaurantId_key" ON "store_policies"("restaurantId");
ALTER TABLE "store_policies" ADD CONSTRAINT "store_policies_restaurantId_fkey"
    FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
