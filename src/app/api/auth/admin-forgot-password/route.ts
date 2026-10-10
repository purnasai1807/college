import { createAdminResetOtp, hashAdminResetOtp } from '@/lib/auth/admin-reset-otp'
import { AppError, fail, ok } from '@/lib/http'
import { limit } from '@/lib/rate-limit'
import { sendMail } from '@/lib/mail'
import { prisma } from '@/lib/db'
import { z } from 'zod'

const schema = z.object({ email: z.string().trim().toLowerCase().email() })
const otpLifetimeMs = 10 * 60_000

export async function POST(req: Request) {
  try {
    await limit(req, 'admin-password-reset-request', 3)
    if (!process.env.RESEND_API_KEY || !process.env.MAIL_FROM) {
      throw new AppError(
        'ADMIN_RESET_EMAIL_NOT_CONFIGURED',
        'Admin email verification is not configured yet. Contact the canteen system administrator.',
        503,
      )
    }

    const { email } = schema.parse(await req.json())
    const admin = await prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true, role: true },
    })

    if (admin && (admin.role === 'ADMIN' || admin.role === 'SUPER_ADMIN')) {
      const otp = createAdminResetOtp()
      await prisma.$transaction(async (tx) => {
        await tx.passwordReset.updateMany({
          where: { userId: admin.id, usedAt: null },
          data: { usedAt: new Date() },
        })
        await tx.passwordReset.create({
          data: {
            userId: admin.id,
            tokenHash: hashAdminResetOtp(admin.email, otp),
            expiresAt: new Date(Date.now() + otpLifetimeMs),
          },
        })
      })

      try {
        await sendMail(
          admin.email,
          'Your ACE Canteen admin verification code',
          `Your admin password reset code is ${otp}.\n\nIt expires in 10 minutes and can only be used once. If you did not request this code, ignore this email.`,
        )
      } catch (error) {
        console.error('admin password reset email delivery failed', error)
        throw new AppError(
          'ADMIN_RESET_EMAIL_FAILED',
          'Could not send the verification code. Check the email delivery configuration and try again.',
          503,
        )
      }
    }

    return ok({ message: 'If an admin account exists for that email, a verification code has been sent.' })
  } catch (error) {
    return fail(error)
  }
}
