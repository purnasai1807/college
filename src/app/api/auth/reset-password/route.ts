import { createHash } from 'crypto'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { AppError, fail, ok } from '@/lib/http'
import { limit } from '@/lib/rate-limit'

const schema = z.object({ token: z.string().length(64), password: z.string().min(8).max(100) })

export async function POST(req: Request) {
  try {
    limit(req, 'reset', 10)
    const { token, password } = schema.parse(await req.json())
    const reset = await prisma.passwordReset.findUnique({ where: { tokenHash: createHash('sha256').update(token).digest('hex') } })
    if (!reset || reset.usedAt || reset.expiresAt < new Date()) {
      throw new AppError('INVALID_RESET', 'This reset link is invalid or has expired. Please ask for a new one.', 400)
    }
    const passwordHash = await bcrypt.hash(password, 12)
    await prisma.$transaction([
      prisma.user.update({ where: { id: reset.userId }, data: { passwordHash } }),
      prisma.passwordReset.updateMany({ where: { userId: reset.userId, usedAt: null }, data: { usedAt: new Date() } }),
    ])
    return ok({})
  } catch (e) {
    return fail(e)
  }
}
