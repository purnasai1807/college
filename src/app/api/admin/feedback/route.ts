import { z } from 'zod'
import { prisma } from '@/lib/db'
import { AppError, fail, ok } from '@/lib/http'
import { canteenForSession } from '@/lib/auth/canteen'
import { requireSession } from '@/lib/auth/session'
import { publish } from '@/lib/realtime'

export async function GET(req: Request) {
  try {
    const admin = await requireSession('ADMIN', 'SUPER_ADMIN')
    const canteenId = await canteenForSession(admin, new URL(req.url).searchParams.get('canteenId'))
    const feedback = await prisma.feedback.findMany({
      where: { canteenId },
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      take: 100,
      select: {
        id: true,
        orderId: true,
        rating: true,
        comment: true,
        status: true,
        response: true,
        createdAt: true,
        user: { select: { name: true } },
        order: { select: { number: true } },
      },
    })
    return ok(feedback)
  } catch (e) {
    return fail(e)
  }
}

const schema = z.object({
  id: z.string().min(1),
  status: z.enum(['NEW', 'REVIEWED', 'RESOLVED']),
  response: z.string().trim().max(1000).nullable(),
})

export async function PATCH(req: Request) {
  try {
    const admin = await requireSession('ADMIN', 'SUPER_ADMIN')
    const canteenId = await canteenForSession(admin, new URL(req.url).searchParams.get('canteenId'))
    const input = schema.parse(await req.json())
    const feedback = await prisma.feedback.findFirst({
      where: { id: input.id, canteenId },
      select: { id: true, userId: true, response: true },
    })
    if (!feedback) throw new AppError('FEEDBACK_NOT_FOUND', 'Feedback could not be found.', 404)
    await prisma.$transaction(async (tx) => {
      await tx.feedback.update({
        where: { id: input.id },
        data: { status: input.status, response: input.response?.trim() || null },
      })
      await tx.auditLog.create({
        data: {
          userId: admin.userId,
          action: 'FEEDBACK_REVIEWED',
          resource: 'feedback',
          resourceId: input.id,
          metadata: { status: input.status },
        },
      })
      const response = input.response?.trim() || null
      if (response && response !== feedback.response) {
        await tx.notification.create({
          data: {
            userId: feedback.userId,
            title: 'The canteen replied to your feedback',
            body: response,
          },
        })
      }
    })
    await publish()
    return ok({ id: input.id, status: input.status })
  } catch (e) {
    return fail(e)
  }
}
