import { AppError } from './http'
import { prisma } from './db'

let lastSweepAt = 0

export async function limit(req: Request, key: string, max: number, windowMs = 60_000) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? 'local'
  const id = `${key}:${ip}`
  const now = Date.now()
  const windowStartedAt = new Date(Math.floor(now / windowMs) * windowMs)
  const [bucket] = await prisma.$queryRaw<{ hits: number }[]>`
    INSERT INTO "RateLimitBucket" ("key", "windowStartedAt", "hits")
    VALUES (${id}, ${windowStartedAt}, 1)
    ON CONFLICT ("key") DO UPDATE SET
      "hits" = CASE
        WHEN "RateLimitBucket"."windowStartedAt" = EXCLUDED."windowStartedAt"
          THEN "RateLimitBucket"."hits" + 1
        ELSE 1
      END,
      "windowStartedAt" = EXCLUDED."windowStartedAt"
    RETURNING "hits"`
  if (bucket.hits > max) {
    throw new AppError('RATE_LIMITED', 'Too many attempts. Please wait a minute and try again.', 429)
  }
  if (now - lastSweepAt > 3_600_000) {
    await prisma.rateLimitBucket.deleteMany({ where: { windowStartedAt: { lt: new Date(now - 86_400_000) } } })
    lastSweepAt = now
  }
}
