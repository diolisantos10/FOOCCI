-- Store Metas template id so an approved template can be edited in place (zero-gap re-approval).
ALTER TABLE "meta_message_templates" ADD COLUMN "metaTemplateId" TEXT;
