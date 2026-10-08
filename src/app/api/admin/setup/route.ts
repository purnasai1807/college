import bcrypt from 'bcryptjs'
import { Prisma } from '@prisma/client'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { AppError, fail, ok } from '@/lib/http'
import { requireSession } from '@/lib/auth/session'
import { canteenForSession } from '@/lib/auth/canteen'

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/)

const schema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('food'),
    name: z.string().trim().min(2).max(60),
    description: z.string().trim().max(200).default(''),
    category: z.string().trim().min(2).max(30),
    pricePaise: z.number().int().min(100).max(1_000_000),
    stock: z.number().int().min(0).max(100_000),
    prepMinutes: z.number().int().min(1).max(60).default(5),
    imageUrl: z.string().url().max(2048).optional(),
  }),
  z.object({ kind: z.literal('counter'), name: z.string().trim().min(2).max(40) }),
  z.object({
    kind: z.literal('slots'),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    from: hhmm,
    to: hhmm,
    minutes: z.number().int().min(5).max(60),
    capacity: z.number().int().min(1).max(500),
  }),
  z.object({
    kind: z.literal('staff'),
    name: z.string().trim().min(2).max(80),
    email: z.string().trim().toLowerCase().email(),
    role: z.enum(['STAFF', 'KITCHEN', 'ADMIN']),
    counterId: z.string().optional(),
    password: z.string().min(10).max(100),
  }),
])

export async function POST(req: Request) {
  try {
    const admin = await requireSession('ADMIN', 'SUPER_ADMIN')
    const input = schema.parse(await req.json())
    const canteenId = await canteenForSession(admin, new URL(req.url).searchParams.get('canteenId'))
    let created = 1

    if (input.kind === 'food') {
      const { kind, ...data } = input
      await prisma.foodItem.create({ data: { ...data, canteenId } })
    } else if (input.kind === 'counter') {
      await prisma.counter.create({ data: { name: input.name, canteenId } })
    } else if (input.kind === 'slots') {
      const start = new Date(`${input.date}T${input.from}:00+05:30`).getTime()
      const end = new Date(`${input.date}T${input.to}:00+05:30`).getTime()
      const step = input.minutes * 60_000
      const count = Math.floor((end - start) / step)
      if (count < 1 || count > 100) throw new AppError('INVALID_RANGE', 'Choose a time range that fits between 1 and 100 slots.', 400)
      await prisma.pickupSlot.createMany({
        data: Array.from({ length: count }, (_, i) => ({
          canteenId,
          startsAt: new Date(start + i * step),
          endsAt: new Date(start + (i + 1) * step),
          capacity: input.capacity,
        })),
      })
      created = count
    } else {
      if (input.role === 'ADMIN' && admin.role !== 'SUPER_ADMIN') {
        throw new AppError('FORBIDDEN', 'Only a super admin can create admins.', 403)
      }
      if (input.role === 'STAFF' && input.counterId) {
        const counter = await prisma.counter.findFirst({ where: { id: input.counterId, canteenId }, select: { id: true } })
        if (!counter) throw new AppError('COUNTER_NOT_FOUND', 'Choose a counter in your canteen.', 400)
      }
      await prisma.user
        .create({
          data: {
            name: input.name,
            email: input.email,
            role: input.role,
            counterId: input.role === 'STAFF' ? input.counterId : null,
            canteenId,
            passwordHash: await bcrypt.hash(input.password, 12),
          },
        })
        .catch((e) => {
          if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
            throw new AppError('ACCOUNT_EXISTS', 'An account with that email already exists.', 409)
          }
          throw e
        })
    }

    await prisma.auditLog.create({ data: { userId: admin.userId, action: `CREATED_${input.kind.toUpperCase()}`, resource: input.kind, resourceId: canteenId } })
    return ok({ created }, 201)
  } catch (e) {
    return fail(e)
  }
}
