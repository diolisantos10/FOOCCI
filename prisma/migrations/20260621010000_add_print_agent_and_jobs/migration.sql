-- CreateTable
CREATE TABLE "print_agents" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "pairingCode" TEXT NOT NULL,
    "token" TEXT,
    "reportedPrinters" TEXT[],
    "agentVersion" TEXT,
    "lastSeenAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "print_agents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "print_jobs" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "stationKey" TEXT,
    "printerName" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "claimedAt" TIMESTAMP(3),
    "printedAt" TIMESTAMP(3),

    CONSTRAINT "print_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "print_agents_restaurantId_key" ON "print_agents"("restaurantId");

-- CreateIndex
CREATE UNIQUE INDEX "print_agents_pairingCode_key" ON "print_agents"("pairingCode");

-- CreateIndex
CREATE UNIQUE INDEX "print_agents_token_key" ON "print_agents"("token");

-- CreateIndex
CREATE INDEX "print_jobs_restaurantId_status_idx" ON "print_jobs"("restaurantId", "status");

-- AddForeignKey
ALTER TABLE "print_agents" ADD CONSTRAINT "print_agents_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "print_jobs" ADD CONSTRAINT "print_jobs_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
