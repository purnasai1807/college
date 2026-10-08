import { limit } from '@/lib/rate-limit'
import bcrypt from 'bcryptjs'
import { Prisma } from '@prisma/client'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { AppError, fail, ok } from '@/lib/http'
import { issueSession } from '@/lib/auth/session'

const schema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().toLowerCase().email(),
  studentId: z.string().trim().min(3).max(30),
  password: z.string().min(8).max(100),
})

export async function POST(req: Request) {
  try {
    await limit(req, 'register', 5)
    const input = schema.parse(await req.json())
    const user = await prisma.user
      .create({
        data: {
          name: input.name,
          email: input.email,
          studentId: input.studentId,
          passwordHash: await bcrypt.hash(input.password, 12),
        },
      })
      .catch((e) => {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
          throw new AppError('ACCOUNT_EXISTS', 'An account with that email or student ID already exists.', 409)
        }
        throw e
      })
    await issueSession(user)
    return ok({ id: user.id, name: user.name, role: user.role }, 201)
  } catch (e) {
    return fail(e)
  }
}
