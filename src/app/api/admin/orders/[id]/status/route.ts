import { publish } from '@/lib/realtime'
import { z } from 'zod'
import { fail, ok } from '@/lib/http'
import { requireSession } from '@/lib/auth/session'
import { advanceOrder } from '@/lib/orders/service'

const schema = z.object({ status: z.enum(['ACCEPTED', 'PREPARING', 'READY']) })

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireSession('STAFF', 'KITCHEN', 'ADMIN', 'SUPER_ADMIN')
    const { status } = schema.parse(await req.json())
    const { id } = await params
    const order = await advanceOrder(actor.userId, id, status)
    publish()
    return ok({ id: order.id, status: order.status })
  } catch (e) {
    return fail(e)
  }
}
