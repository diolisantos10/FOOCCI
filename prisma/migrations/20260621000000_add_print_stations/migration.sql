-- CreateTable
CREATE TABLE "print_stations" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "printerName" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "print_stations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "print_stations_restaurantId_idx" ON "print_stations"("restaurantId");

-- CreateIndex
CREATE UNIQUE INDEX "print_stations_restaurantId_key_key" ON "print_stations"("restaurantId", "key");

-- AddForeignKey
ALTER TABLE "print_stations" ADD CONSTRAINT "print_stations_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
