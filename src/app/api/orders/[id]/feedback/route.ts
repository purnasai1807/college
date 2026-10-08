import { Prisma } from '@prisma/client'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { AppError, fail, ok } from '@/lib/http'
import { requireSession } from '@/lib/auth/session'

const schema = z.object({
  rating: z.number().int().min(1).max(5),
  comment: z.string().trim().max(1000).default(''),
})

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const student = await requireSession('STUDENT')
    const { id } = await params
    const input = schema.parse(await req.json())
    const order = await prisma.order.findFirst({
      where: { id, userId: student.userId },
      select: { id: true, canteenId: true, status: true },
    })
    if (!order) throw new AppError('ORDER_NOT_FOUND', 'Order could not be found.', 404)
    if (order.status !== 'COLLECTED') {
      throw new AppError('ORDER_NOT_COLLECTED', 'You can leave feedback after your order has been collected.', 409)
    }
    const feedback = await prisma.feedback.create({
      data: { ...input, userId: student.userId, canteenId: order.canteenId, orderId: order.id },
      select: { rating: true, comment: true, status: true, response: true },
    }).catch((error: unknown) => {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new AppError('FEEDBACK_EXISTS', 'Feedback has already been submitted for this order.', 409)
      }
      throw error
    })
    return ok(feedback, 201)
  } catch (e) {
    return fail(e)
  }
}
