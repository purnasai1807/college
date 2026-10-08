import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

// Runs on every start. Safe to repeat; it only fills in what is missing.
async function main() {
  await prisma.$executeRawUnsafe(`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'stock_not_negative') THEN
        ALTER TABLE "FoodItem" ADD CONSTRAINT stock_not_negative CHECK (stock >= 0 AND reserved >= 0);
      END IF;
    END $$;`)

  if (!(await prisma.canteen.findFirst())) {
    const canteen = await prisma.canteen.create({
      data: { name: process.env.CANTEEN_NAME || 'College Canteen', collegeName: process.env.COLLEGE_NAME || '' },
    })
    await prisma.counter.create({ data: { name: 'Main Counter', canteenId: canteen.id } })
  }

  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase()
  const password = process.env.ADMIN_PASSWORD
  if (email && password && !(await prisma.user.findFirst({ where: { role: 'SUPER_ADMIN' } }))) {
    if (password.length < 12) throw new Error('ADMIN_PASSWORD must be at least 12 characters.')
    await prisma.user.create({ data: { email, name: 'Super Admin', role: 'SUPER_ADMIN', passwordHash: await bcrypt.hash(password, 12) } })
    console.log(`Created the super admin account for ${email}`)
  }
}

main().finally(() => prisma.$disconnect())
