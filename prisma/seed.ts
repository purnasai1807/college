import { PrismaClient, Role } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('The development seed contains demo accounts and cannot run in production.')
  }
  if (process.env.ALLOW_DEMO_SEED !== 'true') {
    throw new Error('Demo data is disabled. Set ALLOW_DEMO_SEED=true only for a disposable local development database.')
  }
  const devPassword = process.env.DEMO_SEED_PASSWORD
  if (!devPassword || devPassword.length < 12) {
    throw new Error('Set DEMO_SEED_PASSWORD to a unique password of at least 12 characters.')
  }
  const campus = await prisma.campus.upsert({
    where: { name_location: { name: 'Default campus', location: '' } },
    create: { name: 'Default campus' },
    update: {},
  })
  const canteen = (await prisma.canteen.findFirst()) ?? (await prisma.canteen.create({ data: { name: 'College Canteen', campusId: campus.id } }))

  if ((await prisma.counter.count()) === 0) {
    await prisma.counter.createMany({
      data: ['Main Counter', 'Snacks Counter', 'Drinks Counter'].map((name) => ({ name, canteenId: canteen.id })),
    })
  }
  const main = await prisma.counter.findFirstOrThrow({ where: { canteenId: canteen.id }, orderBy: { name: 'asc' } })

  if ((await prisma.foodItem.count()) === 0) {
    const menu: [string, string, number, string, number][] = [
      ['Burger', 'Crispy chicken burger with house sauce', 6000, 'Snacks', 8],
      ['Sandwich', 'Grilled veg sandwich', 4500, 'Snacks', 6],
      ['French Fries', 'Salted, with ketchup', 5000, 'Snacks', 6],
      ['Veg Meals', 'Rice, dal, two sabzis, roti', 8000, 'Meals', 10],
      ['Tea', 'Masala chai', 1500, 'Drinks', 3],
      ['Coffee', 'Filter coffee', 2000, 'Drinks', 3],
      ['Cool Drink', 'Chilled 300 ml bottle', 3000, 'Drinks', 1],
    ]
    await prisma.foodItem.createMany({
      data: menu.map(([name, description, pricePaise, category, prepMinutes]) => ({
        canteenId: canteen.id, name, description, pricePaise, category, prepMinutes, stock: 50,
      })),
    })
  }

  await prisma.pickupSlot.deleteMany({ where: { canteenId: canteen.id, booked: 0, startsAt: { gt: new Date() } } })
  const step = 10 * 60_000
  const first = Math.ceil(Date.now() / step) * step + step
  await prisma.pickupSlot.createMany({
    data: Array.from({ length: 18 }, (_, i) => ({
      canteenId: canteen.id,
      startsAt: new Date(first + i * step),
      endsAt: new Date(first + (i + 1) * step),
      capacity: 20,
    })),
  })

  const passwordHash = await bcrypt.hash(devPassword, 12)
  const users: [string, string, Role, string | null, string | null][] = [
    ['super@canteen.local', 'Super Admin', 'SUPER_ADMIN', null, null],
    ['admin@canteen.local', 'Canteen Admin', 'ADMIN', null, null],
    ['kitchen@canteen.local', 'Kitchen Staff', 'KITCHEN', null, null],
    ['counter@canteen.local', 'Counter Staff', 'STAFF', main.id, null],
    ['student@canteen.local', 'Test Student', 'STUDENT', null, 'S1001'],
  ]
  for (const [email, name, role, counterId, studentId] of users) {
    await prisma.user.upsert({
      where: { email },
      update: { canteenId: role === 'STUDENT' ? null : canteen.id, counterId },
      create: { email, name, role, counterId, studentId, passwordHash, canteenId: role === 'STUDENT' ? null : canteen.id },
    })
  }
  console.log('Development demo data seeded. Demo account password was not printed.')
}

main().finally(() => prisma.$disconnect())
