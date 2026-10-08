import { createHmac, timingSafeEqual } from 'crypto'

export interface PaymentProvider {
  createPayment(input: { amountPaise: number; receipt: string }): Promise<{ providerOrderId: string; publicKey: string }>
  verifyWebhook(rawBody: string, signature: string | null): boolean
  refundPayment(providerPaymentId: string, amountPaise: number): Promise<{ providerRefundId: string; status: string }>
}

const API = 'https://api.razorpay.com/v1'

async function post(path: string, body: unknown) {
  const basic = Buffer.from(
    `${process.env.PAYMENT_PROVIDER_KEY}:${process.env.PAYMENT_PROVIDER_SECRET}`
  ).toString('base64')
  const res = await fetch(`${API}${path}`, {
    method: 'POST',
    headers: { Authorization: `Basic ${basic}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`Payment provider ${path} failed: ${res.status} ${await res.text()}`)
  return res.json()
}

export const paymentProvider: PaymentProvider = {
  async createPayment({ amountPaise, receipt }) {
    const order = await post('/orders', { amount: amountPaise, currency: 'INR', receipt })
    return { providerOrderId: order.id, publicKey: process.env.PAYMENT_PROVIDER_KEY! }
  },

  verifyWebhook(rawBody, signature) {
    if (!signature) return false
    const expected = createHmac('sha256', process.env.PAYMENT_WEBHOOK_SECRET!).update(rawBody).digest('hex')
    const a = Buffer.from(signature)
    const b = Buffer.from(expected)
    return a.length === b.length && timingSafeEqual(a, b)
  },

  async refundPayment(providerPaymentId, amountPaise) {
    const r = await post(`/payments/${providerPaymentId}/refund`, { amount: amountPaise })
    return { providerRefundId: r.id, status: r.status }
  },
}
