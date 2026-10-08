import { Prisma } from '@prisma/client'
import { prisma } from '../db'
import { AppError } from '../http'
import { newNonce, parseToken, tokenFor } from '../qr'
import { withinHours } from '../hours'

type Tx = Prisma.TransactionClient

const HOLD_MINUTES = Number(process.env.RESERVATION_MINUTES ?? 10)
const OPEN_STATES = ['CREATED', 'PAYMENT_PENDING'] as const

type NewOrder = {
  canteenId: string
  counterId: string
  slotId: string
  items: { foodId: string; qty: number }[]
}

async function nextOrderNumber(tx: Tx) {
  const day = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }).replace(/-/g, '')
  const seq = await tx.orderSeq.upsert({
    where: { day },
    create: { day, last: 1 },
    update: { last: { increment: 1 } },
  })
  return `CAN-${day}-${String(seq.last).padStart(4, '0')}`
}

export async function createOrder(userId: string, input: NewOrder) {
  const wanted = new Map<string, number>()
  for (const { foodId, qty } of input.items) wanted.set(foodId, (wanted.get(foodId) ?? 0) + qty)

  return prisma.$transaction(async (tx) => {
    const canteen = await tx.canteen.findUnique({ where: { id: input.canteenId } })
    if (!canteen || !canteen.isOpen || !withinHours(canteen)) {
      throw new AppError('CANTEEN_CLOSED', 'Ordering is temporarily unavailable.', 409)
    }

    const counter = await tx.counter.findFirst({
      where: { id: input.counterId, canteenId: canteen.id, isOpen: true },
    })
    if (!counter) throw new AppError('COUNTER_UNAVAILABLE', 'That counter is not available right now.', 409)

    const foods = await tx.foodItem.findMany({
      where: { id: { in: [...wanted.keys()] }, canteenId: canteen.id, isAvailable: true },
    })
    if (foods.length !== wanted.size) {
      throw new AppError('FOOD_UNAVAILABLE', 'One of the items is no longer available.', 409)
    }

    let totalPaise = 0
    const lines = []
    for (const food of foods) {
      const qty = wanted.get(food.id)!
      const held = await tx.foodItem.updateMany({
        where: { id: food.id, isAvailable: true, stock: { gte: qty } },
        data: { stock: { decrement: qty }, reserved: { increment: qty } },
      })
      if (held.count === 0) throw new AppError('SOLD_OUT', `${food.name} is sold out.`, 409)
      totalPaise += food.pricePaise * qty
      lines.push({ foodId: food.id, name: food.name, unitPaise: food.pricePaise, qty })
    }

    const slotTaken = await tx.$executeRaw`
      UPDATE "PickupSlot" SET booked = booked + 1
      WHERE id = ${input.slotId} AND "canteenId" = ${canteen.id}
        AND "isOpen" = true AND booked < capacity AND "startsAt" > now()`
    if (slotTaken === 0) throw new AppError('SLOT_FULL', 'That pickup slot is full.', 409)

    return tx.order.create({
      data: {
        number: await nextOrderNumber(tx),
        userId,
        canteenId: canteen.id,
        counterId: counter.id,
        slotId: input.slotId,
        totalPaise,
        holdUntil: new Date(Date.now() + HOLD_MINUTES * 60_000),
        items: { create: lines },
      },
    })
  })
}

export async function releaseHold(tx: Tx, orderId: string) {
  const closed = await tx.order.updateMany({
    where: { id: orderId, status: { in: [...OPEN_STATES] } },
    data: { status: 'CANCELLED' },
  })
  if (closed.count === 0) return false

  const items = await tx.orderItem.findMany({ where: { orderId } })
  for (const i of items) {
    await tx.foodItem.update({
      where: { id: i.foodId },
      data: { stock: { increment: i.qty }, reserved: { decrement: i.qty } },
    })
  }
  const order = await tx.order.findUniqueOrThrow({ where: { id: orderId } })
  await tx.$executeRaw`UPDATE "PickupSlot" SET booked = booked - 1 WHERE id = ${order.slotId}`
  await tx.payment.updateMany({
    where: { orderId, status: { in: ['PENDING', 'PROCESSING'] } },
    data: { status: 'EXPIRED' },
  })
  return true
}

export async function releaseExpired() {
  const stale = await prisma.order.findMany({
    where: { status: { in: [...OPEN_STATES] }, holdUntil: { lt: new Date() } },
    select: { id: true },
    take: 200,
  })
  let released = 0
  for (const { id } of stale) {
    if (await prisma.$transaction((tx) => releaseHold(tx, id))) released++
  }
  return released
}

