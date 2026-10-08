import { cookies } from 'next/headers'
import { jwtVerify, SignJWT } from 'jose'
import { AppError } from '../http'

export type Role = 'STUDENT' | 'STAFF' | 'KITCHEN' | 'ADMIN' | 'SUPER_ADMIN'
export type Session = { userId: string; role: Role; counterId?: string }

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

  let session: Session
  try {
    const { payload } = await jwtVerify(token, secret())
    if (
      typeof payload.userId !== 'string' ||
      typeof payload.role !== 'string' ||
      !allRoles.includes(payload.role as Role)
    ) {
      throw new Error('Invalid session claims')
    }
    session = {
      userId: payload.userId,
      role: payload.role as Role,
      ...(typeof payload.counterId === 'string' ? { counterId: payload.counterId } : {}),
    }
  } catch {
    throw new AppError('SESSION_EXPIRED', 'Your session has expired. Please sign in again.', 401)
  }
  if (allowedRoles.length && !allowedRoles.includes(session.role)) {
    throw new AppError('FORBIDDEN', 'You are not allowed to do that.', 403)
  }
  return session
}

export async function issueSession(user: { id: string; role: Role; counterId: string | null }) {
  const token = await new SignJWT({ userId: user.id, role: user.role, counterId: user.counterId ?? undefined })
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
