import { prisma } from '../db'
import { AppError } from '../http'
import type { Session } from './session'

export async function canteenForSession(session: Session, requestedId?: string | null) {
  let canteenId = session.canteenId

  if (session.role === 'SUPER_ADMIN' && requestedId) {
    canteenId = requestedId
  } else if (requestedId && requestedId !== session.canteenId) {
    throw new AppError('FORBIDDEN', 'You are not assigned to that canteen.', 403)
  }

  if (!canteenId && (session.role === 'ADMIN' || session.role === 'SUPER_ADMIN')) {
    const canteens = await prisma.canteen.findMany({ select: { id: true }, take: 2 })
    if (canteens.length === 1) canteenId = canteens[0].id
  }

  if (!canteenId) {
    throw new AppError('CANTEEN_REQUIRED', 'Your account is not assigned to a canteen.', 409)
  }
  const canteen = await prisma.canteen.findUnique({ where: { id: canteenId }, select: { id: true } })
  if (!canteen) throw new AppError('CANTEEN_NOT_FOUND', 'The assigned canteen no longer exists.', 404)
  return canteen.id
}
