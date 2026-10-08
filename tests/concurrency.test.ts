import { afterAll, afterEach, describe, expect, it } from 'vitest'

const url = process.env.TEST_DATABASE_URL
const canteenIds: string[] = []
const userIds: string[] = []
let db: typeof import('../src/lib/db').prisma | undefined

// Runs only against a throwaway database: TEST_DATABASE_URL=... npm test
describe.skipIf(!url)('checkout under concurrent load', () => {
  async function setup(stock: number, capacity: number) {
    process.env.DATABASE_URL = url
    const { prisma } = await import('../src/lib/db')
    db = prisma
    const tag = `${Date.now()}${Math.floor(Math.random() * 1000)}`
    const canteen = await prisma.canteen.create({
      data: { name: `Test ${tag}`, opensAt: '00:00', closesAt: '23:59' },
    })
    canteenIds.push(canteen.id)
    const counter = await prisma.counter.create({ data: { name: 'Main', canteenId: canteen.id } })
    const food = await prisma.foodItem.create({ data: { name: 'Burger', pricePaise: 6000, stock, canteenId: canteen.id } })
    const slot = await prisma.pickupSlot.create({
      data: { canteenId: canteen.id, startsAt: new Date(Date.now() + 3_600_000), endsAt: new Date(Date.now() + 4_200_000), capacity },
    })
    const users = await Promise.all(
      [1, 2].map((n) => prisma.user.create({ data: { email: `t${n}-${tag}@test.local`, name: `T${n}`, passwordHash: 'x' } }))
    )
    userIds.push(...users.map((user) => user.id))
    const order = (userId: string) => ({ userId, input: { canteenId: canteen.id, counterId: counter.id, slotId: slot.id, items: [{ foodId: food.id, qty: 1 }] } })
    return { prisma, food, slot, users, order }
  }

  afterEach(async () => {
    if (!db || canteenIds.length === 0) return
    const ids = [...canteenIds]
    canteenIds.length = 0
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

  it('sells the last item only once', async () => {
    const { createOrder } = await import('../src/lib/orders/service')
    const { prisma, food, users, order } = await setup(1, 10)
    const results = await Promise.allSettled(users.map((u) => { const o = order(u.id); return createOrder(o.userId, o.input) }))

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
    const after = await prisma.foodItem.findUniqueOrThrow({ where: { id: food.id } })
    expect(after.stock).toBe(0)
    expect(after.reserved).toBe(1)
  })

  it('does not overfill a pickup slot', async () => {
    const { createOrder } = await import('../src/lib/orders/service')
    const { prisma, slot, users, order } = await setup(10, 1)
    const results = await Promise.allSettled(users.map((u) => { const o = order(u.id); return createOrder(o.userId, o.input) }))

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
    expect((await prisma.pickupSlot.findUniqueOrThrow({ where: { id: slot.id } })).booked).toBe(1)
  })

  it('rejects a counter belonging to a different canteen', async () => {
    const { createOrder } = await import('../src/lib/orders/service')
    const { prisma, users, order } = await setup(3, 10)
    const otherCanteen = await prisma.canteen.create({ data: { name: `Other tenant ${Date.now()}` } })
    canteenIds.push(otherCanteen.id)
    const foreignCounter = await prisma.counter.create({ data: { name: 'Foreign', canteenId: otherCanteen.id } })
    const request = order(users[0].id)

    await expect(createOrder(request.userId, { ...request.input, counterId: foreignCounter.id }))
      .rejects.toMatchObject({ code: 'COUNTER_UNAVAILABLE' })
  })
})
