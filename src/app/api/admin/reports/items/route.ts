import { prisma } from '@/lib/db'
import { fail, ok } from '@/lib/http'
import { requireSession } from '@/lib/auth/session'

export const dynamic = 'force-dynamic'

type ItemRow = { name: string; qty: number; revenue: number }

export async function GET(req: Request) {
  try {
    await requireSession('ADMIN', 'SUPER_ADMIN')
    const url = new URL(req.url)
    const days = Math.min(Math.max(Number(url.searchParams.get('days')) || 30, 1), 365)
    const since = new Date(Date.now() - days * 86_400_000)

    const items = await prisma.$queryRaw<ItemRow[]>`
      SELECT oi.name, SUM(oi.qty)::int AS qty, SUM(oi.qty * oi."unitPaise")::int AS revenue
      FROM "OrderItem" oi JOIN "Order" o ON o.id = oi."orderId"
      WHERE o."createdAt" >= ${since} AND o.status IN ('PAID','ACCEPTED','PREPARING','READY','COLLECTED')
      GROUP BY oi.name ORDER BY qty DESC`

    if (url.searchParams.get('format') === 'csv') {
      const csv = ['item,quantity,revenue_inr', ...items.map((i) => `"${i.name.replace(/"/g, '""')}",${i.qty},${(i.revenue / 100).toFixed(2)}`)].join('\n')
      return new Response(csv, { headers: { 'Content-Type': 'text/csv', 'Content-Disposition': `attachment; filename="items-${days}d.csv"` } })
    }

    const [daily, payments, lowStock] = await Promise.all([
      prisma.$queryRaw<{ day: string; orders: number; gross: number }[]>`
        SELECT to_char(o."createdAt" AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD') AS day,
               COUNT(*)::int AS orders, SUM(o."totalPaise")::int AS gross
        FROM "Order" o
        WHERE o."createdAt" >= ${since} AND o.status IN ('PAID','ACCEPTED','PREPARING','READY','COLLECTED')
        GROUP BY day ORDER BY day DESC`,
      prisma.payment.groupBy({ by: ['status'], where: { createdAt: { gte: since } }, _count: true, _sum: { amountPaise: true } }),
      prisma.foodItem.findMany({ where: { stock: { lte: 10 } }, select: { name: true, stock: true }, orderBy: { stock: 'asc' } }),
    ])

    return ok({
      days,
      daily,
      items,
      payments: payments.map((p) => ({ status: p.status, count: p._count, amountPaise: p._sum.amountPaise ?? 0 })),
      lowStock,
    })
  } catch (e) {
    return fail(e)
  }
}
