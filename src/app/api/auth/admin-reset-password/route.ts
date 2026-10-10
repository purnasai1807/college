import bcrypt from 'bcryptjs'
import { z } from 'zod'
import { hashAdminResetOtp } from '@/lib/auth/admin-reset-otp'
import { AppError, fail, ok } from '@/lib/http'
import { limit } from '@/lib/rate-limit'
import { prisma } from '@/lib/db'

const schema = z.object({
  email: z.string().trim().toLowerCase().email(),
  otp: z.string().regex(/^\d{6}$/),
  password: z.string().min(12).max(100),
})

export async function POST(req: Request) {
  try {
    await limit(req, 'admin-password-reset-verify', 5)
    const { email, otp, password } = schema.parse(await req.json())
    const tokenHash = hashAdminResetOtp(email, otp)
    const passwordHash = await bcrypt.hash(password, 12)

    await prisma.$transaction(async (tx) => {
      const reset = await tx.passwordReset.findUnique({
        where: { tokenHash },
        select: { id: true, userId: true, expiresAt: true, usedAt: true },
      })
      if (!reset || reset.usedAt || reset.expiresAt <= new Date()) {
        throw new AppError('INVALID_ADMIN_RESET_OTP', 'The verification code is invalid or expired. Request a new code.', 400)
      }

      const admin = await tx.user.findUnique({
        where: { id: reset.userId },
        select: { id: true, email: true, role: true },
      })
      if (
        !admin ||
        admin.email !== email ||
        (admin.role !== 'ADMIN' && admin.role !== 'SUPER_ADMIN')
      ) {
        throw new AppError('INVALID_ADMIN_RESET_OTP', 'The verification code is invalid or expired. Request a new code.', 400)
      }

      const claimed = await tx.passwordReset.updateMany({
        where: { id: reset.id, usedAt: null, expiresAt: { gt: new Date() } },
        data: { usedAt: new Date() },
      })
      if (claimed.count !== 1) {
        throw new AppError('INVALID_ADMIN_RESET_OTP', 'The verification code is invalid or expired. Request a new code.', 400)
      }

      await tx.user.update({ where: { id: admin.id }, data: { passwordHash } })
      await tx.passwordReset.updateMany({
        where: { userId: admin.id, usedAt: null },
        data: { usedAt: new Date() },
      })
    })

    return ok({ message: 'Password updated. Sign in with your new password.' })
  } catch (error) {
    return fail(error)
  }
}
