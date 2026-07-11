-- External API access keys (Integrações → Conexões externas).
-- Read-only Bearer tokens the lojista generates so external systems (Foocci
-- Manager, the finance module) can pull sales from GET /api/v1/vendas. Only the
-- SHA-256 hash of the token is stored; the plaintext is shown once at creation.
CREATE TABLE "api_keys" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "name" TEXT,
    "tokenHash" TEXT NOT NULL,
    "tokenPrefix" TEXT NOT NULL,
    "scope" TEXT NOT NULL DEFAULT 'sales:read',
    "lastUsedAt" TIMESTAMP(3),
    "createdByUserId" TEXT,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "api_keys_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "api_keys_tokenHash_key" ON "api_keys"("tokenHash");
CREATE INDEX "api_keys_restaurantId_idx" ON "api_keys"("restaurantId");
CREATE INDEX "api_keys_tokenHash_idx" ON "api_keys"("tokenHash");

ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_restaurantId_fkey"
    FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
