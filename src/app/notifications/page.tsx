'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

type Item = { id: string; title: string; body: string; createdAt: string; unread: boolean }

export default function Notifications() {
  const router = useRouter()
  const [items, setItems] = useState<Item[] | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch('/api/notifications')
      .then(async (res) => {
        if (res.status === 401) return router.push('/login')
        const json = await res.json()
        if (!json.success) return setError(json.error.message)
        setItems(json.data)
        fetch('/api/notifications', { method: 'PATCH' })
      })
      .catch(() => setError('Could not reach the server. Check your connection.'))
  }, [router])

  return (
    <main className="mx-auto max-w-md px-5 py-8">
      <Link href="/" className="text-sm text-stone-500 hover:text-stone-800">← Back to menu</Link>
      <h1 className="mb-4 mt-3 text-xl font-semibold">Notifications</h1>
      {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {!items && !error && <div className="h-24 animate-pulse rounded-2xl bg-stone-200" />}
      <ul className="space-y-3">
        {items?.map((n) => (
          <li key={n.id} className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-stone-100">
            <div className="flex items-center gap-2">
              {n.unread && <span className="h-2 w-2 rounded-full bg-amber-500" aria-label="Unread" />}
              <p className="font-medium">{n.title}</p>
            </div>
            <p className="mt-1 text-sm text-stone-600">{n.body}</p>
            <p className="mt-2 text-xs text-stone-400">{new Date(n.createdAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</p>
          </li>
        ))}
        {items?.length === 0 && <li className="py-10 text-center text-sm text-stone-500">Nothing yet. Updates about your orders show up here.</li>}
      </ul>
    </main>
  )
}
