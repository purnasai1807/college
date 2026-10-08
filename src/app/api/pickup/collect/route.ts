import { publish } from '@/lib/realtime'
import { z } from 'zod'
import { fail, ok } from '@/lib/http'
import { limit } from '@/lib/rate-limit'
import { requireSession } from '@/lib/auth/session'
import { collectOrder, tokenFromInput } from '@/lib/orders/service'

const schema = z.object({ token: z.string().max(200).optional(), orderNumber: z.string().max(30).optional() })

export async function POST(req: Request) {
  try {
    limit(req, 'collect', 60)
    const staff = await requireSession('STAFF', 'ADMIN', 'SUPER_ADMIN')
    const token = await tokenFromInput(schema.parse(await req.json()))
    const done = await collectOrder(staff, token)
    publish()
    return ok(done)
  } catch (e) {
    return fail(e)
  }
}
