'use client'
import { FormEvent, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

type Settings = { name: string; collegeName: string; opensAt: string; closesAt: string; cancelAfterAccept: boolean }

const box = 'mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm outline-none focus:border-amber-500'

export default function SettingsPage() {
  const router = useRouter()
  const [s, setS] = useState<Settings | null>(null)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)

  useEffect(() => {
    fetch('/api/admin/settings').then(async (res) => {
      if (res.status === 401 || res.status === 403) return router.push('/login')
      const json = await res.json()
      if (json.success) setS(json.data)
    })
  }, [router])

  async function save(e: FormEvent) {
    e.preventDefault()
    const res = await fetch('/api/admin/settings', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(s) })
    const json = await res.json()
    setMessage({ ok: json.success, text: json.success ? 'Settings saved.' : 'Check the values. Closing time must be after opening time.' })
  }

  if (!s) return <main className="p-8 text-sm">Loading…</main>
  const set = (k: keyof Settings) => (e: React.ChangeEvent<HTMLInputElement>) => setS({ ...s, [k]: e.target.value })

  return (
    <main className="mx-auto max-w-lg px-5 py-8">
      <a href="/admin" className="text-sm text-stone-500 hover:text-stone-800">← Admin</a>
      <h1 className="mb-5 mt-3 text-xl font-semibold">Canteen settings</h1>
      <form onSubmit={save} className="space-y-4 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-stone-100">
        <label className="block text-xs text-stone-500">College name<input className={box} value={s.collegeName} onChange={set('collegeName')} /></label>
        <label className="block text-xs text-stone-500">Canteen name<input className={box} value={s.name} onChange={set('name')} required /></label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-xs text-stone-500">Opens<input type="time" className={box} value={s.opensAt} onChange={set('opensAt')} required /></label>
          <label className="block text-xs text-stone-500">Closes<input type="time" className={box} value={s.closesAt} onChange={set('closesAt')} required /></label>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={s.cancelAfterAccept} onChange={(e) => setS({ ...s, cancelAfterAccept: e.target.checked })} />
          Let students cancel (with refund) after the kitchen has accepted the order
        </label>
        <p className="text-xs text-stone-500">Orders can never be cancelled once preparation has started.</p>
        <div className="flex items-center gap-3">
          <button className="rounded-xl bg-amber-500 px-5 py-2 text-sm font-semibold text-white">Save</button>
          {message && <p role="status" className={`text-sm ${message.ok ? 'text-emerald-700' : 'text-red-700'}`}>{message.text}</p>}
        </div>
      </form>
    </main>
  )
}
