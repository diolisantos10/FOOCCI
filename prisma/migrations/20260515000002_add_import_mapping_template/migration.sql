-- CreateTable
CREATE TABLE "import_mapping_templates" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sourceSystem" TEXT NOT NULL DEFAULT 'GENERIC',
    "importType" TEXT NOT NULL DEFAULT 'customers',
    "mappings" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "import_mapping_templates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "import_mapping_templates_restaurantId_idx" ON "import_mapping_templates"("restaurantId");

-- AddForeignKey
ALTER TABLE "import_mapping_templates" ADD CONSTRAINT "import_mapping_templates_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
