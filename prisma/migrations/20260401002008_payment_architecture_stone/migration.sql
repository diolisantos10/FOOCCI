-- CreateEnum
CREATE TYPE "PaymentMode" AS ENUM ('PAY_NOW', 'PAY_ON_DELIVERY', 'PAY_ON_PICKUP');

-- AlterEnum
ALTER TYPE "OrderStatus" ADD VALUE 'AWAITING_PAYMENT';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "PaymentMethod" ADD VALUE 'CARD_MACHINE';
ALTER TYPE "PaymentMethod" ADD VALUE 'PIX_IN_PERSON';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "PaymentStatus" ADD VALUE 'LINK_SENT';
ALTER TYPE "PaymentStatus" ADD VALUE 'PAY_ON_DELIVERY';
ALTER TYPE "PaymentStatus" ADD VALUE 'PAY_ON_PICKUP';
ALTER TYPE "PaymentStatus" ADD VALUE 'EXPIRED';

-- AlterTable
ALTER TABLE "customer_preferences" ALTER COLUMN "dietary" DROP DEFAULT,
ALTER COLUMN "allergies" DROP DEFAULT;

-- AlterTable
ALTER TABLE "payments" ADD COLUMN     "expiresAt" TIMESTAMP(3),
ADD COLUMN     "paymentMode" "PaymentMode" NOT NULL DEFAULT 'PAY_NOW',
ADD COLUMN     "paymentUrl" TEXT,
ADD COLUMN     "providerName" TEXT,
ADD COLUMN     "providerReference" TEXT;
