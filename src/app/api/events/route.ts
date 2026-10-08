import { fail } from '@/lib/http'
import { requireSession } from '@/lib/auth/session'
import { subscribe } from '@/lib/realtime'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(req: Request) {
  try {
    await requireSession()
  } catch (e) {
    return fail(e)
  }

  const enc = new TextEncoder()
  let cleanup = () => {}
  const stream = new ReadableStream({
    start(controller) {
      const send = (text: string) => {
        try { controller.enqueue(enc.encode(text)) } catch {}
      }
      send('retry: 3000\n\n')
      const off = subscribe(() => send('data: changed\n\n'))
      const beat = setInterval(() => send(': ping\n\n'), 25_000)
      cleanup = () => { off(); clearInterval(beat) }
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
