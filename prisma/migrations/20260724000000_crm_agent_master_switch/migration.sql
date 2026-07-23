-- Master switch do Agente de CRM (default ligado = sem mudança de comportamento).
ALTER TABLE "restaurants" ADD COLUMN "crmAgentEnabled" BOOLEAN NOT NULL DEFAULT true;
