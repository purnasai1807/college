import { prisma } from '@/lib/db'
import { fail, ok } from '@/lib/http'
import { requireSession } from '@/lib/auth/session'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const canteens = await prisma.canteen.findMany({
      orderBy: [{ campus: { name: 'asc' } }, { name: 'asc' }],
      select: { id: true, name: true, collegeName: true, campus: { select: { name: true } } },
    })
    return ok(canteens)
  } catch (e) {
    return fail(e)
  }
}

const schema = z.object({
  name: z.string().trim().min(2).max(80),
  collegeName: z.string().trim().max(120).default(''),
  campusName: z.string().trim().min(2).max(100),
  location: z.string().trim().max(160).default(''),
})

export async function POST(req: Request) {
  try {
    const admin = await requireSession('SUPER_ADMIN')
    const input = schema.parse(await req.json())
    const canteen = await prisma.$transaction(async (tx) => {
      const campus = await tx.campus.upsert({
        where: { name_location: { name: input.campusName, location: input.location } },
        create: { name: input.campusName, location: input.location },
        update: {},
      })
      const created = await tx.canteen.create({
        data: { name: input.name, collegeName: input.collegeName, campusId: campus.id },
      })
      await tx.counter.create({ data: { name: 'Main Counter', canteenId: created.id } })
      await tx.auditLog.create({
        data: { userId: admin.userId, action: 'CANTEEN_CREATED', resource: 'canteen', resourceId: created.id },
      })
      return created
    })
    return ok({ id: canteen.id, name: canteen.name }, 201)
  } catch (e) {
    return fail(e)
  }
}