type PaymentEventInput = {
  eventId: string
  type: string
  providerOrderId: string
  providerPaymentId: string
  amountPaise: number
  currency: string
  raw: unknown
}

export async function confirmPayment(ev: PaymentEventInput) {
  try {
    const refundId = await prisma.$transaction(async (tx) => {
      await tx.paymentEvent.create({
        data: { id: ev.eventId, type: ev.type, payload: ev.raw as Prisma.InputJsonValue },
      })

      const payment = await tx.payment.findUnique({ where: { providerOrderId: ev.providerOrderId } })
      if (!payment) throw new AppError('PAYMENT_NOT_FOUND', 'Unknown payment.', 404)

      if (payment.amountPaise !== ev.amountPaise || payment.currency !== ev.currency) {
        await tx.auditLog.create({
          data: {
            action: 'PAYMENT_AMOUNT_MISMATCH',
            resource: 'payment',
            resourceId: payment.id,
            metadata: { expected: payment.amountPaise, received: ev.amountPaise, currency: ev.currency },
          },
        })
        return undefined
      }
      if (payment.status === 'SUCCESS' || payment.status === 'REFUNDED') return undefined

      const paid = await tx.order.updateMany({
        where: { id: payment.orderId, status: { in: [...OPEN_STATES] } },
        data: { status: 'PAID' },
      })
      if (paid.count === 0) {
        const order = await tx.order.findUniqueOrThrow({ where: { id: payment.orderId } })
        if (order.status === 'CANCELLED') {
          const refundPending = await tx.order.updateMany({
            where: { id: order.id, status: 'CANCELLED' },
            data: { status: 'REFUND_PENDING' },
          })
          if (refundPending.count) {
            await tx.payment.update({
              where: { id: payment.id },
              data: { status: 'REFUND_PENDING', providerPaymentId: ev.providerPaymentId, capturedAt: new Date() },
            })
            const refund = await tx.refund.create({
              data: { orderId: order.id, paymentId: payment.id, amountPaise: payment.amountPaise },
            })
            await tx.auditLog.create({
              data: { action: 'LATE_PAYMENT_REFUND_STARTED', resource: 'order', resourceId: order.id },
            })
            await tx.notification.create({
              data: {
                userId: order.userId,
                title: 'Late payment received',
                body: `Payment for cancelled order ${order.number} arrived after the reservation expired. A refund has been started.`,
              },
            })
            return refund.id
          }
        }
        await tx.payment.update({
          where: { id: payment.id },
          data: { status: 'SUCCESS', providerPaymentId: ev.providerPaymentId, capturedAt: new Date() },
        })
        await tx.auditLog.create({
          data: { action: 'PAYMENT_ON_CLOSED_ORDER', resource: 'payment', resourceId: payment.id },
        })
        return undefined
      }

      await tx.payment.update({
        where: { id: payment.id },
        data: { status: 'SUCCESS', providerPaymentId: ev.providerPaymentId, capturedAt: new Date() },
      })
      const order = await tx.order.findUniqueOrThrow({
        where: { id: payment.orderId },
        include: { items: true },
      })
      for (const i of order.items) {
        await tx.foodItem.update({
          where: { id: i.foodId },
          data: { reserved: { decrement: i.qty }, sold: { increment: i.qty } },
        })
      }
      await tx.pickupToken.create({ data: { orderId: order.id, nonce: newNonce() } })
      await tx.notification.create({
        data: {
          userId: order.userId,
          title: 'Payment successful',
          body: `Order ${order.number} is confirmed. Your pickup QR is ready.`,
        },
      })
      return undefined
    })
    if (refundId) return { refundId }
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') return 'duplicate'
    throw e
  }
}

export async function failPayment(ev: Pick<PaymentEventInput, 'eventId' | 'type' | 'providerOrderId' | 'raw'>) {
  try {
    await prisma.$transaction(async (tx) => {
      await tx.paymentEvent.create({
        data: { id: ev.eventId, type: ev.type, payload: ev.raw as Prisma.InputJsonValue },
      })
      const payment = await tx.payment.findUnique({
        where: { providerOrderId: ev.providerOrderId },
        include: { order: true },
      })
      if (!payment) throw new AppError('PAYMENT_NOT_FOUND', 'Unknown payment.', 404)

      const failed = await tx.payment.updateMany({
        where: { id: payment.id, status: { in: ['PENDING', 'PROCESSING'] } },
        data: { status: 'FAILED' },
      })
      if (failed.count) {
        await tx.notification.create({
          data: {
            userId: payment.order.userId,
            title: 'Payment failed',
            body: `Payment for order ${payment.order.number} failed. You can try again before the reservation expires.`,
          },
        })
      }
    })
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') return 'duplicate'
    throw e
  }
}

