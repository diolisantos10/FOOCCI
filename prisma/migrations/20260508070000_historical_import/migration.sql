-- ── Historical Import Core Migration ──────────────────────────────────────────
-- All statements are idempotent (IF NOT EXISTS / DO $$ … $$).

-- ImportJob table
CREATE TABLE IF NOT EXISTS "import_jobs" (
  "id"                TEXT         NOT NULL,
  "restaurantId"      TEXT         NOT NULL,
  "type"              TEXT         NOT NULL,
  "filename"          TEXT         NOT NULL DEFAULT '',
  "status"            TEXT         NOT NULL,
  "totalRows"         INTEGER      NOT NULL DEFAULT 0,
  "validRows"         INTEGER      NOT NULL DEFAULT 0,
  "errorRows"         INTEGER      NOT NULL DEFAULT 0,
  "warningRows"       INTEGER      NOT NULL DEFAULT 0,
  "createdCustomers"  INTEGER      NOT NULL DEFAULT 0,
  "updatedCustomers"  INTEGER      NOT NULL DEFAULT 0,
  "createdOrders"     INTEGER      NOT NULL DEFAULT 0,
  "createdItems"      INTEGER      NOT NULL DEFAULT 0,
  "skippedDuplicates" INTEGER      NOT NULL DEFAULT 0,
  "unmatchedProducts" INTEGER      NOT NULL DEFAULT 0,
  "reportJson"        JSONB,
  "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt"       TIMESTAMP(3),

  CONSTRAINT "import_jobs_pkey" PRIMARY KEY ("id")
);

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'import_jobs_restaurantId_fkey'
  ) THEN
    ALTER TABLE "import_jobs"
      ADD CONSTRAINT "import_jobs_restaurantId_fkey"
      FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "import_jobs_restaurantId_idx" ON "import_jobs"("restaurantId");
