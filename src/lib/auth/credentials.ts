import bcrypt from 'bcryptjs'
import { prisma } from '../db'
import { AppError } from '../http'

export async function authenticate(email: string, password: string) {
  const user = await prisma.user.findUnique({ where: { email } })
  const valid = user ? await bcrypt.compare(password, user.passwordHash) : false
  if (!user || !valid || !user.enabled) {
    throw new AppError('INVALID_CREDENTIALS', 'Email or password is incorrect.', 401)
  }
  return user
}