const NEXT_STEP = {
  ACCEPTED: 'PAID',
  PREPARING: 'ACCEPTED',
  READY: 'PREPARING',
} as const

export async function advanceOrder(actor: { userId: string; canteenId?: string; counterId?: string }, orderId: string, to: keyof typeof NEXT_STEP) {
  if (!actor.canteenId) throw new AppError('CANTEEN_REQUIRED', 'Your account is not assigned to a canteen.', 409)
  return prisma.$transaction(async (tx) => {
    const moved = await tx.order.updateMany({
      where: { id: orderId, canteenId: actor.canteenId, ...(actor.counterId ? { counterId: actor.counterId } : {}), status: NEXT_STEP[to] },
      data: { status: to },
    })
    if (moved.count === 0) {
      throw new AppError('INVALID_TRANSITION', `This order cannot move to ${to} right now.`, 409)
    }
    const order = await tx.order.findUniqueOrThrow({ where: { id: orderId } })
    await tx.auditLog.create({
      data: { userId: actor.userId, action: `ORDER_${to}`, resource: 'order', resourceId: orderId },
    })
    if (to === 'READY') {
      await tx.notification.create({
        data: {
          userId: order.userId,
          title: 'Your order is ready',
          body: `Order ${order.number} is ready for pickup.`,
        },
      })
    }
    return order
  })
}

type Staff = { userId: string; role: string; canteenId?: string; counterId?: string }

export async function checkPickup(db: Tx | typeof prisma, staff: Staff, rawToken: string) {
  const invalid = () => new AppError('INVALID_QR', 'This QR code could not be verified.', 400)
  const parsed = parseToken(rawToken)
  if (!parsed) throw invalid()

  const token = await db.pickupToken.findUnique({
    where: { nonce: parsed.nonce },
    include: {
      order: {
        include: { items: true, counter: true, payment: true, user: { select: { name: true } } },
      },
    },
  })
  if (!token || token.orderId !== parsed.orderId) throw invalid()

  const order = token.order
  if (!staff.canteenId || staff.canteenId !== order.canteenId) {
    throw new AppError('FORBIDDEN', 'This order belongs to a different canteen.', 403)
  }
  if (order.payment?.status !== 'SUCCESS') {
    throw new AppError('PAYMENT_NOT_CONFIRMED', 'Payment has not been confirmed for this order.', 409)
  }
  if (token.usedAt || order.status === 'COLLECTED') {
    throw new AppError('ALREADY_COLLECTED', 'This order has already been collected.', 409)
  }
  if (token.invalidatedAt || order.status === 'CANCELLED' || order.status.startsWith('REFUND')) throw invalid()
  if (order.status !== 'READY') throw new AppError('NOT_READY', 'This order is not ready yet.', 409)

  const isAdmin = staff.role === 'ADMIN' || staff.role === 'SUPER_ADMIN'
  if (!isAdmin && staff.counterId !== order.counterId) {
    throw new AppError('WRONG_COUNTER', `This order must be collected from ${order.counter.name}.`, 403)
  }
  return { token, order }
}

export async function collectOrder(staff: Staff, rawToken: string) {
  return prisma.$transaction(async (tx) => {
    const { token, order } = await checkPickup(tx, staff, rawToken)
    const moved = await tx.order.updateMany({
      where: { id: order.id, status: 'READY' },
      data: { status: 'COLLECTED', collectedAt: new Date() },
    })
    const used = await tx.pickupToken.updateMany({ where: { id: token.id, usedAt: null }, data: { usedAt: new Date() } })
    if (moved.count === 0 || used.count === 0) {
      throw new AppError('ALREADY_COLLECTED', 'This order has already been collected.', 409)
    }
    await tx.auditLog.create({
      data: { userId: staff.userId, action: 'ORDER_COLLECTED', resource: 'order', resourceId: order.id },
    })
    return { orderNumber: order.number }
  })
}

// Manual lookup still ends up in checkPickup, so every normal rule applies.
export async function tokenFromInput(input: { token?: string; orderNumber?: string }) {
  if (input.token) return input.token
  const row = input.orderNumber
    ? await prisma.pickupToken.findFirst({ where: { order: { number: input.orderNumber.trim().toUpperCase() } } })
    : null
  if (!row) throw new AppError('INVALID_QR', 'No pickup is available for that order number.', 400)
  return tokenFor(row.orderId, row.nonce)
}
