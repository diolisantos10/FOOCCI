-- "Indique um amigo": referral records created on the referred customer's first order.
CREATE TABLE "referrals" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "referrerCustomerId" TEXT NOT NULL,
    "referredCustomerId" TEXT NOT NULL,
    "orderId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "referrals_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "referrals_referredCustomerId_key" ON "referrals"("referredCustomerId");
CREATE INDEX "referrals_restaurantId_referrerCustomerId_idx" ON "referrals"("restaurantId", "referrerCustomerId");
CREATE INDEX "referrals_restaurantId_createdAt_idx" ON "referrals"("restaurantId", "createdAt");
