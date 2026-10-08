import { fail } from '@/lib/http'
import { requireSession } from '@/lib/auth/session'
import { prisma } from '@/lib/db'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(req: Request) {
  try {
    await requireSession()
  } catch (e) {
    return fail(e)
  }

  const latest = await prisma.realtimeEvent.findFirst({ orderBy: { id: 'desc' }, select: { id: true } })
  const enc = new TextEncoder()
  let cleanup = () => {}
  const stream = new ReadableStream({
    start(controller) {
      let cursor = latest?.id ?? 0
      let polling = false
      let closed = false
      const send = (text: string) => {
        try { controller.enqueue(enc.encode(text)) } catch {}
      }
      send('retry: 3000\n\n')
      const poll = async () => {
        if (polling || closed) return
        polling = true
        try {
          const event = await prisma.realtimeEvent.findFirst({
            where: { id: { gt: cursor } },
            orderBy: { id: 'desc' },
            select: { id: true },
          })
          if (event) {
            cursor = event.id
            send('data: changed\n\n')
          }
        } catch (error) {
          console.error('Realtime event polling failed:', error)
        } finally {
          polling = false
        }
      }
      const pollTimer = setInterval(() => void poll(), 2_000)
      const beat = setInterval(() => send(': ping\n\n'), 25_000)
      cleanup = () => { closed = true; clearInterval(pollTimer); clearInterval(beat) }
      req.signal.addEventListener('abort', () => {
        cleanup()
        try { controller.close() } catch {}
      })
    },
    cancel() { cleanup() },
  })

  return new Response(stream, {
    headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive' },
  })
}
