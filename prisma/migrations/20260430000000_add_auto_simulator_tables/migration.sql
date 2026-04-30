-- CreateTable
CREATE TABLE "auto_simulator_configs" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "intervalMinutes" INTEGER NOT NULL DEFAULT 60,
    "scenarioCount" INTEGER NOT NULL DEFAULT 10,
    "lastRunAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "auto_simulator_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "simulation_runs" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "ranAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "scenarioCount" INTEGER NOT NULL,
    "overallScore" DOUBLE PRECISION NOT NULL,
    "conversionRate" DOUBLE PRECISION NOT NULL,
    "attachRateDrink" DOUBLE PRECISION NOT NULL,
    "attachRateDessert" DOUBLE PRECISION NOT NULL,
    "errorSummary" JSONB NOT NULL,
    "analysis" JSONB NOT NULL,
    "insight" TEXT NOT NULL,
    "suggestedPrompt" TEXT NOT NULL,
    "triggeredBy" TEXT NOT NULL DEFAULT 'scheduler',

    CONSTRAINT "simulation_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "auto_simulator_configs_restaurantId_key" ON "auto_simulator_configs"("restaurantId");

-- CreateIndex
CREATE INDEX "simulation_runs_restaurantId_ranAt_idx" ON "simulation_runs"("restaurantId", "ranAt");

-- AddForeignKey
ALTER TABLE "auto_simulator_configs" ADD CONSTRAINT "auto_simulator_configs_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "simulation_runs" ADD CONSTRAINT "simulation_runs_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
