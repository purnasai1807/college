'use client'
import { useLive } from '@/lib/client/live'
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { inr } from '@/lib/client/format'

type Row = { lines: { foodId: string; qty: number }[]; id: string; number: string; status: string; totalPaise: number; createdAt: string; counter: string; summary: string }

const FILTERS = ['All', 'Active', 'Completed', 'Cancelled']
const ACTIVE = ['PAYMENT_PENDING', 'PAID', 'ACCEPTED', 'PREPARING', 'READY']
const CANCELLABLE = ['PAYMENT_PENDING', 'PAID', 'ACCEPTED']

export default function Orders() {
  const router = useRouter()
  const [rows, setRows] = useState<Row[] | null>(null)
  const [filter, setFilter] = useState('All')
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/orders')
      if (res.status === 401) return router.push('/login')
      const json = await res.json()
      json.success ? setRows(json.data) : setError(json.error.message)
    } catch {
      setError('Could not reach the server. Check your connection.')
    }
  }, [router])
  useEffect(() => { load() }, [load])
  useLive(load)

  async function cancel(id: string) {
    if (!confirm('Cancel this order? If you already paid, a refund will be started.')) return
    const res = await fetch(`/api/orders/${id}/cancel`, { method: 'POST' })
    if (!res.ok) setError((await res.json()).error.message)
    load()
  }

  function reorder(r: Row) {
    sessionStorage.setItem('cc_reorder', JSON.stringify(r.lines))
    router.push('/')
  }

  const shown = rows?.filter((r) =>
    filter === 'All' ? true : filter === 'Active' ? ACTIVE.includes(r.status) : filter === 'Completed' ? r.status === 'COLLECTED' : ['CANCELLED', 'REFUND_PENDING', 'REFUNDED'].includes(r.status)
  )

  return (
    <main className="mx-auto max-w-md px-5 py-8">
      <Link href="/" className="text-sm text-stone-500 hover:text-stone-800">← Back to menu</Link>
      <h1 className="mb-4 mt-3 text-xl font-semibold">My orders</h1>
      <div className="mb-4 flex gap-2">
        {FILTERS.map((f) => (
          <button key={f} onClick={() => setFilter(f)} className={`rounded-full px-3.5 py-1.5 text-sm ${filter === f ? 'bg-stone-900 text-white' : 'bg-white text-stone-600 ring-1 ring-stone-200'}`}>{f}</button>
        ))}
      </div>
      {error && <p role="alert" className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {!rows && !error && <div className="h-32 animate-pulse rounded-2xl bg-stone-200" />}
      <ul className="space-y-3">
        {shown?.map((r) => (
          <li key={r.id} className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-stone-100">
            <Link href={`/orders/${r.id}`} className="block">
              <div className="flex items-center justify-between">
                <span className="font-medium">{r.number}</span>
                <span className="rounded-full bg-stone-100 px-2.5 py-0.5 text-xs">{r.status.replace('_', ' ').toLowerCase()}</span>
              </div>
              <p className="mt-1 truncate text-sm text-stone-500">{r.summary}</p>
              <p className="mt-1 text-sm">{inr(r.totalPaise)} · {r.counter}</p>
            </Link>
            {CANCELLABLE.includes(r.status) && <button onClick={() => cancel(r.id)} className="mt-3 text-sm text-red-600 hover:underline">Cancel order</button>}
            {r.status === 'COLLECTED' && <button onClick={() => reorder(r)} className="mt-3 text-sm text-amber-700 hover:underline">Reorder</button>}
          </li>
        ))}
        {shown?.length === 0 && <li className="py-10 text-center text-sm text-stone-500">No orders here yet.</li>}
      </ul>
    </main>
  )
}
