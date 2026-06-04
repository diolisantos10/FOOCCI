-- ════════════════════════════════════════════════════════════════════════════
--  Build OS — register the CURRENT operator (Diego / CEO, +55 11 94059-5223) as
--  an ACTIVE OWNER. Admin-safe + idempotent, applied automatically by
--  `prisma migrate deploy` on start (no console/DATABASE_URL/Railway needed):
--    • creates the row if it does not exist;
--    • reactivates it and sets role=owner / name if it already exists
--      (matched by the UNIQUE phone column);
--    • does NOT touch or remove any other operator (e.g. the WhatsApp Business
--      number +55 …0692) — only this single row is affected.
-- ════════════════════════════════════════════════════════════════════════════

INSERT INTO "build_authorized_senders"
  ("id", "phone", "rawPhone", "name", "role", "isActive", "allowedProjectIds", "createdAt", "updatedAt")
VALUES
  ('seed_buildos_operator_diego', '+5511940595223', '+5511940595223', 'Diego', 'owner', true, '[]'::jsonb, NOW(), NOW())
ON CONFLICT ("phone") DO UPDATE SET
  "isActive"  = true,
  "role"      = 'owner',
  "name"      = COALESCE(NULLIF("build_authorized_senders"."name", ''), EXCLUDED."name"),
  "updatedAt" = NOW();
