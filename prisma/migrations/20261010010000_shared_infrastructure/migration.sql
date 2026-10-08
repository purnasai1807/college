CREATE TABLE "RateLimitBucket" (
    "key" TEXT NOT NULL,
    "windowStartedAt" TIMESTAMP(3) NOT NULL,
    "hits" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "RateLimitBucket_pkey" PRIMARY KEY ("key")
);

CREATE INDEX "RateLimitBucket_windowStartedAt_idx" ON "RateLimitBucket"("windowStartedAt");

CREATE TABLE "RealtimeEvent" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RealtimeEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "RealtimeEvent_createdAt_idx" ON "RealtimeEvent"("createdAt");
