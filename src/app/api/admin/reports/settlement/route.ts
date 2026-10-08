import { prisma } from '@/lib/db'
import { AppError, fail, ok } from '@/lib/http'
import { canteenForSession } from '@/lib/auth/canteen'
import { requireSession } from '@/lib/auth/session'

const datePattern = /^\d{4}-\d{2}-\d{2}$/

function dayBounds(value: string) {
  if (!datePattern.test(value)) throw new AppError('INVALID_DATE', 'Use dates in YYYY-MM-DD format.', 400)
  const date = new Date(`${value}T00:00:00+05:30`)
  if (Number.isNaN(date.getTime()) || date.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }) !== value) {
    throw new AppError('INVALID_DATE', 'Choose a valid date.', 400)
  }
  return date
}

function csvCell(value: string | number) {
  return `"${String(value).replace(/"/g, '""')}"`
}

export async function GET(req: Request) {
  try {
    const admin = await requireSession('ADMIN', 'SUPER_ADMIN')
    const url = new URL(req.url)
    const canteenId = await canteenForSession(admin, url.searchParams.get('canteenId'))
    const fromValue = url.searchParams.get('from') ?? new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
    const toValue = url.searchParams.get('to') ?? fromValue
    const from = dayBounds(fromValue)
    const endExclusive = new Date(dayBounds(toValue).getTime() + 86_400_000)
    if (from >= endExclusive || endExclusive.getTime() - from.getTime() > 366 * 86_400_000) {
      throw new AppError('INVALID_DATE_RANGE', 'Choose a date range of up to 366 days.', 400)
    }

    const [payments, refunds] = await Promise.all([
      prisma.payment.findMany({
        where: {
          order: { canteenId },
          OR: [
            { status: 'SUCCESS', capturedAt: { gte: from, lt: endExclusive } },
            { status: { in: ['PENDING', 'PROCESSING', 'FAILED', 'EXPIRED'] }, createdAt: { gte: from, lt: endExclusive } },
            { status: { in: ['REFUND_PENDING', 'REFUND_FAILED', 'REFUNDED'] }, updatedAt: { gte: from, lt: endExclusive } },
          ],
        },
        select: { id: true, status: true, amountPaise: true, createdAt: true, capturedAt: true, updatedAt: true, order: { select: { number: true } } },
        orderBy: { createdAt: 'asc' },
      }),
      prisma.refund.findMany({
        where: {
          payment: { order: { canteenId } },
          OR: [
            { status: 'SUCCESS', resolvedAt: { gte: from, lt: endExclusive } },
            { status: { in: ['PENDING', 'PROCESSING', 'FAILED'] }, createdAt: { gte: from, lt: endExclusive } },
          ],
        },
        select: { id: true, status: true, amountPaise: true, createdAt: true, resolvedAt: true, payment: { select: { order: { select: { number: true } } } } },
        orderBy: { createdAt: 'asc' },
      }),
    ])

    const capturedPaise = payments.filter((p) => p.status === 'SUCCESS' && p.capturedAt && p.capturedAt >= from && p.capturedAt < endExclusive)
      .reduce((sum, payment) => sum + payment.amountPaise, 0)
    const refundsPaidPaise = refunds.filter((refund) => refund.status === 'SUCCESS' && refund.resolvedAt && refund.resolvedAt >= from && refund.resolvedAt < endExclusive)
      .reduce((sum, refund) => sum + refund.amountPaise, 0)
    const outstandingRefundsPaise = refunds.filter((refund) => refund.status === 'PENDING' || refund.status === 'PROCESSING')
      .reduce((sum, refund) => sum + refund.amountPaise, 0)
    const pendingPaymentsPaise = payments.filter((payment) => ['PENDING', 'PROCESSING'].includes(payment.status))
      .reduce((sum, payment) => sum + payment.amountPaise, 0)
    const failedPaymentsPaise = payments.filter((payment) => ['FAILED', 'EXPIRED'].includes(payment.status))
      .reduce((sum, payment) => sum + payment.amountPaise, 0)

    if (url.searchParams.get('format') === 'csv') {
      const rows = [
        ['record_type', 'order', 'status', 'amount_inr', 'event_at'].map(csvCell).join(','),
        ...payments.map((payment) => [
          'payment', payment.order.number, payment.status, (payment.amountPaise / 100).toFixed(2),
          (payment.status === 'SUCCESS' ? payment.capturedAt ?? payment.updatedAt : payment.status.startsWith('REFUND') ? payment.updatedAt : payment.createdAt).toISOString(),
        ].map(csvCell).join(',')),
        ...refunds.map((refund) => [
          'refund', refund.payment.order.number, refund.status, (refund.amountPaise / 100).toFixed(2),
          (refund.resolvedAt ?? refund.createdAt).toISOString(),
        ].map(csvCell).join(',')),
      ]
      return new Response(rows.join('\n'), {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="settlement-${fromValue}-${toValue}.csv"`,
        },
      })
    }

    return ok({
      from: fromValue,
      to: toValue,
      capturedPaise,
      refundsPaidPaise,
      netSettledPaise: capturedPaise - refundsPaidPaise,
      outstandingRefundsPaise,
      pendingPaymentsPaise,
      failedPaymentsPaise,
      paymentCount: payments.length,
      refundCount: refunds.length,
    })
  } catch (e) {
    return fail(e)
  }
}
