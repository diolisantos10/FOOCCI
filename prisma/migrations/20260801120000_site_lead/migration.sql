-- CreateTable
CREATE TABLE "SiteLead" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "whatsapp" TEXT NOT NULL,
    "restaurante" TEXT,
    "cidade" TEXT,
    "tipo" TEXT,
    "desafio" TEXT,
    "origem" TEXT,
    "notifiedAt" TIMESTAMP(3),
    "notifyError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SiteLead_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SiteLead_createdAt_idx" ON "SiteLead"("createdAt");

-- CreateIndex
CREATE INDEX "SiteLead_notifiedAt_idx" ON "SiteLead"("notifiedAt");
