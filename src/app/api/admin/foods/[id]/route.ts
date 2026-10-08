import { z } from 'zod'
import { prisma } from '@/lib/db'
import { AppError, fail, ok } from '@/lib/http'
import { requireSession } from '@/lib/auth/session'

const schema = z.object({
  name: z.string().trim().min(2).max(60).optional(),
  description: z.string().trim().max(200).optional(),
  category: z.string().trim().min(2).max(30).optional(),
  isAvailable: z.boolean().optional(),
  stock: z.number().int().min(0).max(100000).optional(),
  pricePaise: z.number().int().min(100).max(1000000).optional(),
  prepMinutes: z.number().int().min(1).max(60).optional(),
  imageUrl: z.string().url().max(2048).nullable().optional(),
})

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireSession('ADMIN', 'SUPER_ADMIN')
    const data = schema.parse(await req.json())
    const { id } = await params
    const food = await prisma.foodItem.update({ where: { id }, data })
    await prisma.auditLog.create({
      data: { userId: admin.userId, action: 'FOOD_UPDATED', resource: 'food', resourceId: food.id, metadata: data },
    })
    return ok({ id: food.id })
  } catch (e) {
    return fail(e)
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireSession('ADMIN', 'SUPER_ADMIN')
    const { id } = await params
    await prisma.$transaction(async (tx) => {
      const food = await tx.foodItem.findUnique({ where: { id }, select: { id: true } })
      if (!food) throw new AppError('FOOD_NOT_FOUND', 'Food item could not be found.', 404)
      const used = await tx.orderItem.findFirst({ where: { foodId: id }, select: { id: true } })
      if (used) throw new AppError('FOOD_HAS_ORDERS', 'This item has order history. Mark it unavailable instead of deleting it.', 409)
      await tx.favorite.deleteMany({ where: { foodId: id } })
      await tx.foodItem.delete({ where: { id } })
      await tx.auditLog.create({
        data: { userId: admin.userId, action: 'FOOD_DELETED', resource: 'food', resourceId: id },
      })
    })
    return ok({ id })
  } catch (e) {
    return fail(e)
  }
}
