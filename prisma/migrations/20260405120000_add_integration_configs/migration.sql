-- CreateTable: generic integration credentials per restaurant tenant

CREATE TABLE "integration_configs" (
    "id"           TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "provider"     TEXT NOT NULL,
    "configBlob"   TEXT NOT NULL,
    "isActive"     BOOLEAN NOT NULL DEFAULT false,
    "lastTestedAt" TIMESTAMP(3),
    "lastError"    TEXT,
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"    TIMESTAMP(3) NOT NULL,

    CONSTRAINT "integration_configs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "integration_configs_restaurantId_provider_key"
    ON "integration_configs"("restaurantId", "provider");

CREATE INDEX "integration_configs_restaurantId_idx"
    ON "integration_configs"("restaurantId");

-- AddForeignKey
ALTER TABLE "integration_configs"
    ADD CONSTRAINT "integration_configs_restaurantId_fkey"
    FOREIGN KEY ("restaurantId")
    REFERENCES "restaurants"("id")
    ON DELETE CASCADE
    ON UPDATE CASCADE;
