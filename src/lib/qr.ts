import { createHmac, randomBytes, timingSafeEqual } from 'crypto'

const sign = (orderId: string, nonce: string) =>
  createHmac('sha256', process.env.AUTH_SECRET!).update(`${orderId}.${nonce}`).digest('base64url')

export const newNonce = () => randomBytes(18).toString('base64url')

export const tokenFor = (orderId: string, nonce: string) =>
  `${orderId}.${nonce}.${sign(orderId, nonce)}`

export function parseToken(token: string) {
  const [orderId, nonce, sig] = token.split('.')
  if (!orderId || !nonce || !sig) return null
  const given = Buffer.from(sig)
  const wanted = Buffer.from(sign(orderId, nonce))
  if (given.length !== wanted.length || !timingSafeEqual(given, wanted)) return null
  return { orderId, nonce }
}
