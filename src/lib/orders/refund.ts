import { prisma } from '../db'
import { AppError } from '../http'
import { paymentProvider } from '../payments/provider'
import { releaseHold } from './service'

const cannot = () => new AppError('CANNOT_CANCEL', 'This order can no longer be cancelled.', 409)

export async function cancelOrder(userId: string, orderId: string) {
  const order = await prisma.order.findFirst({ where: { id: orderId, userId }, include: { payment: true, items: true } })
  if (!order) throw new AppError('ORDER_NOT_FOUND', 'Order could not be found.', 404)

  if (order.status === 'CREATED' || order.status === 'PAYMENT_PENDING') {
    if (!(await prisma.$transaction((tx) => releaseHold(tx, orderId)))) throw cannot()
    return { refund: false }
  }
  const payment = order.payment
  const canteen = await prisma.canteen.findUniqueOrThrow({ where: { id: order.canteenId } })
  const cancellable = canteen.cancelAfterAccept ? ['PAID', 'ACCEPTED'] : ['PAID']
  if (!cancellable.includes(order.status) || !payment?.providerPaymentId) throw cannot()

  const refund = await prisma.$transaction(async (tx) => {
    const moved = await tx.order.updateMany({
      where: { id: orderId, status: { in: ['PAID', 'ACCEPTED'] } },
      data: { status: 'REFUND_PENDING' },
    })
    if (moved.count === 0) throw cannot()
    await tx.pickupToken.updateMany({ where: { orderId }, data: { invalidatedAt: new Date() } })
    for (const i of order.items) {
      await tx.foodItem.update({ where: { id: i.foodId }, data: { sold: { decrement: i.qty }, stock: { increment: i.qty } } })
    }
    await tx.$executeRaw`UPDATE "PickupSlot" SET booked = booked - 1 WHERE id = ${order.slotId}`
    await tx.payment.update({ where: { id: payment.id }, data: { status: 'REFUND_PENDING' } })
    await tx.auditLog.create({ data: { userId, action: 'ORDER_CANCELLED', resource: 'order', resourceId: orderId } })
    return tx.refund.create({ data: { orderId, paymentId: payment.id, amountPaise: order.totalPaise } })
  })
  await sendRefund(refund.id)
  return { refund: true }
}

// A failed call leaves the refund FAILED and the order REFUND_PENDING so an admin can retry it.
export async function sendRefund(refundId: string) {
  const refund = await prisma.refund.findUniqueOrThrow({ where: { id: refundId }, include: { payment: true } })
  try {
    const out = await paymentProvider.refundPayment(refund.payment.providerPaymentId!, refund.amountPaise)
    await prisma.refund.update({ where: { id: refund.id }, data: { status: 'PROCESSING', providerRefundId: out.providerRefundId } })
  } catch (e) {
    console.error('refund request failed', e)
    await prisma.refund.update({ where: { id: refund.id }, data: { status: 'FAILED' } })
  }
}

export async function completeRefund(providerRefundId: string) {
  await prisma.$transaction(async (tx) => {
    const refund = await tx.refund.findUnique({ where: { providerRefundId } })
    if (!refund || refund.status === 'SUCCESS') return
    await tx.refund.update({ where: { id: refund.id }, data: { status: 'SUCCESS' } })
    await tx.payment.update({ where: { id: refund.paymentId }, data: { status: 'REFUNDED' } })
    const order = await tx.order.update({ where: { id: refund.orderId }, data: { status: 'REFUNDED' } })
    await tx.notification.create({
      data: { userId: order.userId, title: 'Refund completed', body: `Your refund for order ${order.number} has been processed.` },
    })
  })
}
