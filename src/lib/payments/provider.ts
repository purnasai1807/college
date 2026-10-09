import { createHmac, timingSafeEqual } from 'crypto'

export interface PaymentProvider {
  createPayment(input: { amountPaise: number; receipt: string }): Promise<{ providerOrderId: string; publicKey: string }>
  verifyWebhook(rawBody: string, signature: string | null): boolean
  refundPayment(providerPaymentId: string, amountPaise: number): Promise<{ providerRefundId: string; status: string }>
}

const API = 'https://api.razorpay.com/v1'

function credentials() {
  const key = process.env.PAYMENT_PROVIDER_KEY?.trim()
  const secret = process.env.PAYMENT_PROVIDER_SECRET?.trim()
  if (!key || !secret) throw new Error('Razorpay payment credentials are not configured.')
  return { key, secret }
}

async function post(path: string, body: unknown) {
  const { key, secret } = credentials()
  const basic = Buffer.from(`${key}:${secret}`).toString('base64')
  const res = await fetch(`${API}${path}`, {
    method: 'POST',
    headers: { Authorization: `Basic ${basic}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`Razorpay request failed (${res.status}).`)
  const result: unknown = await res.json()
  if (!result || typeof result !== 'object') throw new Error('Razorpay returned an invalid response.')
  return result as Record<string, unknown>
}

export const paymentProvider: PaymentProvider = {
  async createPayment({ amountPaise, receipt }) {
    if (!Number.isSafeInteger(amountPaise) || amountPaise < 1) {
      throw new Error('Razorpay order amount must be a positive integer in paise.')
    }
    const { key } = credentials()
    const order = await post('/orders', { amount: amountPaise, currency: 'INR', receipt })
    if (typeof order.id !== 'string' || !order.id) throw new Error('Razorpay returned an invalid order ID.')
    return { providerOrderId: order.id, publicKey: key }
  },

  verifyWebhook(rawBody, signature) {
    const secret = process.env.PAYMENT_WEBHOOK_SECRET?.trim()
    if (!secret || !signature || !/^[a-f\d]{64}$/i.test(signature)) return false
    const a = Buffer.from(signature, 'hex')
    const b = createHmac('sha256', secret).update(rawBody).digest()
    return a.length === b.length && timingSafeEqual(a, b)
  },

  async refundPayment(providerPaymentId, amountPaise) {
    if (!Number.isSafeInteger(amountPaise) || amountPaise < 1) {
      throw new Error('Razorpay refund amount must be a positive integer in paise.')
    }
    const r = await post(`/payments/${providerPaymentId}/refund`, { amount: amountPaise })
    if (typeof r.id !== 'string' || !r.id || typeof r.status !== 'string' || !r.status) {
      throw new Error('Razorpay returned an invalid refund response.')
    }
    return { providerRefundId: r.id, status: r.status }
  },
}
