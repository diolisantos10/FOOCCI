-- AlterTable: add metaCrmEnabled flag to MetaWhatsAppConfig
ALTER TABLE "meta_whatsapp_configs" ADD COLUMN "metaCrmEnabled" BOOLEAN NOT NULL DEFAULT false;
