-- Migration: add_store_profile
-- Creates the store_profiles table for complete fiscal, address,
-- contact and operational data. One-to-one with restaurants.

CREATE TABLE "store_profiles" (
  "id"           TEXT NOT NULL PRIMARY KEY,
  "restaurantId" TEXT NOT NULL UNIQUE,

  -- Dados da loja
  "tradeName"    TEXT,
  "legalName"    TEXT,
  "cuisineType"  TEXT,

  -- Dados fiscais
  "cnpj"                  TEXT,
  "stateRegistration"     TEXT,
  "municipalRegistration" TEXT,
  "taxRegime"             TEXT,
  "legalResponsibleName"  TEXT,
  "legalResponsibleCpf"   TEXT,

  -- Endereço estruturado
  "cep"            TEXT,
  "street"         TEXT,
  "streetNumber"   TEXT,
  "complement"     TEXT,
  "neighborhood"   TEXT,
  "city"           TEXT,
  "state"          TEXT,
  "country"        TEXT DEFAULT 'Brasil',
  "referencePoint" TEXT,
  "latitude"       DOUBLE PRECISION,
  "longitude"      DOUBLE PRECISION,

  -- Contatos
  "mainPhone"         TEXT,
  "whatsappPhone"     TEXT,
  "secondaryPhone"    TEXT,
  "secondaryWhatsapp" TEXT,
  "mainEmail"         TEXT,
  "financeEmail"      TEXT,
  "supportEmail"      TEXT,

  -- Responsáveis
  "ownerName"       TEXT,
  "ownerRole"       TEXT,
  "ownerPhone"      TEXT,
  "ownerWhatsapp"   TEXT,
  "ownerEmail"      TEXT,
  "managerName"     TEXT,
  "managerRole"     TEXT,
  "managerPhone"    TEXT,
  "managerWhatsapp" TEXT,
  "managerEmail"    TEXT,

  -- Operação
  "deliveryEnabled"           BOOLEAN NOT NULL DEFAULT true,
  "pickupEnabled"             BOOLEAN NOT NULL DEFAULT true,
  "dineInEnabled"             BOOLEAN NOT NULL DEFAULT true,
  "averagePreparationMinutes" INTEGER,

  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "store_profiles_restaurantId_fkey"
    FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE
);
