import { prisma } from './db'

let lastSweepAt = 0

export async function publish() {
  const now = Date.now()
  await prisma.realtimeEvent.create({ data: {} })
  if (now - lastSweepAt > 3_600_000) {
    await prisma.realtimeEvent.deleteMany({ where: { createdAt: { lt: new Date(now - 86_400_000) } } })
    lastSweepAt = now
  }
}
