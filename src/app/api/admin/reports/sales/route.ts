import { prisma } from '@/lib/db'
import { fail } from '@/lib/http'
import { requireSession } from '@/lib/auth/session'

export async function GET() {
  try {
    await requireSession('ADMIN', 'SUPER_ADMIN')
    const day = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
    const orders = await prisma.order.findMany({
      where: { createdAt: { gte: new Date(`${day}T00:00:00+05:30`) } },
      orderBy: { createdAt: 'asc' },
      include: { counter: true },
    })
    const rows = orders.map((o) => [o.number, o.status, o.counter.name, (o.totalPaise / 100).toFixed(2), o.createdAt.toISOString()].join(','))
    const csv = ['order,status,counter,amount_inr,created_at', ...rows].join('\n')
    return new Response(csv, {
      headers: { 'Content-Type': 'text/csv', 'Content-Disposition': `attachment; filename="sales-${day}.csv"` },
    })
  } catch (e) {
    return fail(e)
  }
}
