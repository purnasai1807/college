import { publish } from '@/lib/realtime'
import { fail, ok } from '@/lib/http'
import { requireSession } from '@/lib/auth/session'
import { cancelOrder } from '@/lib/orders/refund'

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSession('STUDENT')
    const { id } = await params
    const done = await cancelOrder(session.userId, id)
    publish()
    return ok(done)
  } catch (e) {
    return fail(e)
  }
}
