import { prisma } from '@/lib/db'
import { AppError, fail, ok } from '@/lib/http'
import { releaseExpired } from '@/lib/orders/service'
import { withinHours } from '@/lib/hours'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  try {
    void releaseExpired().catch(console.error)
    const canteenId = new URL(req.url).searchParams.get('canteenId')
    const canteens = canteenId ? null : await prisma.canteen.findMany({ take: 2 })
    const canteen = canteenId
      ? await prisma.canteen.findUnique({ where: { id: canteenId } })
      : canteens?.[0]
    if (!canteen) throw new AppError('NO_CANTEEN', 'The canteen has not been set up yet.', 404)
    if (!canteenId && (canteens?.length ?? 0) > 1) {
      throw new AppError('CANTEEN_REQUIRED', 'Choose a canteen to view its menu.', 400)
    }

    const [counters, foods, slots] = await Promise.all([
      prisma.counter.findMany({ where: { canteenId: canteen.id, isOpen: true }, select: { id: true, name: true } }),
      prisma.foodItem.findMany({
        where: { canteenId: canteen.id, isAvailable: true },
        orderBy: { name: 'asc' },
      }),
      prisma.pickupSlot.findMany({
        where: { canteenId: canteen.id, isOpen: true, startsAt: { gt: new Date() } },
        orderBy: { startsAt: 'asc' },
        take: 12,
      }),
    ])

    return ok({
      canteen: {
        id: canteen.id,
        name: canteen.name,
        collegeName: canteen.collegeName || 'ACE Engineering College',
        isOpen: canteen.isOpen && withinHours(canteen),
      },
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
