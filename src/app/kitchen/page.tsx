'use client'
import { useLive } from '@/lib/client/live'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { clock } from '@/lib/client/format'

type Order = { id: string; number: string; status: string; counter: string; slotStart: string; slotEnd: string; items: { name: string; qty: number }[] }

const NEXT: Record<string, [string, string]> = {
  PAID: ['ACCEPTED', 'Accept'],
  ACCEPTED: ['PREPARING', 'Start preparing'],
  PREPARING: ['READY', 'Mark ready'],
}
const COLUMNS = [
  { title: 'New', states: ['PAID', 'ACCEPTED'] },
  { title: 'Preparing', states: ['PREPARING'] },
  { title: 'Ready', states: ['READY'] },
]

export default function Kitchen() {
  const router = useRouter()
  const [orders, setOrders] = useState<Order[]>([])
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/staff/orders')
      if (res.status === 401 || res.status === 403) return router.push('/login')
      const json = await res.json()
      if (json.success) { setOrders(json.data); setError('') } else setError(json.error.message)
    } catch {
      setError('Offline - the board may be out of date.')
    }
  }, [router])

  useEffect(() => { load() }, [load])
  useLive(load)

  async function advance(id: string, status: string) {
    const res = await fetch(`/api/admin/orders/${id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    if (!res.ok) setError((await res.json()).error.message)
    load()
  }

  const toMake = useMemo(() => {
    const totals = new Map<string, number>()
    orders.filter((o) => o.status !== 'READY').forEach((o) => o.items.forEach((i) => totals.set(i.name, (totals.get(i.name) ?? 0) + i.qty)))
    return [...totals.entries()]
  }, [orders])

  return (
    <main className="min-h-screen bg-stone-900 p-5 text-stone-100">
      <header className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Kitchen</h1>
        <button onClick={() => document.documentElement.requestFullscreen?.()} className="rounded-lg bg-stone-700 px-3 py-1.5 text-sm">Fullscreen</button>
      </header>
      {error && <p role="alert" className="mb-4 rounded-lg bg-red-900/60 px-3 py-2 text-sm">{error}</p>}
      {toMake.length > 0 && (
        <p className="mb-5 rounded-xl bg-stone-800 px-4 py-3 text-sm text-stone-300">
          To make: {toMake.map(([n, q]) => `${n} × ${q}`).join(' · ')}
        </p>
      )}
      <div className="grid gap-4 md:grid-cols-3">
        {COLUMNS.map((col) => {
          const list = orders.filter((o) => col.states.includes(o.status))
          return (
            <section key={col.title}>
              <h2 className="mb-3 text-sm uppercase tracking-wide text-stone-400">{col.title} ({list.length})</h2>
              <div className="space-y-3">
                {list.map((o) => (
                  <article key={o.id} className="rounded-2xl bg-stone-800 p-4">
                    <div className="flex items-baseline justify-between">
                      <p className="font-semibold">{o.number.slice(-9)}</p>
                      <p className="text-xs text-stone-400">{clock(o.slotStart)} – {clock(o.slotEnd)}</p>
                    </div>
                    <p className="text-xs text-stone-400">{o.counter}</p>
                    <ul className="my-3 text-sm">{o.items.map((i) => <li key={i.name}>{i.name} × {i.qty}</li>)}</ul>
                    {NEXT[o.status] && (
                      <button onClick={() => advance(o.id, NEXT[o.status][0])} className="w-full rounded-xl bg-amber-500 py-2 text-sm font-semibold text-stone-900">
                        {NEXT[o.status][1]}
                      </button>
                    )}
                  </article>
                ))}
                {list.length === 0 && <p className="text-sm text-stone-500">Nothing here.</p>}
              </div>
            </section>
          )
        })}
      </div>
    </main>
  )
}
