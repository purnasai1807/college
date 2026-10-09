import { createHmac } from 'crypto'
import { afterEach, describe, expect, it } from 'vitest'
import { newNonce, parseToken, tokenFor } from '../src/lib/qr'
import { paymentProvider } from '../src/lib/payments/provider'

process.env.AUTH_SECRET = 'test-secret'
process.env.PAYMENT_WEBHOOK_SECRET = 'whsec_test'

describe('pickup tokens', () => {
  it('round-trips a valid token', () => {
    const nonce = newNonce()
    expect(parseToken(tokenFor('order1', nonce))).toEqual({ orderId: 'order1', nonce })
  })

  it('rejects a token moved to another order', () => {
    const [, nonce, sig] = tokenFor('order1', newNonce()).split('.')
    expect(parseToken(`order2.${nonce}.${sig}`)).toBeNull()
  })

  it('rejects garbage', () => {
    expect(parseToken('nonsense')).toBeNull()
    expect(parseToken('a.b.c')).toBeNull()
  })
})

describe('webhook signature', () => {
  const body = JSON.stringify({ event: 'payment.captured' })
  const sig = createHmac('sha256', 'whsec_test').update(body).digest('hex')

  it('accepts the right signature', () => expect(paymentProvider.verifyWebhook(body, sig)).toBe(true))
  it('rejects a changed body', () => expect(paymentProvider.verifyWebhook(body + ' ', sig)).toBe(false))
  it('rejects a missing signature', () => expect(paymentProvider.verifyWebhook(body, null)).toBe(false))
  it('rejects a signature when no webhook secret is configured', () => {
    const configured = process.env.PAYMENT_WEBHOOK_SECRET
    try {
      delete process.env.PAYMENT_WEBHOOK_SECRET
      expect(paymentProvider.verifyWebhook(body, sig)).toBe(false)
    } finally {
      if (configured) process.env.PAYMENT_WEBHOOK_SECRET = configured
      else delete process.env.PAYMENT_WEBHOOK_SECRET
    }
  })

  describe('Razorpay order creation', () => {
    const configured = {
      key: process.env.PAYMENT_PROVIDER_KEY,
      secret: process.env.PAYMENT_PROVIDER_SECRET,
    }

    afterEach(() => {
      if (configured.key) process.env.PAYMENT_PROVIDER_KEY = configured.key
      else delete process.env.PAYMENT_PROVIDER_KEY
      if (configured.secret) process.env.PAYMENT_PROVIDER_SECRET = configured.secret
      else delete process.env.PAYMENT_PROVIDER_SECRET
    })

    it('sends a server-priced INR order and returns the configured checkout key', async () => {
      process.env.PAYMENT_PROVIDER_KEY = 'rzp_test_public'
      process.env.PAYMENT_PROVIDER_SECRET = 'test-secret'
      const fetchBefore = globalThis.fetch
      let request: RequestInit | undefined
      try {
        globalThis.fetch = async (_input, init) => {
          request = init
          return new Response(JSON.stringify({ id: 'order_test_1' }), { status: 200 })
        }
        await expect(paymentProvider.createPayment({ amountPaise: 2500, receipt: 'CAN-20261009-0001' }))
          .resolves.toEqual({ providerOrderId: 'order_test_1', publicKey: 'rzp_test_public' })
        expect(JSON.parse(String(request?.body))).toEqual({
          amount: 2500,
          currency: 'INR',
          receipt: 'CAN-20261009-0001',
        })
      } finally {
        globalThis.fetch = fetchBefore
      }
    })

    it('rejects malformed successful provider responses instead of issuing an unusable checkout', async () => {
      process.env.PAYMENT_PROVIDER_KEY = 'rzp_test_public'
      process.env.PAYMENT_PROVIDER_SECRET = 'test-secret'
      const fetchBefore = globalThis.fetch
      try {
        globalThis.fetch = async () => new Response(JSON.stringify({}), { status: 200 })
        await expect(paymentProvider.createPayment({ amountPaise: 2500, receipt: 'CAN-20261009-0001' }))
          .rejects.toThrow('Razorpay returned an invalid order ID.')
      } finally {
        globalThis.fetch = fetchBefore
      }
    })
  })

  it('refuses to create a Razorpay order without credentials', async () => {
    const key = process.env.PAYMENT_PROVIDER_KEY
    const secret = process.env.PAYMENT_PROVIDER_SECRET
    try {
      delete process.env.PAYMENT_PROVIDER_KEY
      delete process.env.PAYMENT_PROVIDER_SECRET
      await expect(paymentProvider.createPayment({ amountPaise: 100, receipt: 'test' }))
        .rejects.toThrow('Razorpay payment credentials are not configured.')
    } finally {
      if (key) process.env.PAYMENT_PROVIDER_KEY = key
      else delete process.env.PAYMENT_PROVIDER_KEY
      if (secret) process.env.PAYMENT_PROVIDER_SECRET = secret
      else delete process.env.PAYMENT_PROVIDER_SECRET
    }
  })
})
