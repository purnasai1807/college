import { prisma } from '@/lib/db'
import { fail, ok } from '@/lib/http'
import { requireSession } from '@/lib/auth/session'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    await requireSession('STAFF', 'KITCHEN', 'ADMIN', 'SUPER_ADMIN')
    const orders = await prisma.order.findMany({
      where: { status: { in: ['PAID', 'ACCEPTED', 'PREPARING', 'READY'] } },
      orderBy: [{ slot: { startsAt: 'asc' } }, { createdAt: 'asc' }],
      take: 100,
      include: { items: true, counter: true, slot: true },
    })
    return ok(
      orders.map((o) => ({
        id: o.id,
        number: o.number,
        status: o.status,
        counter: o.counter.name,
        slotStart: o.slot.startsAt,
        slotEnd: o.slot.endsAt,
        items: o.items.map((i) => ({ name: i.name, qty: i.qty })),
      }))
    )
  } catch (e) {
    return fail(e)
  }
}
