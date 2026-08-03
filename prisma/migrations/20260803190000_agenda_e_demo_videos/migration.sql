-- Agenda comercial (horários do CEO para chamadas de demonstração)
CREATE TABLE IF NOT EXISTS "MeetingSlot" (
    "id" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "durationMin" INTEGER NOT NULL DEFAULT 20,
    "bookedAt" TIMESTAMP(3),
    "nome" TEXT,
    "whatsapp" TEXT,
    "restaurante" TEXT,
    "notifiedAt" TIMESTAMP(3),
    "notifyError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MeetingSlot_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "MeetingSlot_startsAt_idx" ON "MeetingSlot"("startsAt");
CREATE INDEX IF NOT EXISTS "MeetingSlot_bookedAt_idx" ON "MeetingSlot"("bookedAt");

-- Vídeos de demonstração do site
CREATE TABLE IF NOT EXISTS "DemoVideo" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "youtubeUrl" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "published" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DemoVideo_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "DemoVideo_published_sortOrder_idx" ON "DemoVideo"("published", "sortOrder");
