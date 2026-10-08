import { prisma } from '@/lib/db'
import { AppError, fail, ok } from '@/lib/http'
import { releaseExpired } from '@/lib/orders/service'
import { withinHours } from '@/lib/hours'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    void releaseExpired().catch(console.error)
    const canteen = await prisma.canteen.findFirst()
    if (!canteen) throw new AppError('NO_CANTEEN', 'The canteen has not been set up yet.', 404)

    const [counters, foods, slots] = await Promise.all([
      prisma.counter.findMany({ where: { canteenId: canteen.id, isOpen: true }, select: { id: true, name: true } }),
      prisma.foodItem.findMany({
        where: { canteenId: canteen.id, isAvailable: true },
        orderBy: { name: 'asc' },
      }),
      prisma.pickupSlot.findMany({
        where: { canteenId: canteen.id, startsAt: { gt: new Date() } },
        orderBy: { startsAt: 'asc' },
        take: 12,
      }),
    ])

    return ok({
      canteen: { id: canteen.id, name: canteen.name, collegeName: canteen.collegeName, isOpen: canteen.isOpen && withinHours(canteen) },
      counters,
      foods: foods.map((f) => ({
        id: f.id,
        name: f.name,
        description: f.description,
        category: f.category,
        pricePaise: f.pricePaise,
        imageUrl: f.imageUrl,
        prepMinutes: f.prepMinutes,
        soldOut: f.stock <= 0,
      })),
      slots: slots.map((s) => ({ id: s.id, startsAt: s.startsAt, endsAt: s.endsAt, left: s.capacity - s.booked })),
    })
  } catch (e) {
    return fail(e)
  }
}
