-- CreateTable: Google integration (Meu Negócio + Analytics GA4)
CREATE TABLE "google_integration_configs" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "connected" BOOLEAN NOT NULL DEFAULT false,
    "accessTokenEncrypted" TEXT,
    "refreshTokenEncrypted" TEXT,
    "tokenExpiresAt" TIMESTAMP(3),
    "scopes" TEXT,
    "googleEmail" TEXT,
    "googleUserId" TEXT,
    "businessAccountId" TEXT,
    "businessLocationId" TEXT,
    "businessLocationName" TEXT,
    "ga4PropertyId" TEXT,
    "ga4PropertyName" TEXT,
    "lastSyncedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "google_integration_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable: Google OAuth single-use CSRF state
CREATE TABLE "google_oauth_states" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "error" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "google_oauth_states_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "google_integration_configs_restaurantId_key" ON "google_integration_configs"("restaurantId");
CREATE UNIQUE INDEX "google_oauth_states_state_key" ON "google_oauth_states"("state");
CREATE INDEX "google_oauth_states_restaurantId_status_idx" ON "google_oauth_states"("restaurantId", "status");
CREATE INDEX "google_oauth_states_expiresAt_idx" ON "google_oauth_states"("expiresAt");

-- AddForeignKey
ALTER TABLE "google_integration_configs" ADD CONSTRAINT "google_integration_configs_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
