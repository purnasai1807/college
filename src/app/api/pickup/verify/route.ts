import { z } from 'zod'
import { prisma } from '@/lib/db'
import { fail, ok } from '@/lib/http'
import { limit } from '@/lib/rate-limit'
import { requireSession } from '@/lib/auth/session'
import { checkPickup, tokenFromInput } from '@/lib/orders/service'

const schema = z.object({ token: z.string().max(200).optional(), orderNumber: z.string().max(30).optional() })

export async function POST(req: Request) {
  try {
    limit(req, 'verify', 120)
    const staff = await requireSession('STAFF', 'ADMIN', 'SUPER_ADMIN')
    const token = await tokenFromInput(schema.parse(await req.json()))
    const { order } = await checkPickup(prisma, staff, token)
    return ok({
      token,
      number: order.number,
      student: order.user.name,
      counter: order.counter.name,
      status: order.status,
      totalPaise: order.totalPaise,
      items: order.items.map((i) => ({ name: i.name, qty: i.qty })),
    })
  } catch (e) {
    return fail(e)
  }
}
