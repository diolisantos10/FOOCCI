-- FOOCCI Brain — evidência do shadow mode (aditivo)

-- CreateTable
CREATE TABLE "brain_shadow_logs" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "intent" TEXT NOT NULL,
    "reasoningMode" TEXT NOT NULL,
    "engine" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "coherence" TEXT NOT NULL,
    "wouldEscalate" BOOLEAN NOT NULL,
    "wouldReply" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "brain_shadow_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "brain_shadow_logs_restaurantId_createdAt_idx" ON "brain_shadow_logs"("restaurantId", "createdAt");
