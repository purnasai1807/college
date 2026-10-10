import { createHmac, randomInt, timingSafeEqual } from 'crypto'

const OTP_PATTERN = /^\d{6}$/

function authSecret() {
  const secret = process.env.AUTH_SECRET
  if (!secret || Buffer.byteLength(secret) < 32) {
    throw new Error('AUTH_SECRET must contain at least 32 bytes.')
  }
  return secret
}

export function createAdminResetOtp() {
  return randomInt(0, 1_000_000).toString().padStart(6, '0')
}

export function hashAdminResetOtp(email: string, otp: string) {
  if (!OTP_PATTERN.test(otp)) throw new Error('Invalid admin reset OTP format.')
  return createHmac('sha256', authSecret())
    .update(`${email.trim().toLowerCase()}:${otp}`)
    .digest('hex')
}

export function verifyAdminResetOtpHash(expectedHash: string, email: string, otp: string) {
  if (!OTP_PATTERN.test(otp) || !/^[a-f0-9]{64}$/i.test(expectedHash)) return false
  const actual = Buffer.from(hashAdminResetOtp(email, otp), 'hex')
  const expected = Buffer.from(expectedHash, 'hex')
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}
