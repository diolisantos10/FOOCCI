-- Track customers leaving the CRM base during auto-cleanup (for the Migração panel).
CREATE TABLE "crm_base_exclusions" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "customerId" TEXT,
    "phone" TEXT,
    "reason" TEXT NOT NULL,
    "hadHistory" BOOLEAN NOT NULL DEFAULT false,
    "priorSegment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "crm_base_exclusions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "crm_base_exclusions_restaurantId_createdAt_idx" ON "crm_base_exclusions"("restaurantId", "createdAt");
