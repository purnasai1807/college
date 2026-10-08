import { afterAll, afterEach, describe, expect, it } from 'vitest'

const url = process.env.TEST_DATABASE_URL
const canteenIds: string[] = []
let db: typeof import('../src/lib/db').prisma | undefined

describe.skipIf(!url)('canteen tenant isolation', () => {
  async function setup() {
    process.env.DATABASE_URL = url
    const { prisma } = await import('../src/lib/db')
    db = prisma
    const canteens = await Promise.all([
      prisma.canteen.create({ data: { name: `Tenant A ${Date.now()}` } }),
      prisma.canteen.create({ data: { name: `Tenant B ${Date.now()}` } }),
    ])
    canteenIds.push(...canteens.map((canteen) => canteen.id))
    return canteens
  }

  afterEach(async () => {
    if (!db || canteenIds.length === 0) return
    await db.canteen.deleteMany({ where: { id: { in: canteenIds.splice(0) } } })
  })

  afterAll(async () => {
    if (db) await db.$disconnect()
  })

  it('accepts the assigned canteen and rejects cross-tenant selection', async () => {
    const { canteenForSession } = await import('../src/lib/auth/canteen')
    const { AppError } = await import('../src/lib/http')
    const [assigned, other] = await setup()
    const admin = { userId: 'tenant-admin', role: 'ADMIN' as const, canteenId: assigned.id }

    await expect(canteenForSession(admin, assigned.id)).resolves.toBe(assigned.id)
    await expect(canteenForSession(admin, other.id)).rejects.toBeInstanceOf(AppError)
  })

  it('allows a super admin to select an existing canteen explicitly', async () => {
    const { canteenForSession } = await import('../src/lib/auth/canteen')
    const [assigned, other] = await setup()
    const admin = { userId: 'root-admin', role: 'SUPER_ADMIN' as const }

    await expect(canteenForSession(admin, other.id)).resolves.toBe(other.id)
    await expect(canteenForSession({ ...admin, canteenId: assigned.id })).resolves.toBe(assigned.id)
  })
})
