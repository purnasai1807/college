import { AppError } from './http'

// In-memory, so it only protects a single server process. Swap for Redis if you scale out.
const hits = new Map<string, number[]>()

export function limit(req: Request, key: string, max: number, windowMs = 60_000) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? 'local'
  const id = `${key}:${ip}`
  const now = Date.now()
  const recent = (hits.get(id) ?? []).filter((t) => now - t < windowMs)
  if (recent.length >= max) {
    throw new AppError('RATE_LIMITED', 'Too many attempts. Please wait a minute and try again.', 429)
  }
  recent.push(now)
  hits.set(id, recent)
}
