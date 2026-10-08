import { prisma } from '@/lib/db'
import { AppError, fail, ok } from '@/lib/http'
import { requireSession } from '@/lib/auth/session'
import { tokenFor } from '@/lib/qr'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSession('STUDENT')
    const { id } = await params
    const order = await prisma.order.findFirst({
      where: { id, userId: session.userId },
      include: { pickupToken: true },
    })
    if (!order) throw new AppError('ORDER_NOT_FOUND', 'Order could not be found.', 404)

    const t = order.pickupToken
    const live = t && !t.usedAt && !t.invalidatedAt && order.status !== 'CANCELLED'
    if (!live) throw new AppError('QR_UNAVAILABLE', 'No pickup QR is available for this order.', 409)

    return ok({ token: tokenFor(order.id, t.nonce), status: order.status })
  } catch (e) {
    return fail(e)
  }
}
