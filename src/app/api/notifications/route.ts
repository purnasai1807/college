import { prisma } from '@/lib/db'
import { fail, ok } from '@/lib/http'
import { requireSession } from '@/lib/auth/session'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const s = await requireSession()
    const items = await prisma.notification.findMany({ where: { userId: s.userId }, orderBy: { createdAt: 'desc' }, take: 30 })
    return ok(items.map((n) => ({ id: n.id, title: n.title, body: n.body, createdAt: n.createdAt, unread: !n.readAt })))
  } catch (e) {
    return fail(e)
  }
}

export async function PATCH() {
  try {
    const s = await requireSession()
    await prisma.notification.updateMany({ where: { userId: s.userId, readAt: null }, data: { readAt: new Date() } })
    return ok({})
  } catch (e) {
    return fail(e)
  }
}
