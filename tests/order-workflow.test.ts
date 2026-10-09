import { afterAll, afterEach, describe, expect, it } from 'vitest'
import { createHmac } from 'node:crypto'

const url = process.env.TEST_DATABASE_URL
const canteenIds: string[] = []
const campusIds: string[] = []
const userIds: string[] = []
const paymentEventIds: string[] = []
let db: typeof import('../src/lib/db').prisma | undefined
const originalFetch = globalThis.fetch
const originalAuthSecret = process.env.AUTH_SECRET

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
    globalThis.fetch = originalFetch
    if (originalAuthSecret) process.env.AUTH_SECRET = originalAuthSecret
    else delete process.env.AUTH_SECRET
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

  it('creates a server-priced Razorpay order, confirms its signed webhook, and completes kitchen pickup', async () => {
    const { prisma, canteen, counter, food, slot, user } = await setup()
    const { GET: getMenu } = await import('../src/app/api/menu/route')
    const response = await getMenu(new Request(`http://localhost/api/menu?canteenId=${canteen.id}`))
    const menu = await response.json()

    expect(response.status).toBe(200)
    expect(menu.data.foods).toContainEqual(expect.objectContaining({ id: food.id, name: food.name, pricePaise: 2500, soldOut: false }))
    expect(menu.data.counters).toContainEqual(expect.objectContaining({ id: counter.id }))
    expect(menu.data.slots).toContainEqual(expect.objectContaining({ id: slot.id }))
    expect(menu.data.canteen.collegeName).toBe('ACE Engineering College')

    process.env.PAYMENT_PROVIDER_KEY = 'rzp_test_example'
    process.env.PAYMENT_PROVIDER_SECRET = 'test-provider-secret'
    process.env.AUTH_SECRET = 'workflow-test-auth-secret-at-least-32-bytes-long'
    const webhookSecret = 'test-webhook-secret'
    process.env.PAYMENT_WEBHOOK_SECRET = webhookSecret
    let providerRequest: RequestInit | undefined
    globalThis.fetch = async (_input, init) => {
      providerRequest = init
      return new Response(JSON.stringify({ id: 'order_test_workflow' }), { status: 200 })
    }

    const { createOrder, advanceOrder, collectOrder } = await import('../src/lib/orders/service')
    const { paymentProvider } = await import('../src/lib/payments/provider')
    const order = await createOrder(user.id, {
      canteenId: canteen.id,
      counterId: counter.id,
      slotId: slot.id,
      items: [{ foodId: food.id, qty: 1 }, { foodId: food.id, qty: 2 }],
    })
    expect(order.totalPaise).toBe(7500)
    const checkout = await paymentProvider.createPayment({ amountPaise: order.totalPaise, receipt: order.number })
    expect(checkout).toEqual({ providerOrderId: 'order_test_workflow', publicKey: 'rzp_test_example' })
    expect(JSON.parse(String(providerRequest?.body))).toEqual({ amount: 7500, currency: 'INR', receipt: order.number })
    expect(await prisma.orderItem.findMany({ where: { orderId: order.id } })).toEqual([
      expect.objectContaining({ foodId: food.id, qty: 3, unitPaise: 2500 }),
    ])

    await prisma.payment.create({
      data: { orderId: order.id, provider: 'razorpay', providerOrderId: checkout.providerOrderId, amountPaise: order.totalPaise },
    })
    await prisma.order.update({ where: { id: order.id }, data: { status: 'PAYMENT_PENDING' } })
    const eventId = `workflow-payment-${order.id}`
    paymentEventIds.push(eventId)
    const raw = JSON.stringify({
      event: 'payment.captured',
      payload: {
        payment: {
          entity: {
            id: `payment-${order.id}`,
            order_id: checkout.providerOrderId,
            amount: order.totalPaise,
            currency: 'INR',
          },
        },
      },
    })
    const signature = createHmac('sha256', webhookSecret).update(raw).digest('hex')
    const { POST: webhook } = await import('../src/app/api/payments/webhook/route')
    const webhookResponse = await webhook(new Request('http://localhost/api/payments/webhook', {
      method: 'POST',
      headers: { 'x-razorpay-signature': signature, 'x-razorpay-event-id': eventId },
      body: raw,
    }))
    expect(webhookResponse.status).toBe(200)
    expect(await webhookResponse.json()).toMatchObject({ success: true })
    const duplicateWebhookResponse = await webhook(new Request('http://localhost/api/payments/webhook', {
      method: 'POST',
      headers: { 'x-razorpay-signature': signature, 'x-razorpay-event-id': eventId },
      body: raw,
    }))
    expect(duplicateWebhookResponse.status).toBe(200)
    expect(await prisma.paymentEvent.count({ where: { id: eventId } })).toBe(1)

    expect(await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).toMatchObject({ status: 'PAID', totalPaise: 7500 })
    expect(await prisma.foodItem.findUniqueOrThrow({ where: { id: food.id } })).toMatchObject({ stock: 2, reserved: 0, sold: 3 })
    const pickupToken = await prisma.pickupToken.findUniqueOrThrow({ where: { orderId: order.id } })

    const staff = { userId: user.id, role: 'KITCHEN', canteenId: canteen.id }
    await expect(advanceOrder(staff, order.id, 'ACCEPTED')).resolves.toMatchObject({ status: 'ACCEPTED' })
    await expect(advanceOrder(staff, order.id, 'PREPARING')).resolves.toMatchObject({ status: 'PREPARING' })
    await expect(advanceOrder(staff, order.id, 'READY')).resolves.toMatchObject({ status: 'READY' })
    await expect(advanceOrder(staff, order.id, 'READY')).rejects.toMatchObject({ code: 'INVALID_TRANSITION' })
    await expect(collectOrder({ ...staff, role: 'STAFF', counterId: counter.id }, `${order.id}.${pickupToken.nonce}.${(await import('../src/lib/qr')).tokenFor(order.id, pickupToken.nonce).split('.')[2]}`))
      .resolves.toEqual({ orderNumber: order.number })
    expect(await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).toMatchObject({ status: 'COLLECTED' })
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
