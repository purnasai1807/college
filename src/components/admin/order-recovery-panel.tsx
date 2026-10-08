'use client'
import { FormEvent, useState } from 'react'
import { adminUrl } from '@/lib/client/admin-context'
import { inr } from '@/lib/client/format'

type RecoveredOrder = {
  id: string
  number: string
  status: string
  totalPaise: number
  createdAt: string
  collectedAt: string | null
  user: { name: string; studentId: string | null }
  counter: { name: string }
  items: { name: string; qty: number; unitPaise: number }[]
  payment: { status: string } | null
}

type Result = { retentionHours: number; limited: boolean; orders: RecoveredOrder[] }

export default function OrderRecoveryPanel({ canteenId }: { canteenId: string }) {
  const [type, setType] = useState<'roll' | 'name'>('roll')
  const [value, setValue] = useState('')
  const [result, setResult] = useState<Result | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function search(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError('')
    setResult(null)
    try {
      const params = new URLSearchParams({ type, value: value.trim() })
      const response = await fetch(adminUrl(`/api/admin/order-recovery?${params}`, canteenId))
      const json = await response.json()
      if (!response.ok || !json.success) throw new Error(json.error?.message ?? 'Could not search recent orders.')
      setResult(json.data)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not search recent orders.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="mb-6 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-stone-100">
      <h2 className="font-semibold">Recover a recent student order</h2>
      <p className="mt-1 text-sm text-stone-500">
        Find this canteen&apos;s orders from the past 72 hours using the student&apos;s roll number or name.
        Searches are rate-limited and recorded in the audit log.
      </p>
      <form onSubmit={search} className="mt-4 grid gap-3 sm:grid-cols-[1fr_2fr_auto]">
        <select value={type} onChange={(event) => setType(event.target.value as 'roll' | 'name')} aria-label="Search by" className="rounded-lg border border-stone-300 px-3 py-2 text-sm">
          <option value="roll">Student roll number</option>
          <option value="name">Student name</option>
        </select>
        <input
          value={value}
          onChange={(event) => setValue(event.target.value)}
          minLength={3}
          maxLength={80}
          required
          autoComplete="off"
          placeholder={type === 'roll' ? 'Enter the exact roll number' : 'Enter at least 3 characters'}
          aria-label={type === 'roll' ? 'Student roll number' : 'Student name'}
          className="rounded-lg border border-stone-300 px-3 py-2 text-sm"
        />
        <button disabled={busy} className="rounded-lg bg-stone-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
          {busy ? 'Searching…' : 'Search'}
        </button>
      </form>
      {error && <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {result && (
        <div className="mt-4">
          <p className="mb-3 text-sm text-stone-600">
            {result.orders.length} order{result.orders.length === 1 ? '' : 's'} found within {result.retentionHours} hours.
            {result.limited && ' Showing the latest 50; refine your search.'}
          </p>
          {result.orders.length === 0 ? <p className="text-sm text-stone-500">No recent orders matched. Older orders remain in the order history but aren&apos;t shown in this recovery search.</p> : (
            <ul className="divide-y divide-stone-100">
              {result.orders.map((order) => (
                <li key={order.id} className="py-4">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="font-medium">{order.number} · {order.status.toLowerCase().replaceAll('_', ' ')}</p>
                    <p className="text-sm text-stone-500">{new Date(order.createdAt).toLocaleString()}</p>
                  </div>
                  <p className="mt-1 text-sm text-stone-600">
                    {order.user.name}{order.user.studentId ? ` · Roll ${order.user.studentId}` : ''} · {order.counter.name}
                  </p>
                  <p className="mt-1 text-sm text-stone-700">
                    {order.items.map((item) => `${item.name} × ${item.qty}`).join(' · ')}
                  </p>
                  <p className="mt-1 text-sm text-stone-500">
                    Total {inr(order.totalPaise)} · Payment {order.payment?.status.toLowerCase().replaceAll('_', ' ') ?? 'not started'}
                    {order.collectedAt ? ` · Collected ${new Date(order.collectedAt).toLocaleString()}` : ''}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  )
}
