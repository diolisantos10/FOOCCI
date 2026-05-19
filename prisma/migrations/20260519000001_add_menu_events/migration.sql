-- CreateTable: menu_events — lightweight delivery menu page-view events for source attribution
CREATE TABLE "menu_events" (
    "id"           TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "source"       TEXT,
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "menu_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "menu_events_restaurantId_source_idx" ON "menu_events"("restaurantId", "source");

-- CreateIndex
CREATE INDEX "menu_events_restaurantId_createdAt_idx" ON "menu_events"("restaurantId", "createdAt");
