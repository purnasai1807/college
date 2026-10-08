import { z } from 'zod'
import { prisma } from '@/lib/db'
import { AppError, fail, ok } from '@/lib/http'
import { canteenForSession } from '@/lib/auth/canteen'
import { requireSession } from '@/lib/auth/session'

export async function GET(req: Request) {
  try {
    const admin = await requireSession('ADMIN', 'SUPER_ADMIN')
    const canteenId = await canteenForSession(admin, new URL(req.url).searchParams.get('canteenId'))
    const [counters, slots, staff] = await Promise.all([
      prisma.counter.findMany({ where: { canteenId }, orderBy: { name: 'asc' } }),
      prisma.pickupSlot.findMany({
        where: { canteenId, startsAt: { gt: new Date() } },
        orderBy: { startsAt: 'asc' },
        take: 100,
      }),
      prisma.user.findMany({
        where: { canteenId, role: { in: ['STAFF', 'KITCHEN'] } },
        orderBy: { name: 'asc' },
        select: { id: true, name: true, email: true, role: true, enabled: true, counterId: true },
      }),
    ])
    return ok({ counters, slots, staff })
  } catch (e) {
    return fail(e)
  }
}

const updateSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('counter'),
    id: z.string().min(1),
    name: z.string().trim().min(2).max(40).optional(),
    isOpen: z.boolean().optional(),
  }),
  z.object({
    kind: z.literal('slot'),
    id: z.string().min(1),
    capacity: z.number().int().min(1).max(500).optional(),
    isOpen: z.boolean().optional(),
  }),
  z.object({
    kind: z.literal('staff'),
    id: z.string().min(1),
    enabled: z.boolean().optional(),
    counterId: z.string().nullable().optional(),
  }),
]).superRefine((value, context) => {
  const empty =
    (value.kind === 'counter' && value.name === undefined && value.isOpen === undefined) ||
    (value.kind === 'slot' && value.capacity === undefined && value.isOpen === undefined) ||
    (value.kind === 'staff' && value.enabled === undefined && value.counterId === undefined)
  if (empty) context.addIssue({ code: z.ZodIssueCode.custom, message: 'Provide at least one field to update.' })
})

export async function PATCH(req: Request) {
  try {
    const admin = await requireSession('ADMIN', 'SUPER_ADMIN')
    const canteenId = await canteenForSession(admin, new URL(req.url).searchParams.get('canteenId'))
    const input = updateSchema.parse(await req.json())
    await prisma.$transaction(async (tx) => {
      if (input.kind === 'counter') {
        const result = await tx.counter.updateMany({
          where: { id: input.id, canteenId },
          data: { ...(input.name !== undefined ? { name: input.name } : {}), ...(input.isOpen !== undefined ? { isOpen: input.isOpen } : {}) },
        })
        if (!result.count) throw new AppError('COUNTER_NOT_FOUND', 'Counter could not be found.', 404)
      } else if (input.kind === 'slot') {
        const slot = await tx.pickupSlot.findFirst({ where: { id: input.id, canteenId }, select: { booked: true } })
        if (!slot) throw new AppError('SLOT_NOT_FOUND', 'Pickup slot could not be found.', 404)
        if (input.capacity !== undefined && input.capacity < slot.booked) {
          throw new AppError('CAPACITY_TOO_LOW', `Capacity cannot be lower than the ${slot.booked} orders already booked.`, 409)
        }
        const result = await tx.pickupSlot.updateMany({
          where: { id: input.id, canteenId, ...(input.capacity !== undefined ? { booked: { lte: input.capacity } } : {}) },
          data: { ...(input.capacity !== undefined ? { capacity: input.capacity } : {}), ...(input.isOpen !== undefined ? { isOpen: input.isOpen } : {}) },
        })
        if (!result.count) throw new AppError('CAPACITY_CHANGED', 'The slot was booked while you were editing it. Refresh and try again.', 409)
      } else {
        if (input.counterId) {
          const counter = await tx.counter.findFirst({ where: { id: input.counterId, canteenId }, select: { id: true } })
          if (!counter) throw new AppError('COUNTER_NOT_FOUND', 'Choose a counter in this canteen.', 400)
        }
        const result = await tx.user.updateMany({
          where: { id: input.id, canteenId, role: { in: ['STAFF', 'KITCHEN'] } },
          data: {
            ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
            ...(input.counterId !== undefined ? { counterId: input.counterId } : {}),
          },
        })
        if (!result.count) throw new AppError('STAFF_NOT_FOUND', 'Staff account could not be found.', 404)
      }
      await tx.auditLog.create({
        data: {
          userId: admin.userId,
          action: `MANAGED_${input.kind.toUpperCase()}`,
          resource: input.kind,
          resourceId: input.id,
          metadata: input,
        },
      })
    })
    return ok({ id: input.id })
  } catch (e) {
    return fail(e)
  }
}

const deleteSchema = z.object({ kind: z.enum(['counter', 'slot']), id: z.string().min(1) })

export async function DELETE(req: Request) {
  try {
    const admin = await requireSession('ADMIN', 'SUPER_ADMIN')
    const canteenId = await canteenForSession(admin, new URL(req.url).searchParams.get('canteenId'))
    const { kind, id } = deleteSchema.parse(await req.json())
    await prisma.$transaction(async (tx) => {
      if (kind === 'counter') {
        const counter = await tx.counter.findFirst({ where: { id, canteenId }, select: { id: true } })
        if (!counter) throw new AppError('COUNTER_NOT_FOUND', 'Counter could not be found.', 404)
        const orders = await tx.order.count({ where: { counterId: id } })
        if (orders) throw new AppError('COUNTER_HAS_ORDERS', 'This counter has order history. Close it instead of deleting it.', 409)
        await tx.counter.delete({ where: { id } })
      } else {
        const slot = await tx.pickupSlot.findFirst({ where: { id, canteenId }, select: { booked: true } })
        if (!slot) throw new AppError('SLOT_NOT_FOUND', 'Pickup slot could not be found.', 404)
        const orders = await tx.order.count({ where: { slotId: id } })
        if (slot.booked || orders) throw new AppError('SLOT_HAS_ORDERS', 'This pickup slot has bookings or order history. Close it instead of deleting it.', 409)
        await tx.pickupSlot.delete({ where: { id } })
      }
      await tx.auditLog.create({
        data: { userId: admin.userId, action: `DELETED_${kind.toUpperCase()}`, resource: kind, resourceId: id },
      })
    })
    return ok({ id })
  } catch (e) {
    return fail(e)
  }
}
