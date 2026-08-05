-- Anexos do chat de suporte: print, foto e PDF que o lojista manda junto com a
-- mensagem. O binário fica no Postgres (e não no bucket público do S3) porque
-- print de painel carrega dado de cliente final — ver o comentário do model
-- HelpAttachment em schema.prisma.

CREATE TABLE "help_attachments" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "messageId" TEXT,
    "uploadedBy" TEXT,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "bytes" INTEGER NOT NULL,
    "data" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "help_attachments_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "help_attachments_threadId_idx" ON "help_attachments"("threadId");
CREATE INDEX "help_attachments_messageId_idx" ON "help_attachments"("messageId");
CREATE INDEX "help_attachments_restaurantId_idx" ON "help_attachments"("restaurantId");

ALTER TABLE "help_attachments" ADD CONSTRAINT "help_attachments_threadId_fkey"
    FOREIGN KEY ("threadId") REFERENCES "help_threads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "help_attachments" ADD CONSTRAINT "help_attachments_messageId_fkey"
    FOREIGN KEY ("messageId") REFERENCES "help_messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;
