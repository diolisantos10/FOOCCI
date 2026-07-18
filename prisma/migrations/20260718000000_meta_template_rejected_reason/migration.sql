-- Add Meta's rejection reason so the CRM approval panel can show WHY a template was rejected.
ALTER TABLE "meta_message_templates" ADD COLUMN "rejectedReason" TEXT;
