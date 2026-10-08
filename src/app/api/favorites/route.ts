import { z } from 'zod'
import { prisma } from '@/lib/db'
import { fail, ok } from '@/lib/http'
import { requireSession } from '@/lib/auth/session'

const ids = async (userId: string) => (await prisma.favorite.findMany({ where: { userId } })).map((f) => f.foodId)

export async function GET() {
  try {
    const s = await requireSession('STUDENT')
    return ok({ foodIds: await ids(s.userId) })
  } catch (e) {
    return fail(e)
  }
}

export async function POST(req: Request) {
  try {
    const s = await requireSession('STUDENT')
    const { foodId } = z.object({ foodId: z.string().min(1) }).parse(await req.json())
    const removed = await prisma.favorite.deleteMany({ where: { userId: s.userId, foodId } })
    if (removed.count === 0) await prisma.favorite.create({ data: { userId: s.userId, foodId } })
    return ok({ foodIds: await ids(s.userId) })
  } catch (e) {
    return fail(e)
  }
}
