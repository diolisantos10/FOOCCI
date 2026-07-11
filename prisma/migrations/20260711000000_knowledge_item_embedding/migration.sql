-- Retrieval por embedding no conhecimento curado do Brain (aditivo).
-- Backfill é lazy em runtime (KnowledgeEmbeddingService) — nada a migrar aqui.
ALTER TABLE "restaurant_knowledge_items" ADD COLUMN IF NOT EXISTS "embedding" JSONB;
ALTER TABLE "restaurant_knowledge_items" ADD COLUMN IF NOT EXISTS "embeddingModel" TEXT;
