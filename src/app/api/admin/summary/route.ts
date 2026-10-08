import { prisma } from '@/lib/db'
import { fail, ok } from '@/lib/http'
import { requireSession } from '@/lib/auth/session'
import { canteenForSession } from '@/lib/auth/canteen'

export const dynamic = 'force-dynamic'

const REVENUE = ['PAID', 'ACCEPTED', 'PREPARING', 'READY', 'COLLECTED'] as const

export async function GET(req: Request) {
  try {
    const admin = await requireSession('ADMIN', 'SUPER_ADMIN')
    const canteenId = await canteenForSession(admin, new URL(req.url).searchParams.get('canteenId'))
    const day = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
    const since = new Date(`${day}T00:00:00+05:30`)

    const [canteen, byStatus, revenue, refunded, recent, foods, unpaid, orphaned] = await Promise.all([
      prisma.canteen.findUniqueOrThrow({ where: { id: canteenId } }),
      prisma.order.groupBy({ by: ['status'], where: { canteenId, createdAt: { gte: since } }, _count: true }),
      prisma.order.aggregate({ where: { canteenId, createdAt: { gte: since }, status: { in: [...REVENUE] } }, _sum: { totalPaise: true } }),
      prisma.refund.aggregate({ where: { createdAt: { gte: since }, status: 'SUCCESS', payment: { order: { canteenId } } }, _sum: { amountPaise: true } }),
      prisma.order.findMany({ where: { canteenId }, orderBy: { createdAt: 'desc' }, take: 25, include: { user: { select: { name: true } }, counter: true } }),
      prisma.foodItem.findMany({ where: { canteenId }, orderBy: { name: 'asc' } }),
      // paid-looking orders with no successful payment behind them
      prisma.order.findMany({
        where: { canteenId, status: { in: [...REVENUE] }, NOT: { payment: { is: { status: 'SUCCESS' } } } },
        select: { id: true, number: true, status: true },
        take: 50,
      }),
      // successful payments whose order never became paid
      prisma.payment.findMany({
        where: { status: 'SUCCESS', order: { canteenId, status: { in: ['CREATED', 'PAYMENT_PENDING', 'CANCELLED'] } } },
        select: { id: true, amountPaise: true, order: { select: { number: true, status: true } } },
        take: 50,
      }),
    ])

    const failedRefunds = await prisma.refund.findMany({ where: { status: 'FAILED', payment: { order: { canteenId } } }, select: { id: true, orderId: true, amountPaise: true } })
    const counters = await prisma.counter.findMany({ where: { canteenId }, select: { id: true, name: true } })

    const count = (...s: string[]) => byStatus.filter((r) => s.includes(r.status)).reduce((n, r) => n + r._count, 0)
    return ok({
      canteen: { name: canteen.name, isOpen: canteen.isOpen },
      stats: {
        orders: count(...REVENUE, 'CANCELLED', 'REFUND_PENDING', 'REFUNDED'),
        preparing: count('ACCEPTED', 'PREPARING'),
        ready: count('READY'),
        collected: count('COLLECTED'),
        revenuePaise: revenue._sum.totalPaise ?? 0,
        refundsPaise: refunded._sum.amountPaise ?? 0,
      },
      failedRefunds,
      counters,
      mismatches: [
        ...unpaid.map((o) => `Order ${o.number} is ${o.status} but has no successful payment`),
        ...orphaned.map((p) => `Payment for order ${p.order.number} succeeded but the order is ${p.order.status}`),
      ],
      recent: recent.map((o) => ({ id: o.id, number: o.number, student: o.user.name, counter: o.counter.name, status: o.status, totalPaise: o.totalPaise })),
      foods: foods.map((f) => ({
        id: f.id,
        name: f.name,
        description: f.description,
        category: f.category,
        pricePaise: f.pricePaise,
        imageUrl: f.imageUrl,
        prepMinutes: f.prepMinutes,
        stock: f.stock,
        isAvailable: f.isAvailable,
      })),
    })
  } catch (e) {
    return fail(e)
  }
}
