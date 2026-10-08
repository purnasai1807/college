import { prisma } from '@/lib/db'
import { AppError, fail, ok } from '@/lib/http'
import { requireSession } from '@/lib/auth/session'
import { sendRefund } from '@/lib/orders/refund'

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireSession('ADMIN', 'SUPER_ADMIN')
    const { id } = await params
    const claimed = await prisma.$transaction(async (tx) => {
      const result = await tx.refund.updateMany({ where: { id, status: 'FAILED' }, data: { status: 'PENDING' } })
      if (result.count) {
        const refund = await tx.refund.findUniqueOrThrow({ where: { id } })
        await tx.payment.update({ where: { id: refund.paymentId }, data: { status: 'REFUND_PENDING' } })
      }
      return result
    })
    if (claimed.count === 0) throw new AppError('NOT_RETRYABLE', 'Only a failed refund can be retried.', 409)
    await sendRefund(id)
    await prisma.auditLog.create({ data: { userId: admin.userId, action: 'REFUND_RETRIED', resource: 'refund', resourceId: id } })
    const refund = await prisma.refund.findUniqueOrThrow({ where: { id } })
    return ok({ status: refund.status })
  } catch (e) {
    return fail(e)
  }
}
