import { prisma } from '@/lib/db'
import { fail, ok } from '@/lib/http'
import { requireSession } from '@/lib/auth/session'
import { AppError } from '@/lib/http'
import { canteenForSession } from '@/lib/auth/canteen'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

const querySchema = z.object({
  status: z.enum(['PAID', 'ACCEPTED', 'PREPARING', 'READY']).optional(),
  search: z.string().trim().max(80).optional(),
  from: z.string().date().optional(),
  to: z.string().date().optional(),
  cursor: z.string().min(1).optional(),
})

export async function GET(req: Request) {
  try {
    const session = await requireSession('STAFF', 'KITCHEN', 'ADMIN', 'SUPER_ADMIN')
    const canteenId = await canteenForSession(session)
    const query = querySchema.parse(Object.fromEntries(new URL(req.url).searchParams))
    if (query.from && query.to && query.from > query.to) {
      throw new AppError('INVALID_DATE_RANGE', 'The start date must be on or before the end date.', 400)
    }
    if (query.cursor) {
      const cursor = await prisma.order.findFirst({
        where: { id: query.cursor, canteenId, ...(session.counterId ? { counterId: session.counterId } : {}) },
        select: { id: true },
      })
      if (!cursor) throw new AppError('INVALID_CURSOR', 'Refresh the order list before loading more.', 400)
    }
    const createdAt = query.from || query.to
      ? {
          ...(query.from ? { gte: new Date(`${query.from}T00:00:00+05:30`) } : {}),
          ...(query.to ? { lt: new Date(new Date(`${query.to}T00:00:00+05:30`).getTime() + 86_400_000) } : {}),
        }
      : undefined
    const orders = await prisma.order.findMany({
      where: {
        canteenId,
        ...(session.counterId ? { counterId: session.counterId } : {}),
        status: query.status ? query.status : { in: ['PAID', 'ACCEPTED', 'PREPARING', 'READY'] },
        ...(createdAt ? { createdAt } : {}),
        ...(query.search ? {
          OR: [
            { number: { contains: query.search, mode: 'insensitive' } },
            { user: { name: { contains: query.search, mode: 'insensitive' } } },
            { user: { email: { contains: query.search, mode: 'insensitive' } } },
          ],
        } : {}),
      },
      orderBy: [{ slot: { startsAt: 'asc' } }, { createdAt: 'asc' }],
      take: 101,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      include: { items: true, counter: true, slot: true },
    })
    const hasMore = orders.length > 100
    const page = orders.slice(0, 100)
    const response = ok(
      page.map((o) => ({
        id: o.id,
        number: o.number,
        status: o.status,
        counter: o.counter.name,
        slotStart: o.slot.startsAt,
        slotEnd: o.slot.endsAt,
        items: o.items.map((i) => ({ name: i.name, qty: i.qty })),
      }))
    )
    if (hasMore) response.headers.set('X-Next-Cursor', page[page.length - 1].id)
    return response
  } catch (e) {
    return fail(e)
  }
}
