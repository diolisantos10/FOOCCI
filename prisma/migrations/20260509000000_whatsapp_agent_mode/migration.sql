-- AlterTable: add agentMode to whatsapp_agent_configs
-- Default RECEPTIONIST_ONLY ensures all existing restaurants are in safe receptionist mode
ALTER TABLE "whatsapp_agent_configs" ADD COLUMN "agent_mode" TEXT NOT NULL DEFAULT 'RECEPTIONIST_ONLY';
