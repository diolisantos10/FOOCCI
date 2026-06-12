-- Meta OAuth state for the one-click "Conectar com Facebook" flow (ADDITIVE ONLY).
-- Short-lived, single-use CSRF state holding Page candidates (no tokens) and the
-- encrypted user access token between callback and page selection. Nothing here
-- sends a message, creates a customer/order/Pix, or stores a token in plaintext.

CREATE TABLE IF NOT EXISTS "meta_oauth_states" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "userAccessTokenEncrypted" TEXT,
    "candidates" JSONB,
    "error" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "meta_oauth_states_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "meta_oauth_states_state_key" ON "meta_oauth_states" ("state");
CREATE INDEX IF NOT EXISTS "meta_oauth_states_restaurantId_status_idx" ON "meta_oauth_states" ("restaurantId", "status");
CREATE INDEX IF NOT EXISTS "meta_oauth_states_expiresAt_idx" ON "meta_oauth_states" ("expiresAt");
