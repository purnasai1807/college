import { z } from 'zod'
import { prisma } from '@/lib/db'
import { fail, ok } from '@/lib/http'
import { requireSession } from '@/lib/auth/session'
import { canteenForSession } from '@/lib/auth/canteen'

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/)
const schema = z
  .object({
    name: z.string().trim().min(2).max(80),
    collegeName: z.string().trim().max(120),
    opensAt: hhmm,
    closesAt: hhmm,
    cancelAfterAccept: z.boolean(),
  })
  .refine((v) => v.opensAt < v.closesAt)

export async function GET(req: Request) {
  try {
    const admin = await requireSession('ADMIN', 'SUPER_ADMIN')
    const canteenId = await canteenForSession(admin, new URL(req.url).searchParams.get('canteenId'))
    const c = await prisma.canteen.findUniqueOrThrow({ where: { id: canteenId } })
    return ok({ name: c.name, collegeName: c.collegeName, opensAt: c.opensAt, closesAt: c.closesAt, cancelAfterAccept: c.cancelAfterAccept })
  } catch (e) {
    return fail(e)
  }
}

export async function PATCH(req: Request) {
  try {
    const admin = await requireSession('ADMIN', 'SUPER_ADMIN')
    const data = schema.parse(await req.json())
    const canteenId = await canteenForSession(admin, new URL(req.url).searchParams.get('canteenId'))
    const c = await prisma.canteen.findUniqueOrThrow({ where: { id: canteenId } })
    await prisma.canteen.update({ where: { id: c.id }, data })
    await prisma.auditLog.create({ data: { userId: admin.userId, action: 'SETTINGS_CHANGED', resource: 'canteen', resourceId: c.id, metadata: data } })
    return ok(data)
  } catch (e) {
    return fail(e)
  }
}
