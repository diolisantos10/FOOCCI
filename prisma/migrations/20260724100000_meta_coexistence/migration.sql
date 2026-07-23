-- WhatsApp Coexistence: mark a Meta config whose number is ALSO live on the
-- WhatsApp Business App (phone). Such a number must never be /register-ed.
ALTER TABLE "meta_whatsapp_configs"
  ADD COLUMN "coexistence" BOOLEAN NOT NULL DEFAULT false;
