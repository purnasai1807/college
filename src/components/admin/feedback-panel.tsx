'use client'
import { useCallback, useEffect, useState } from 'react'
import { adminUrl } from '@/lib/client/admin-context'
import { useLive } from '@/lib/client/live'

type Feedback = {
  id: string
  orderId: string
  rating: number
  comment: string
  status: 'NEW' | 'REVIEWED' | 'RESOLVED'
  response: string | null
  createdAt: string
  user: { name: string }
  order: { number: string }
}

export default function FeedbackPanel({ canteenId }: { canteenId: string }) {
  const [items, setItems] = useState<Feedback[]>([])
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    try {
      const response = await fetch(adminUrl('/api/admin/feedback', canteenId))
      const json = await response.json()
      if (!response.ok || !json.success) throw new Error(json.error?.message ?? 'Could not load feedback.')
      setItems(json.data)
      setError('')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load feedback.')
    }
  }, [canteenId])

  useEffect(() => { void load() }, [load])
  useLive(load)

  async function save(item: Feedback, form: HTMLFormElement) {
    const values = new FormData(form)
    const response = await fetch(adminUrl('/api/admin/feedback', canteenId), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: item.id,
        status: String(values.get('status')),
        response: String(values.get('response') ?? '').trim() || null,
      }),
    })
    const json = await response.json()
    if (!response.ok || !json.success) {
      setError(json.error?.message ?? 'Could not save feedback.')
      return
    }
    await load()
  }

  return (
    <section className="mb-6 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-stone-100">
      <h2 className="mb-3 font-semibold">Student feedback</h2>
      {error && <p role="alert" className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {items.length === 0 ? <p className="text-sm text-stone-500">No feedback yet.</p> : (
        <ul className="divide-y divide-stone-100">
          {items.map((item) => (
            <li key={item.id} className="py-4">
              <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <p className="font-medium">{'★'.repeat(item.rating)}{'☆'.repeat(5 - item.rating)} · {item.user.name}</p>
                <p className="text-stone-500">{item.order.number} · {new Date(item.createdAt).toLocaleDateString()}</p>
              </div>
              {item.comment && <p className="mt-2 whitespace-pre-wrap text-sm text-stone-700">{item.comment}</p>}
              <form onSubmit={(event) => { event.preventDefault(); void save(item, event.currentTarget) }} className="mt-3 grid gap-2 sm:grid-cols-[1fr_2fr_auto]">
                <select name="status" defaultValue={item.status} aria-label="Feedback status" className="rounded-lg border border-stone-300 px-3 py-2 text-sm">
                  <option value="NEW">New</option><option value="REVIEWED">Reviewed</option><option value="RESOLVED">Resolved</option>
                </select>
                <input name="response" defaultValue={item.response ?? ''} maxLength={1000} placeholder="Optional response to the student" aria-label="Response to student" className="rounded-lg border border-stone-300 px-3 py-2 text-sm" />
                <button className="rounded-lg bg-stone-900 px-4 py-2 text-sm font-semibold text-white">Save</button>
              </form>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
