import { prisma } from '@/lib/db'
import { AppError, fail, ok } from '@/lib/http'
import { requireSession } from '@/lib/auth/session'

export const dynamic = 'force-dynamic'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSession('STUDENT')
    const { id } = await params
    const order = await prisma.order.findFirst({
      where: { id, userId: session.userId },
      include: { items: { include: { food: { select: { prepMinutes: true } } } }, counter: true, canteen: true, slot: true, payment: true },
    })
    if (!order) throw new AppError('ORDER_NOT_FOUND', 'Order could not be found.', 404)

    const awaitingPayment = order.status === 'PAYMENT_PENDING' && order.payment

    const lanes = Number(process.env.KITCHEN_LANES ?? 3)
    const prep = (items: { food: { prepMinutes: number } }[]) => Math.max(...items.map((i) => i.food.prepMinutes))
    let queue: { position: number; readyAt: Date } | null = null
    if (['PAID', 'ACCEPTED', 'PREPARING'].includes(order.status)) {
      const ahead = await prisma.order.findMany({
        where: {
          canteenId: order.canteenId,
          status: { in: ['PAID', 'ACCEPTED', 'PREPARING'] },
          OR: [
            { slot: { startsAt: { lt: order.slot.startsAt } } },
            { slot: { startsAt: order.slot.startsAt }, createdAt: { lt: order.createdAt } },
          ],
        },
        include: { items: { include: { food: { select: { prepMinutes: true } } } } },
      })
      const minutes = ahead.reduce((n, o) => n + prep(o.items), 0) / lanes + prep(order.items)
      queue = { position: ahead.length + 1, readyAt: new Date(Date.now() + Math.ceil(minutes) * 60_000) }
    }
    return ok({
      id: order.id,
      number: order.number,
      status: order.status,
      totalPaise: order.totalPaise,
      createdAt: order.createdAt,
      canteenName: order.canteen.name,
      counter: order.counter.name,
      slot: { startsAt: order.slot.startsAt, endsAt: order.slot.endsAt },
      items: order.items.map((i) => ({ name: i.name, qty: i.qty, unitPaise: i.unitPaise })),
      queue,
      checkout: awaitingPayment
        ? { providerOrderId: order.payment!.providerOrderId, publicKey: process.env.PAYMENT_PROVIDER_KEY }
        : null,
    })
  } catch (e) {
    return fail(e)
  }
}
