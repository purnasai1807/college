import { ok } from '@/lib/http'
import { clearSession } from '@/lib/auth/session'

export async function POST() {
  await clearSession()
  return ok({})
}
