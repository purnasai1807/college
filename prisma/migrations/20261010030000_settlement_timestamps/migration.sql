ALTER TABLE "Payment"
ADD COLUMN "capturedAt" TIMESTAMP(3);

ALTER TABLE "Refund"
ADD COLUMN "resolvedAt" TIMESTAMP(3);

UPDATE "Payment"
SET "capturedAt" = "updatedAt"
WHERE "status" IN ('SUCCESS', 'REFUND_PENDING', 'REFUND_FAILED', 'REFUNDED');

UPDATE "Refund"
SET "resolvedAt" = "updatedAt"
WHERE "status" IN ('SUCCESS', 'FAILED');
