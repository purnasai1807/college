'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { inr } from '@/lib/client/format'

type Verified = { token: string; number: string; student: string; counter: string; totalPaise: number; items: { name: string; qty: number }[] }

export default function Scan() {
  const router = useRouter()
  const video = useRef<HTMLVideoElement>(null)
  const busy = useRef(false)
  const [found, setFound] = useState<Verified | null>(null)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)
  const [camera, setCamera] = useState('')
  const [manual, setManual] = useState('')

  const call = useCallback(async (path: string, body: object) => {
    try {
      const res = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      if (res.status === 401) { router.push('/login'); return null }
      const json = await res.json()
      if (!json.success) { setMessage({ ok: false, text: json.error.message }); return null }
      return json.data
    } catch {
      setMessage({ ok: false, text: 'Unable to verify order. Please check the internet connection.' })
      return null
    }
  }, [router])

  const verify = useCallback(async (body: object) => {
    setMessage(null)
    const data = await call('/api/pickup/verify', body)
    if (data) setFound(data)
  }, [call])

  useEffect(() => {
    const Detector = (window as any).BarcodeDetector
    if (!Detector || !navigator.mediaDevices) return setCamera('Camera scanning is not supported here. Use the order number below.')
    const detector = new Detector({ formats: ['qr_code'] })
    let stream: MediaStream | undefined
    let timer: ReturnType<typeof setInterval>

    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
      .then((s) => {
        stream = s
        if (video.current) { video.current.srcObject = s; video.current.play() }
        timer = setInterval(async () => {
          if (busy.current || !video.current) return
          const codes = await detector.detect(video.current).catch(() => [])
          if (codes[0]) { busy.current = true; await verify({ token: codes[0].rawValue }) }
        }, 600)
      })
      .catch(() => setCamera('Camera permission was denied or no camera was found. Use the order number below.'))
    return () => { clearInterval(timer); stream?.getTracks().forEach((t) => t.stop()) }
  }, [verify])

  async function collect() {
    if (!found) return
    const data = await call('/api/pickup/collect', { token: found.token })
    if (data) { setMessage({ ok: true, text: `${data.orderNumber} handed over.` }); setFound(null); busy.current = false }
  }
  const reset = () => { setFound(null); setMessage(null); busy.current = false }

  return (
    <main className="mx-auto max-w-md px-5 py-8">
      <h1 className="mb-4 text-xl font-semibold">Scan pickup QR</h1>
      <div className="mb-4 aspect-square overflow-hidden rounded-3xl bg-stone-900">
        <video ref={video} muted playsInline className="h-full w-full object-cover" />
      </div>
      {camera && <p className="mb-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">{camera}</p>}

      {message && (
        <p role="alert" className={`mb-4 rounded-xl p-4 text-sm font-medium ${message.ok ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-700'}`}>
          {message.text}{' '}
          {!message.ok && <button onClick={reset} className="underline">Scan again</button>}
        </p>
      )}

      {found && (
        <section className="mb-4 rounded-2xl bg-white p-5 ring-1 ring-stone-200">
          <p className="text-sm font-semibold text-emerald-700">✓ Order verified</p>
          <p className="mt-1 text-lg font-semibold">{found.number}</p>
          <p className="text-sm text-stone-500">{found.student} · {found.counter}</p>
          <ul className="my-3 text-sm">{found.items.map((i) => <li key={i.name}>{i.name} × {i.qty}</li>)}</ul>
          <p className="mb-4 text-sm">Total {inr(found.totalPaise)} · payment verified</p>
          <div className="flex gap-2">
            <button onClick={collect} className="flex-1 rounded-xl bg-amber-500 py-3 text-sm font-semibold text-white">Mark as collected</button>
            <button onClick={reset} className="rounded-xl px-4 text-sm text-stone-500 ring-1 ring-stone-200">Cancel</button>
          </div>
        </section>
      )}

      <form onSubmit={(e) => { e.preventDefault(); if (manual) verify({ orderNumber: manual }) }} className="flex gap-2">
        <input value={manual} onChange={(e) => setManual(e.target.value)} placeholder="CAN-20261008-0001" aria-label="Order number" className="min-w-0 flex-1 rounded-xl border border-stone-300 px-4 py-3 text-sm outline-none focus:border-amber-500" />
        <button className="rounded-xl bg-stone-900 px-5 text-sm font-semibold text-white">Look up</button>
      </form>
    </main>
  )
}
