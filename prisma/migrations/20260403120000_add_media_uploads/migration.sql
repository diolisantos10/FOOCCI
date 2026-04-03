CREATE TABLE "media_uploads" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "media_uploads_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "media_uploads_restaurantId_idx" ON "media_uploads"("restaurantId");
