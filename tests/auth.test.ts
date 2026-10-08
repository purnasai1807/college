import bcrypt from 'bcryptjs'
import { afterAll, afterEach, describe, expect, it } from 'vitest'

const url = process.env.TEST_DATABASE_URL
const userIds: string[] = []
let db: typeof import('../src/lib/db').prisma | undefined

describe.skipIf(!url)('student login credentials', () => {
  async function setup(enabled = true) {
    process.env.DATABASE_URL = url
    const { prisma } = await import('../src/lib/db')
    db = prisma
    const user = await prisma.user.create({
      data: {
        email: `login-${Date.now()}-${Math.random()}@test.local`,
        name: 'Test Student',
        studentId: `S${Date.now()}${Math.floor(Math.random() * 1000)}`,
        passwordHash: await bcrypt.hash('correct-horse-battery', 4),
        enabled,
      },
    })
    userIds.push(user.id)
    return user
  }

  afterEach(async () => {
    if (!db || userIds.length === 0) return
    await db.user.deleteMany({ where: { id: { in: userIds.splice(0) } } })
  })

  afterAll(async () => {
    if (db) await db.$disconnect()
  })

  it('authenticates an enabled student with the correct password', async () => {
    const { authenticate } = await import('../src/lib/auth/credentials')
    const user = await setup()

    await expect(authenticate(user.email, 'correct-horse-battery')).resolves.toMatchObject({
      id: user.id,
      role: 'STUDENT',
    })
  })

  it('rejects incorrect passwords and disabled accounts with the same response', async () => {
    const { authenticate } = await import('../src/lib/auth/credentials')
    const user = await setup()
    const disabledUser = await setup(false)

    await expect(authenticate(user.email, 'incorrect-password')).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' })
    await expect(authenticate(disabledUser.email, 'correct-horse-battery')).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' })
    await expect(authenticate('missing@test.local', 'incorrect-password')).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' })
  })
})
