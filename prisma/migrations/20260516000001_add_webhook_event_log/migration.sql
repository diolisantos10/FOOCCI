-- CreateTable
CREATE TABLE "evolution_webhook_event_logs" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT,
    "instanceName" TEXT NOT NULL,
    "eventName" TEXT NOT NULL,
    "normalizedEventName" TEXT,
    "accepted" BOOLEAN NOT NULL DEFAULT false,
    "ignored" BOOLEAN NOT NULL DEFAULT false,
    "error" TEXT,
    "bodyKeys" TEXT[],
    "dataKeys" TEXT[],
    "messageId" TEXT,
    "remoteJidMasked" TEXT,
    "direction" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "evolution_webhook_event_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "evolution_webhook_event_logs_restaurantId_createdAt_idx" ON "evolution_webhook_event_logs"("restaurantId", "createdAt");

-- CreateIndex
CREATE INDEX "evolution_webhook_event_logs_instanceName_createdAt_idx" ON "evolution_webhook_event_logs"("instanceName", "createdAt");
