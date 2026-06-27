-- CreateEnum
CREATE TYPE "HelpThreadStatus" AS ENUM ('OPEN', 'ESCALATED', 'RESOLVED');

-- CreateEnum
CREATE TYPE "HelpThreadMode" AS ENUM ('AI', 'HUMAN');

-- CreateEnum
CREATE TYPE "HelpMessageRole" AS ENUM ('USER', 'ASSISTANT', 'SUPPORT', 'SYSTEM');

-- CreateTable
CREATE TABLE "help_threads" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "userId" TEXT,
    "subject" TEXT,
    "status" "HelpThreadStatus" NOT NULL DEFAULT 'OPEN',
    "mode" "HelpThreadMode" NOT NULL DEFAULT 'AI',
    "lastMessageAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "help_threads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "help_messages" (
    "id" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "role" "HelpMessageRole" NOT NULL,
    "content" TEXT NOT NULL,
    "authorName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "help_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "help_threads_restaurantId_idx" ON "help_threads"("restaurantId");

-- CreateIndex
CREATE INDEX "help_threads_status_idx" ON "help_threads"("status");

-- CreateIndex
CREATE INDEX "help_messages_threadId_idx" ON "help_messages"("threadId");

-- AddForeignKey
ALTER TABLE "help_threads" ADD CONSTRAINT "help_threads_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "help_messages" ADD CONSTRAINT "help_messages_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "help_threads"("id") ON DELETE CASCADE ON UPDATE CASCADE;
