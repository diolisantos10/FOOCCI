-- Replace fixed btn1/btn2/btn3Label columns with a flexible JSON array of menu options.

ALTER TABLE "whatsapp_agent_configs" DROP COLUMN IF EXISTS "btn1Label";
ALTER TABLE "whatsapp_agent_configs" DROP COLUMN IF EXISTS "btn2Label";
ALTER TABLE "whatsapp_agent_configs" DROP COLUMN IF EXISTS "btn3Label";

ALTER TABLE "whatsapp_agent_configs"
    ADD COLUMN IF NOT EXISTS "menuOptions" JSONB;
