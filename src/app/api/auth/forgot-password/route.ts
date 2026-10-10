import { createHash, randomBytes } from 'crypto'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { AppError, fail, ok } from '@/lib/http'
import { limit } from '@/lib/rate-limit'
import { sendMail } from '@/lib/mail'

export async function POST(req: Request) {
  try {
    await limit(req, 'forgot', 5)
    if (process.env.NODE_ENV === 'production' && !process.env.RESEND_API_KEY) {
      throw new AppError('EMAIL_NOT_CONFIGURED', 'Password reset is temporarily unavailable.', 503)
    }
    const { email } = z.object({ email: z.string().trim().toLowerCase().email() }).parse(await req.json())
    const user = await prisma.user.findUnique({ where: { email } })
    if (user && user.role !== 'ADMIN' && user.role !== 'SUPER_ADMIN') {
      const token = randomBytes(32).toString('hex')
      await prisma.passwordReset.create({
        data: { userId: user.id, tokenHash: createHash('sha256').update(token).digest('hex'), expiresAt: new Date(Date.now() + 30 * 60_000) },
      })
      const link = `${process.env.NEXT_PUBLIC_APP_URL}/reset-password?token=${token}`
      await sendMail(user.email, 'Reset your canteen password', `Use this link within 30 minutes to choose a new password:\n\n${link}\n\nIf you did not ask for this, you can ignore this email.`)
        .catch((error: unknown) => console.error('password reset email failed', error))
    }
    // same answer whether or not the account exists
    return ok({})
  } catch (e) {
    return fail(e)
  }
}
