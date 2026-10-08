import { afterAll, describe, expect, it } from 'vitest'

const url = process.env.TEST_DATABASE_URL
let db: typeof import('../src/lib/db').prisma | undefined

describe.skipIf(!url)('shared rate limits', () => {
  afterAll(async () => {
    if (db) await db.$disconnect()
  })

  it('counts concurrent requests in PostgreSQL and rejects requests above the limit', async () => {
    process.env.DATABASE_URL = url
    const [{ prisma }, { limit }, { AppError }] = await Promise.all([
      import('../src/lib/db'),
      import('../src/lib/rate-limit'),
      import('../src/lib/http'),
    ])
    db = prisma
    const key = `integration-${crypto.randomUUID()}`
    const request = new Request('http://localhost/api/test', { headers: { 'x-forwarded-for': key } })

    try {
      const results = await Promise.allSettled([
        limit(request, 'integration', 1),
        limit(request, 'integration', 1),
      ])
      expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
      const rejected = results.find((result) => result.status === 'rejected')
      expect(rejected?.status === 'rejected' && rejected.reason).toBeInstanceOf(AppError)
      expect(await prisma.rateLimitBucket.findUnique({ where: { key: `integration:${key}` } })).toMatchObject({ hits: 2 })
    } finally {
      await prisma.rateLimitBucket.deleteMany({ where: { key: `integration:${key}` } })
    }
  })
})
