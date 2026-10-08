import { cookies } from 'next/headers'
import { jwtVerify, SignJWT } from 'jose'
import { prisma } from '../db'
import { AppError } from '../http'

export type Role = 'STUDENT' | 'STAFF' | 'KITCHEN' | 'ADMIN' | 'SUPER_ADMIN'
export type Session = { userId: string; role: Role; counterId?: string; canteenId?: string }

const secret = () => {
  const value = process.env.AUTH_SECRET
  if (!value || new TextEncoder().encode(value).byteLength < 32) {
    throw new Error('AUTH_SECRET must contain at least 32 bytes.')
  }
  return new TextEncoder().encode(value)
}
const allRoles: Role[] = ['STUDENT', 'STAFF', 'KITCHEN', 'ADMIN', 'SUPER_ADMIN']

export async function requireSession(...allowedRoles: Role[]): Promise<Session> {
  const token = (await cookies()).get('cc_session')?.value
  if (!token) throw new AppError('UNAUTHENTICATED', 'Please sign in to continue.', 401)

  let userId: string
  try {
    const { payload } = await jwtVerify(token, secret())
    if (
      typeof payload.userId !== 'string' ||
      typeof payload.role !== 'string' ||
      !allRoles.includes(payload.role as Role)
    ) {
      throw new Error('Invalid session claims')
    }
    userId = payload.userId
  } catch {
    throw new AppError('SESSION_EXPIRED', 'Your session has expired. Please sign in again.', 401)
  }
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true, counterId: true, canteenId: true, enabled: true },
  })
  if (!user || !user.enabled) throw new AppError('SESSION_EXPIRED', 'Your session has expired. Please sign in again.', 401)
  const session: Session = {
    userId: user.id,
    role: user.role,
    ...(user.counterId ? { counterId: user.counterId } : {}),
    ...(user.canteenId ? { canteenId: user.canteenId } : {}),
  }
  if (allowedRoles.length && !allowedRoles.includes(session.role)) {
    throw new AppError('FORBIDDEN', 'You are not allowed to do that.', 403)
  }
  return session
}

export async function issueSession(user: { id: string; role: Role; counterId: string | null; canteenId?: string | null }) {
  const token = await new SignJWT({ userId: user.id, role: user.role })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('7d')
    .sign(secret())
  const cookieStore = await cookies()
  cookieStore.set('cc_session', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 7,
  })
}

export async function clearSession() {
  const cookieStore = await cookies()
  cookieStore.delete('cc_session')
}
