import { prisma } from '@/lib/db'
import { Prisma } from '@prisma/client'
import { z } from 'zod'
import { AppError, fail, ok } from '@/lib/http'
import { requireSession } from '@/lib/auth/session'

const profileSchema = z
  .object({
    name: z.string().trim().min(2).max(80).optional(),
    studentId: z.string().trim().min(3).max(30).nullable().optional(),
  })
  .refine((profile) => profile.name !== undefined || profile.studentId !== undefined)

export async function GET() {
  try {
    const s = await requireSession()
    const user = await prisma.user.findUnique({ where: { id: s.userId } })
    if (!user) throw new AppError('UNAUTHENTICATED', 'Please sign in to continue.', 401)
    return ok({ id: user.id, name: user.name, email: user.email, studentId: user.studentId, role: user.role })
  } catch (e) {
    return fail(e)
  }
}

export async function PATCH(req: Request) {
  try {
    const session = await requireSession()
    const data = profileSchema.parse(await req.json())
    const user = await prisma.user.update({
      where: { id: session.userId },
      data,
      select: { id: true, name: true, email: true, studentId: true, role: true },
    }).catch((error: unknown) => {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new AppError('STUDENT_ID_EXISTS', 'That student ID is already in use.', 409)
      }
      throw error
    })
    return ok(user)
  } catch (e) {
    return fail(e)
  }
}
