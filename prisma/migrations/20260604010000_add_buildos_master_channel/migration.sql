-- ════════════════════════════════════════════════════════════════════════════
--  Build OS — separate WhatsApp Master/Admin channel from restaurant WhatsApp.
--  Additive only. Adds the Master-channel config to build_os_config and an
--  instanceName column to build_webhook_traces so diagnostics can tell whether a
--  /build arrived on the Build OS Master channel or a restaurant instance.
--  Restaurant Evolution instances are untouched.
-- ════════════════════════════════════════════════════════════════════════════

-- AlterTable: Build OS Master/Admin WhatsApp channel config.
ALTER TABLE "build_os_config"
  ADD COLUMN "whatsappInstanceName" TEXT,
  ADD COLUMN "whatsappEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "legacyRestaurantInstanceFallbackEnabled" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable: which instance a Build OS webhook trace arrived on.
ALTER TABLE "build_webhook_traces" ADD COLUMN "instanceName" TEXT;
