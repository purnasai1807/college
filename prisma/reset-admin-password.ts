import bcrypt from 'bcryptjs'
import { prisma } from '../src/lib/db'

async function main() {
  if (process.env.CONFIRM_ADMIN_PASSWORD_RESET !== 'YES_RESET_ADMIN_PASSWORD') {
    throw new Error('Set CONFIRM_ADMIN_PASSWORD_RESET=YES_RESET_ADMIN_PASSWORD to explicitly authorize this operation.')
  }

  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase()
  const password = process.env.ADMIN_PASSWORD
  if (!email) throw new Error('ADMIN_EMAIL must identify the existing super-admin account.')
  if (!password || password.length < 12) throw new Error('ADMIN_PASSWORD must be at least 12 characters.')

  const user = await prisma.user.findUnique({ where: { email }, select: { id: true, role: true } })
  if (!user || user.role !== 'SUPER_ADMIN') {
    throw new Error('No super-admin account exists for ADMIN_EMAIL; refusing to change any account.')
  }

  const passwordHash = await bcrypt.hash(password, 12)
  await prisma.$transaction([
    prisma.user.update({ where: { id: user.id }, data: { passwordHash } }),
    prisma.passwordReset.updateMany({
      where: { userId: user.id, usedAt: null },
      data: { usedAt: new Date() },
    }),
  ])
  console.log(`Reset the super-admin password for ${email}.`)
}

main()
  .catch((error: unknown) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
