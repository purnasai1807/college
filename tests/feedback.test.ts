import { afterAll, afterEach, describe, expect, it } from 'vitest'

const url = process.env.TEST_DATABASE_URL
const canteenIds: string[] = []
const userIds: string[] = []
let db: typeof import('../src/lib/db').prisma | undefined

describe.skipIf(!url)('student order feedback', () => {
  async function setup() {
    process.env.DATABASE_URL = url
    const { prisma } = await import('../src/lib/db')
    db = prisma
    const canteen = await prisma.canteen.create({ data: { name: `Feedback test ${Date.now()}` } })
    canteenIds.push(canteen.id)
    const student = await prisma.user.create({
      data: { email: `feedback-${crypto.randomUUID()}@test.local`, name: 'Test student', passwordHash: 'x' },
    })
    userIds.push(student.id)
    const counter = await prisma.counter.create({ data: { name: 'Main', canteenId: canteen.id } })
    const slot = await prisma.pickupSlot.create({
      data: {
        canteenId: canteen.id,
        startsAt: new Date(Date.now() + 60_000),
        endsAt: new Date(Date.now() + 120_000),
      },
    })
    return { prisma, canteen, student, counter, slot }
  }

  afterEach(async () => {
    if (!db || !canteenIds.length) return
    const ids = canteenIds.splice(0)
    await db.feedback.deleteMany({ where: { canteenId: { in: ids } } })
    await db.order.deleteMany({ where: { canteenId: { in: ids } } })
    await db.pickupSlot.deleteMany({ where: { canteenId: { in: ids } } })
    await db.counter.deleteMany({ where: { canteenId: { in: ids } } })
    await db.user.deleteMany({ where: { id: { in: userIds.splice(0) } } })
    await db.canteen.deleteMany({ where: { id: { in: ids } } })
  })

  afterAll(async () => {
    if (db) await db.$disconnect()
  })

  it('allows one feedback record only after collection and prevents duplicates', async () => {
    const { prisma, canteen, student, counter, slot } = await setup()
    const order = await prisma.order.create({
      data: {
        number: `FDB-${crypto.randomUUID()}`,
        userId: student.id,
        canteenId: canteen.id,
        counterId: counter.id,
        slotId: slot.id,
        status: 'COLLECTED',
        totalPaise: 100,
        holdUntil: new Date(),
      },
    })

    await expect(prisma.feedback.create({
      data: { userId: student.id, canteenId: canteen.id, orderId: order.id, rating: 5, comment: 'Great!' },
    })).resolves.toMatchObject({ rating: 5, status: 'NEW' })
    await expect(prisma.feedback.create({
      data: { userId: student.id, canteenId: canteen.id, orderId: order.id, rating: 4 },
    })).rejects.toMatchObject({ code: 'P2002' })
  })

  it('stores an admin response and status on the feedback record', async () => {
    const { prisma, canteen, student, counter, slot } = await setup()
    const order = await prisma.order.create({
      data: {
        number: `FDB-${crypto.randomUUID()}`,
        userId: student.id,
        canteenId: canteen.id,
        counterId: counter.id,
        slotId: slot.id,
        status: 'COLLECTED',
        totalPaise: 100,
        holdUntil: new Date(),
      },
    })
    const feedback = await prisma.feedback.create({
      data: { userId: student.id, canteenId: canteen.id, orderId: order.id, rating: 2 },
    })
    await expect(prisma.feedback.update({
      where: { id: feedback.id },
      data: { status: 'RESOLVED', response: 'Thanks for letting us know.' },
    })).resolves.toMatchObject({ status: 'RESOLVED', response: 'Thanks for letting us know.' })
  })
})
