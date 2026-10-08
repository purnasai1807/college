import { limit } from '@/lib/rate-limit'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { AppError, fail, ok } from '@/lib/http'
import { issueSession } from '@/lib/auth/session'

const schema = z.object({ email: z.string().trim().toLowerCase().email(), password: z.string().min(1).max(100) })

export async function POST(req: Request) {
  try {
    limit(req, 'login', 10)
    const { email, password } = schema.parse(await req.json())
    const user = await prisma.user.findUnique({ where: { email } })
    const good = user ? await bcrypt.compare(password, user.passwordHash) : false
    if (!user || !good) throw new AppError('INVALID_CREDENTIALS', 'Email or password is incorrect.', 401)
    await issueSession(user)
    return ok({ id: user.id, name: user.name, role: user.role })
  } catch (e) {
    return fail(e)
  }
}
