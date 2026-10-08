import { limit } from '@/lib/rate-limit'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { fail, ok } from '@/lib/http'
import { requireSession } from '@/lib/auth/session'
import { paymentProvider } from '@/lib/payments/provider'
import { createOrder, releaseHold } from '@/lib/orders/service'

const schema = z.object({
  canteenId: z.string().min(1),
  counterId: z.string().min(1),
  slotId: z.string().min(1),
  items: z.array(z.object({ foodId: z.string().min(1), qty: z.number().int().min(1).max(10) })).min(1).max(20),
})

export async function POST(req: Request) {
  try {
    await limit(req, 'checkout', 10)
    const session = await requireSession('STUDENT')
    const input = schema.parse(await req.json())
    const order = await createOrder(session.userId, input)

    try {
      const { providerOrderId, publicKey } = await paymentProvider.createPayment({
        amountPaise: order.totalPaise,
        receipt: order.number,
      })
      await prisma.$transaction([
        prisma.payment.create({
          data: { orderId: order.id, provider: 'razorpay', providerOrderId, amountPaise: order.totalPaise },
        }),
        prisma.order.update({ where: { id: order.id }, data: { status: 'PAYMENT_PENDING' } }),
      ])
      return ok(
        { orderId: order.id, number: order.number, amountPaise: order.totalPaise, providerOrderId, publicKey },
        201
      )
    } catch (e) {
      await prisma.$transaction((tx) => releaseHold(tx, order.id))
      throw e
    }
  } catch (e) {
    return fail(e)
  }
}

export async function GET() {
  try {
    const session = await requireSession('STUDENT')
    const orders = await prisma.order.findMany({
      where: { userId: session.userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: { items: true, counter: true },
    })
    return ok(
      orders.map((o) => ({
        id: o.id,
        number: o.number,
        status: o.status,
        totalPaise: o.totalPaise,
        createdAt: o.createdAt,
        counter: o.counter.name,
        lines: o.items.map((i) => ({ foodId: i.foodId, qty: i.qty })),
        summary: o.items.map((i) => `${i.name} × ${i.qty}`).join(', '),
      }))
    )
  } catch (e) {
    return fail(e)
  }
}
