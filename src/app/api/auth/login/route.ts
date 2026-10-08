import { limit } from '@/lib/rate-limit'
import { z } from 'zod'
import { fail, ok } from '@/lib/http'
import { issueSession } from '@/lib/auth/session'
import { authenticate } from '@/lib/auth/credentials'

const schema = z.object({ email: z.string().trim().toLowerCase().email(), password: z.string().min(1).max(100) })

export async function POST(req: Request) {
  try {
    await limit(req, 'login', 10)
    const { email, password } = schema.parse(await req.json())
    const user = await authenticate(email, password)
    await issueSession(user)
    return ok({ id: user.id, name: user.name, role: user.role })
  } catch (e) {
    return fail(e)
  }
}
