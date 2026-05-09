-- CreateTable: restaurant_onboarding_statuses
-- Stores only the manually-triggered final-test timestamp.
-- All other onboarding step statuses are computed dynamically.

CREATE TABLE "restaurant_onboarding_statuses" (
    "id"                   TEXT        NOT NULL,
    "restaurantId"         TEXT        NOT NULL,
    "finalTestCompletedAt" TIMESTAMP(3),
    "createdAt"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"            TIMESTAMP(3) NOT NULL,

    CONSTRAINT "restaurant_onboarding_statuses_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "restaurant_onboarding_statuses_restaurantId_key"
    ON "restaurant_onboarding_statuses"("restaurantId");

ALTER TABLE "restaurant_onboarding_statuses"
    ADD CONSTRAINT "restaurant_onboarding_statuses_restaurantId_fkey"
    FOREIGN KEY ("restaurantId")
    REFERENCES "restaurants"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
