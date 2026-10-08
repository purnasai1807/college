import { createHash } from 'crypto'
import { prisma } from '../db'
import { AppError } from '../http'

const RETENTION_HOURS = 72
const RETENTION_MS = RETENTION_HOURS * 60 * 60 * 1000

export type RecoverySearch = {
  type: 'roll' | 'name'
  value: string
}

export async function recoverRecentOrders(
  adminId: string,
  canteenId: string,
  search: RecoverySearch,
) {
  const value = search.value.trim()
  if (value.length < 3 || value.length > 80) {
    throw new AppError('INVALID_SEARCH', 'Enter at least 3 characters to search.', 400)
  }

  const since = new Date(Date.now() - RETENTION_MS)
  const studentWhere = search.type === 'roll'
    ? { studentId: { equals: value, mode: 'insensitive' as const } }
    : { name: { contains: value, mode: 'insensitive' as const } }

  return prisma.$transaction(async (tx) => {
    const orders = await tx.order.findMany({
      where: {
        canteenId,
        createdAt: { gte: since },
        user: studentWhere,
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        id: true,
        number: true,
        status: true,
        totalPaise: true,
        createdAt: true,
        collectedAt: true,
        user: { select: { name: true, studentId: true } },
        counter: { select: { name: true } },
        items: { select: { name: true, qty: true, unitPaise: true } },
        payment: { select: { status: true } },
      },
    })

    await tx.auditLog.create({
      data: {
        userId: adminId,
        action: 'ORDER_RECOVERY_SEARCH',
        resource: 'student-orders',
        resourceId: canteenId,
        metadata: {
          searchType: search.type,
          queryHash: createHash('sha256').update(value.toLocaleLowerCase('en')).digest('hex'),
          windowHours: RETENTION_HOURS,
          resultCount: orders.length,
        },
      },
    })

    return {
      retentionHours: RETENTION_HOURS,
      limited: orders.length === 50,
      orders,
    }
  })
}
