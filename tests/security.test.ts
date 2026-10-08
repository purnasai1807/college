import { createHmac } from 'crypto'
import { describe, expect, it } from 'vitest'
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
})
