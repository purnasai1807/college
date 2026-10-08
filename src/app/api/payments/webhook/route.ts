import { publish } from '@/lib/realtime'
import { NextResponse } from 'next/server'
import { paymentProvider } from '@/lib/payments/provider'
import { confirmPayment, failPayment } from '@/lib/orders/service'
import { completeRefund } from '@/lib/orders/refund'

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
    if (event.event === 'refund.processed' && event.payload?.refund?.entity) {
      await completeRefund(event.payload.refund.entity.id)
    }
    publish()
    return reply(200)
  } catch (e) {
    console.error('webhook failed', e)
    return reply(500, 'WEBHOOK_FAILED')
  }
}
