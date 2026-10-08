import { publish } from '@/lib/realtime'
import { NextResponse } from 'next/server'
import { paymentProvider } from '@/lib/payments/provider'
import { confirmPayment, failPayment } from '@/lib/orders/service'
import { completeRefund } from '@/lib/orders/refund'
import { Prisma } from '@prisma/client'

const reply = (status: number, code?: string) =>
  NextResponse.json(
    code ? { success: false, error: { code, message: 'Webhook rejected.' } } : { success: true, data: {} },
    { status }
  )

export async function POST(req: Request) {
  const raw = await req.text()
  if (!paymentProvider.verifyWebhook(raw, req.headers.get('x-razorpay-signature'))) {
    return reply(400, 'BAD_SIGNATURE')
  }
  const eventId = req.headers.get('x-razorpay-event-id')
  if (!eventId) return reply(400, 'MISSING_EVENT_ID')

  try {
    const event = JSON.parse(raw)
    const p = event.payload?.payment?.entity
    if (event.event === 'payment.captured' && p) {
      await confirmPayment({
        eventId,
        type: event.event,
        providerOrderId: p.order_id,
        providerPaymentId: p.id,
        amountPaise: p.amount,
        currency: p.currency,
        raw: event,
      })
    }
    if (event.event === 'payment.failed' && p) {
      await failPayment({
        eventId,
        type: event.event,
        providerOrderId: p.order_id,
        raw: event,
      })
    }
    const refund = event.payload?.refund?.entity
    if ((event.event === 'refund.processed' || event.event === 'refund.failed') && refund) {
      await completeRefund({
        eventId,
        eventType: event.event,
        providerRefundId: refund.id,
        raw: event,
        succeeded: event.event === 'refund.processed',
      })
    }
    publish()
    return reply(200)
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      return reply(200)
    }
    console.error('webhook failed', e)
    return reply(500, 'WEBHOOK_FAILED')
  }
}
