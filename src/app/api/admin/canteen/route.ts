import { z } from 'zod'
import { prisma } from '@/lib/db'
import { fail, ok } from '@/lib/http'
import { requireSession } from '@/lib/auth/session'

export async function PATCH(req: Request) {
  try {
    const admin = await requireSession('ADMIN', 'SUPER_ADMIN')
    const { isOpen } = z.object({ isOpen: z.boolean() }).parse(await req.json())
    const canteen = await prisma.canteen.findFirstOrThrow()
    await prisma.canteen.update({ where: { id: canteen.id }, data: { isOpen } })
    await prisma.auditLog.create({
      data: { userId: admin.userId, action: isOpen ? 'CANTEEN_OPENED' : 'CANTEEN_CLOSED', resource: 'canteen', resourceId: canteen.id },
    })
    return ok({ isOpen })
  } catch (e) {
    return fail(e)
  }
}
