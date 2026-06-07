-- ════════════════════════════════════════════════════════════════════════════
--  Agent Library — private original-file storage. Additive only: one new table
--  holding the uploaded PDF/TXT/MD bytes per source, 1:1, cascade on delete.
--  Stored privately (never served by a public route) so the "extract again"
--  retry can re-parse the file. No existing table is altered.
-- ════════════════════════════════════════════════════════════════════════════

-- CreateTable
CREATE TABLE "agent_library_files" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "data" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_library_files_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "agent_library_files_sourceId_key" ON "agent_library_files"("sourceId");

-- AddForeignKey
ALTER TABLE "agent_library_files" ADD CONSTRAINT "agent_library_files_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "agent_library_sources"("id") ON DELETE CASCADE ON UPDATE CASCADE;
