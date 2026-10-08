import { afterAll, afterEach, describe, expect, it } from 'vitest'

const url = process.env.TEST_DATABASE_URL
const canteenIds: string[] = []
const userIds: string[] = []
let db: typeof import('../src/lib/db').prisma | undefined

describe.skipIf(!url)('recent order recovery', () => {
  async function setup() {
    process.env.DATABASE_URL = url
    const { prisma } = await import('../src/lib/db')
    db = prisma
    const canteens = await Promise.all([
      prisma.canteen.create({ data: { name: `Recovery canteen ${crypto.randomUUID()}` } }),
      prisma.canteen.create({ data: { name: `Other canteen ${crypto.randomUUID()}` } }),
    ])
    canteenIds.push(...canteens.map((canteen) => canteen.id))
    const student = await prisma.user.create({
      data: {
        email: `recovery-${crypto.randomUUID()}@test.local`,
        name: 'Ananya Student',
        studentId: `ROLL-${crypto.randomUUID().slice(0, 8)}`,
        passwordHash: 'test-only',
      },
    })
    userIds.push(student.id)

    const [counter, slot] = await Promise.all([
      prisma.counter.create({ data: { name: 'Main', canteenId: canteens[0].id } }),
      prisma.pickupSlot.create({
        data: {
          canteenId: canteens[0].id,
          startsAt: new Date(Date.now() + 60_000),
          endsAt: new Date(Date.now() + 120_000),
        },
      }),
    ])
    const food = await prisma.foodItem.create({
      data: { name: 'Tea', pricePaise: 1500, stock: 10, canteenId: canteens[0].id },
    })

    const order = (canteenId: string, number: string, createdAt: Date) => prisma.order.create({
      data: {
        number,
        userId: student.id,
        canteenId,
        counterId: counter.id,
        slotId: slot.id,
        status: 'COLLECTED',
        totalPaise: 4500,
        holdUntil: createdAt,
        createdAt,
        items: { create: [{ foodId: food.id, name: 'Tea', unitPaise: 1500, qty: 3 }] },
      },
    })

    const recentNumber = `REC-${crypto.randomUUID()}`
    const wrongTenantNumber = `TENANT-${crypto.randomUUID()}`
    const oldNumber = `OLD-${crypto.randomUUID()}`
    await Promise.all([
      order(canteens[0].id, recentNumber, new Date()),
      order(canteens[1].id, wrongTenantNumber, new Date()),
      order(canteens[0].id, oldNumber, new Date(Date.now() - 73 * 60 * 60 * 1000)),
    ])
    return { canteen: canteens[0], student, recentNumber, wrongTenantNumber, oldNumber }
  }

  afterEach(async () => {
    if (!db || !canteenIds.length) return
    const ids = canteenIds.splice(0)
    await db.auditLog.deleteMany({ where: { resource: 'student-orders', resourceId: { in: ids } } })
    await db.orderItem.deleteMany({ where: { order: { canteenId: { in: ids } } } })
    await db.order.deleteMany({ where: { canteenId: { in: ids } } })
    await db.pickupSlot.deleteMany({ where: { canteenId: { in: ids } } })
    await db.foodItem.deleteMany({ where: { canteenId: { in: ids } } })
    await db.counter.deleteMany({ where: { canteenId: { in: ids } } })
    await db.user.deleteMany({ where: { id: { in: userIds.splice(0) } } })
    await db.canteen.deleteMany({ where: { id: { in: ids } } })
  })

  afterAll(async () => {
    if (db) await db.$disconnect()
  })

  it('recovers exact roll-number orders only within the tenant and 72-hour window', async () => {
    const { recoverRecentOrders } = await import('../src/lib/orders/recovery')
    const { canteen, student, recentNumber, wrongTenantNumber, oldNumber } = await setup()
    const result = await recoverRecentOrders('recovery-admin', canteen.id, { type: 'roll', value: student.studentId! })

    expect(result.retentionHours).toBe(72)
    expect(result.orders.map((order) => order.number)).toEqual([recentNumber])
    expect(result.orders.map((order) => order.number)).not.toContain(wrongTenantNumber)
    expect(result.orders.map((order) => order.number)).not.toContain(oldNumber)
  })

  it('supports name searches and audits only a hash of the search term', async () => {
    const { recoverRecentOrders } = await import('../src/lib/orders/recovery')
    const { canteen, recentNumber } = await setup()
    const query = 'Ananya'
    const result = await recoverRecentOrders('recovery-admin', canteen.id, { type: 'name', value: query })
    const audit = await db!.auditLog.findFirstOrThrow({
      where: { action: 'ORDER_RECOVERY_SEARCH', resourceId: canteen.id },
    })

    expect(result.orders.map((order) => order.number)).toContain(recentNumber)
    expect(JSON.stringify(audit.metadata)).not.toContain(query)
    expect(audit.metadata).toMatchObject({ searchType: 'name', windowHours: 72, resultCount: 1 })
  })
})
