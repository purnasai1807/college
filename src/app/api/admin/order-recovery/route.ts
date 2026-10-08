import { z } from 'zod'
import { canteenForSession } from '@/lib/auth/canteen'
import { requireSession } from '@/lib/auth/session'
import { prisma } from '@/lib/db'
import { AppError, fail, ok } from '@/lib/http'
import { limit } from '@/lib/rate-limit'
import { recoverRecentOrders } from '@/lib/orders/recovery'

export const dynamic = 'force-dynamic'

const schema = z.object({
  type: z.enum(['roll', 'name']),
  value: z.string().trim().min(3).max(80),
})

export async function GET(req: Request) {
  try {
    await limit(req, 'order-recovery', 20)
    const admin = await requireSession('ADMIN', 'SUPER_ADMIN')
    const canteenId = await canteenForSession(admin, new URL(req.url).searchParams.get('canteenId'))
    const parsed = schema.safeParse(Object.fromEntries(new URL(req.url).searchParams))
    if (!parsed.success) {
      throw new AppError('INVALID_SEARCH', 'Choose a search type and enter at least 3 characters.', 400)
    }
    const result = await recoverRecentOrders(admin.userId, canteenId, parsed.data)
    const response = ok(result)
    response.headers.set('Cache-Control', 'private, no-store')
    return response
  } catch (e) {
    return fail(e)
  }
}
