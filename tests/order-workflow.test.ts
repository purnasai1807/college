import { afterAll, afterEach, describe, expect, it } from 'vitest'

const url = process.env.TEST_DATABASE_URL
const canteenIds: string[] = []
const campusIds: string[] = []
const userIds: string[] = []
const paymentEventIds: string[] = []
let db: typeof import('../src/lib/db').prisma | undefined

describe.skipIf(!url)('student menu and order workflow', () => {
  async function setup(stock = 5) {
    process.env.DATABASE_URL = url
    const { prisma } = await import('../src/lib/db')
    db = prisma
    const campus = await prisma.campus.create({ data: { name: `Workflow campus ${Date.now()}-${Math.random()}` } })
    campusIds.push(campus.id)
    const canteen = await prisma.canteen.create({
      data: { name: `Workflow canteen ${Date.now()}-${Math.random()}`, campusId: campus.id, opensAt: '00:00', closesAt: '23:59' },
    })
    canteenIds.push(canteen.id)
    const counter = await prisma.counter.create({ data: { name: 'Main counter', canteenId: canteen.id } })
    const food = await prisma.foodItem.create({
      data: { name: 'Student test meal', pricePaise: 2500, stock, canteenId: canteen.id },
    })
    const slot = await prisma.pickupSlot.create({
      data: {
        canteenId: canteen.id,
        startsAt: new Date(Date.now() + 3_600_000),
        endsAt: new Date(Date.now() + 4_200_000),
        capacity: 5,
      },
    })
    const user = await prisma.user.create({
      data: {
        email: `workflow-${Date.now()}-${Math.random()}@test.local`,
        name: 'Workflow Student',
        studentId: `W${Date.now()}${Math.floor(Math.random() * 1000)}`,
        passwordHash: 'test-only-hash',
      },
    })
    userIds.push(user.id)
    return { prisma, campus, canteen, counter, food, slot, user }
  }

  afterEach(async () => {
    if (!db) return
    const canteenIdBatch = canteenIds.splice(0)
    const campusIdBatch = campusIds.splice(0)
    const userIdBatch = userIds.splice(0)
    const eventIdBatch = paymentEventIds.splice(0)
    if (eventIdBatch.length) await db.paymentEvent.deleteMany({ where: { id: { in: eventIdBatch } } })
    if (canteenIdBatch.length) {
      const orderIds = (await db.order.findMany({ where: { canteenId: { in: canteenIdBatch } }, select: { id: true } })).map((order) => order.id)
      await db.auditLog.deleteMany({ where: { resource: 'order', resourceId: { in: orderIds } } })
      await db.notification.deleteMany({ where: { userId: { in: userIdBatch } } })
      await db.pickupToken.deleteMany({ where: { order: { canteenId: { in: canteenIdBatch } } } })
      await db.payment.deleteMany({ where: { order: { canteenId: { in: canteenIdBatch } } } })
      await db.orderItem.deleteMany({ where: { order: { canteenId: { in: canteenIdBatch } } } })
      await db.order.deleteMany({ where: { canteenId: { in: canteenIdBatch } } })
      await db.pickupSlot.deleteMany({ where: { canteenId: { in: canteenIdBatch } } })
      await db.foodItem.deleteMany({ where: { canteenId: { in: canteenIdBatch } } })
      await db.counter.deleteMany({ where: { canteenId: { in: canteenIdBatch } } })
      await db.canteen.deleteMany({ where: { id: { in: canteenIdBatch } } })
    }
    if (campusIdBatch.length) await db.campus.deleteMany({ where: { id: { in: campusIdBatch } } })
    if (userIdBatch.length) await db.user.deleteMany({ where: { id: { in: userIdBatch } } })
  })

  afterAll(async () => {
    if (db) await db.$disconnect()
  })

  it('loads real menu data, calculates checkout totals server-side, and advances a confirmed order', async () => {
    const { prisma, canteen, counter, food, slot, user } = await setup()
    const { GET: getMenu } = await import('../src/app/api/menu/route')
    const response = await getMenu(new Request(`http://localhost/api/menu?canteenId=${canteen.id}`))
    const menu = await response.json()

    expect(response.status).toBe(200)
    expect(menu.data.foods).toContainEqual(expect.objectContaining({ id: food.id, name: food.name, pricePaise: 2500, soldOut: false }))
    expect(menu.data.counters).toContainEqual(expect.objectContaining({ id: counter.id }))
    expect(menu.data.slots).toContainEqual(expect.objectContaining({ id: slot.id }))

    const { createOrder, confirmPayment, advanceOrder } = await import('../src/lib/orders/service')
    const order = await createOrder(user.id, {
      canteenId: canteen.id,
      counterId: counter.id,
      slotId: slot.id,
      items: [{ foodId: food.id, qty: 1 }, { foodId: food.id, qty: 2 }],
    })
    expect(order.totalPaise).toBe(7500)
    expect(await prisma.orderItem.findMany({ where: { orderId: order.id } })).toEqual([
      expect.objectContaining({ foodId: food.id, qty: 3, unitPaise: 2500 }),
    ])

    const providerOrderId = `provider-${order.id}`
    await prisma.payment.create({
      data: { orderId: order.id, provider: 'test', providerOrderId, amountPaise: order.totalPaise },
    })
    await prisma.order.update({ where: { id: order.id }, data: { status: 'PAYMENT_PENDING' } })
    const eventId = `workflow-payment-${order.id}`
    paymentEventIds.push(eventId)
    await confirmPayment({
      eventId,
      type: 'payment.captured',
      providerOrderId,
      providerPaymentId: `payment-${order.id}`,
      amountPaise: order.totalPaise,
      currency: 'INR',
      raw: { event: 'payment.captured' },
    })

    expect(await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).toMatchObject({ status: 'PAID', totalPaise: 7500 })
    expect(await prisma.foodItem.findUniqueOrThrow({ where: { id: food.id } })).toMatchObject({ stock: 2, reserved: 0, sold: 3 })
    expect(await prisma.pickupToken.findUnique({ where: { orderId: order.id } })).not.toBeNull()

    const staff = { userId: user.id, role: 'KITCHEN', canteenId: canteen.id }
    await expect(advanceOrder(staff, order.id, 'ACCEPTED')).resolves.toMatchObject({ status: 'ACCEPTED' })
    await expect(advanceOrder(staff, order.id, 'PREPARING')).resolves.toMatchObject({ status: 'PREPARING' })
    await expect(advanceOrder(staff, order.id, 'READY')).resolves.toMatchObject({ status: 'READY' })
    await expect(advanceOrder(staff, order.id, 'READY')).rejects.toMatchObject({ code: 'INVALID_TRANSITION' })
  })

  it('rejects an unavailable quantity without changing stock or pickup capacity', async () => {
    const { prisma, canteen, counter, food, slot, user } = await setup(1)
    const { createOrder } = await import('../src/lib/orders/service')

    await expect(createOrder(user.id, {
      canteenId: canteen.id,
      counterId: counter.id,
      slotId: slot.id,
      items: [{ foodId: food.id, qty: 2 }],
    })).rejects.toMatchObject({ code: 'SOLD_OUT' })

    expect(await prisma.foodItem.findUniqueOrThrow({ where: { id: food.id } })).toMatchObject({ stock: 1, reserved: 0 })
    expect(await prisma.pickupSlot.findUniqueOrThrow({ where: { id: slot.id } })).toMatchObject({ booked: 0 })
    expect(await prisma.order.count({ where: { canteenId: canteen.id } })).toBe(0)
  })

  it('enforces the per-item quantity limit after combining duplicate cart lines', async () => {
    const { prisma, canteen, counter, food, slot, user } = await setup(20)
    const { createOrder } = await import('../src/lib/orders/service')

    await expect(createOrder(user.id, {
      canteenId: canteen.id,
      counterId: counter.id,
      slotId: slot.id,
      items: [{ foodId: food.id, qty: 6 }, { foodId: food.id, qty: 5 }],
    })).rejects.toMatchObject({ code: 'INVALID_QUANTITY' })

    expect(await prisma.foodItem.findUniqueOrThrow({ where: { id: food.id } })).toMatchObject({ stock: 20, reserved: 0 })
    expect(await prisma.pickupSlot.findUniqueOrThrow({ where: { id: slot.id } })).toMatchObject({ booked: 0 })
    expect(await prisma.order.count({ where: { canteenId: canteen.id } })).toBe(0)
  })
})
