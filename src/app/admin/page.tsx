'use client'
import { useLive } from '@/lib/client/live'
import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { inr } from '@/lib/client/format'
import SetupForms from '@/components/admin/setup-forms'
import { adminUrl } from '@/lib/client/admin-context'
import ManagementPanel from '@/components/admin/management-panel'
import ImageUploadField from '@/components/admin/image-upload-field'
import FeedbackPanel from '@/components/admin/feedback-panel'
import OrderRecoveryPanel from '@/components/admin/order-recovery-panel'

type Data = {
  canteen: { name: string; isOpen: boolean }
  stats: { orders: number; preparing: number; ready: number; collected: number; revenuePaise: number; refundsPaise: number }
  mismatches: string[]
  failedRefunds: { id: string; orderId: string; amountPaise: number }[]
  counters: { id: string; name: string }[]
  recent: { id: string; number: string; student: string; counter: string; status: string; totalPaise: number }[]
  foods: { id: string; name: string; description: string; category: string; pricePaise: number; imageUrl: string | null; prepMinutes: number; stock: number; isAvailable: boolean }[]
}
type CanteenOption = { id: string; name: string; collegeName: string; campus: { name: string } }

const patch = (url: string, body: object) =>
  fetch(url, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })

export default function Admin() {
  const router = useRouter()
  const [data, setData] = useState<Data | null>(null)
  const [error, setError] = useState('')
  const [canteens, setCanteens] = useState<CanteenOption[]>([])
  const [canteenId, setCanteenId] = useState('')
  const [isSuperAdmin, setIsSuperAdmin] = useState(false)
  const [contextReady, setContextReady] = useState(false)
  const [imageUrls, setImageUrls] = useState<Record<string, string>>({})

  const load = useCallback(async () => {
    if (!contextReady) return
    try {
      const res = await fetch(adminUrl('/api/admin/summary', canteenId))
      if (res.status === 401 || res.status === 403) return router.push('/login')
      const json = await res.json()
      json.success ? setData(json.data) : setError(json.error.message)
    } catch {
      setError('Could not reach the server.')
    }
  }, [canteenId, contextReady, router])

  useEffect(() => {
    let active = true
    Promise.all([fetch('/api/canteens').then((r) => r.json()), fetch('/api/auth/me').then((r) => r.json())])
      .then(([canteenResult, accountResult]) => {
        if (!active) return
        if (!canteenResult.success || !accountResult.success) throw new Error('Could not load your canteen access.')
        const options = canteenResult.data as CanteenOption[]
        const account = accountResult.data as { role: string; canteenId: string | null }
        const queryCanteen = new URLSearchParams(window.location.search).get('canteenId')
        const selected = queryCanteen || account.canteenId || (account.role === 'SUPER_ADMIN' ? options[0]?.id : '') || ''
        setCanteens(options)
        setIsSuperAdmin(account.role === 'SUPER_ADMIN')
        setCanteenId(selected)
        setContextReady(true)
        if (!selected && account.role === 'SUPER_ADMIN') setError('Create a canteen or choose one to manage.')
      })
      .catch((e) => {
        if (active) setError(e instanceof Error ? e.message : 'Could not load your canteen access.')
      })
    return () => { active = false }
  }, [])

  useEffect(() => { if (contextReady) void load() }, [contextReady, load])
  useLive(load)

  async function save(url: string, body: object) {
    try {
      const res = await patch(adminUrl(url, canteenId), body)
      const json = await res.json()
      if (!res.ok || !json.success) setError(json.error?.message ?? 'Could not save changes.')
      else setError('')
      await load()
    } catch {
      setError('Could not reach the server. Check your connection.')
    }
  }

  async function deleteFood(id: string, name: string) {
    if (!confirm(`Delete ${name}? Items with order history must be marked unavailable instead.`)) return
    try {
      const res = await fetch(adminUrl(`/api/admin/foods/${id}`, canteenId), { method: 'DELETE' })
      const json = await res.json()
      if (!res.ok || !json.success) {
        setError(json.error?.message ?? 'Could not delete this item.')
        return
      }
      setError('')
      await load()
    } catch {
      setError('Could not reach the server. Check your connection.')
    }
  }

  async function retryRefund(id: string) {
    const res = await fetch(adminUrl(`/api/admin/refunds/${id}/retry`, canteenId), { method: 'POST' })
    if (!res.ok) setError((await res.json()).error.message)
    load()
  }

  async function createCanteen(form: HTMLFormElement) {
    const values = new FormData(form)
    const res = await fetch('/api/canteens', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: String(values.get('name') ?? ''),
        collegeName: String(values.get('collegeName') ?? ''),
        campusName: String(values.get('campusName') ?? ''),
        location: String(values.get('location') ?? ''),
      }),
    })
    const json = await res.json()
    if (!res.ok || !json.success) {
      setError(json.error?.message ?? 'Could not create canteen.')
      return
    }
    setError('')
    setCanteenId(json.data.id)
    setCanteens((old) => [...old, { ...json.data, collegeName: '', campus: { name: String(values.get('campusName')) } }])
    router.replace(adminUrl('/admin', json.data.id))
    form.reset()
  }

  if (!data) return <main className="p-8">{error || 'Loading…'}</main>
  const s = data.stats
  const cards: [string, string | number][] = [
    ["Today's orders", s.orders], ['Preparing', s.preparing], ['Ready', s.ready], ['Collected', s.collected],
    ['Revenue', inr(s.revenuePaise)], ['Refunds', inr(s.refundsPaise)],
  ]

  return (
    <main className="mx-auto max-w-4xl px-5 py-8">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">{data.canteen.name} admin</h1>
        <div className="flex items-center gap-3">
          {isSuperAdmin && canteens.length > 1 && (
            <select aria-label="Choose a canteen to manage" value={canteenId} onChange={(e) => {
              const id = e.target.value
              setCanteenId(id)
              setData(null)
              router.replace(adminUrl('/admin', id))
            }} className="rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm">
              {canteens.map((canteen) => <option key={canteen.id} value={canteen.id}>{canteen.campus.name} · {canteen.name}</option>)}
            </select>
          )}
          <a href={adminUrl('/admin/reports', canteenId)} className="text-sm text-amber-700 hover:underline">Reports</a>
          <a href={adminUrl('/admin/settings', canteenId)} className="text-sm text-amber-700 hover:underline">Settings</a>
          <a href={adminUrl('/api/admin/reports/sales', canteenId)} className="text-sm text-amber-700 hover:underline">Download today’s sales (CSV)</a>
          <button onClick={() => save('/api/admin/canteen', { isOpen: !data.canteen.isOpen })} className={`rounded-full px-4 py-1.5 text-sm font-medium ${data.canteen.isOpen ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-700'}`}>
            {data.canteen.isOpen ? 'Open · click to close' : 'Closed · click to open'}
          </button>
        </div>
      </header>
      {error && <p role="alert" className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      {isSuperAdmin && (
        <details className="mb-6 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-stone-100">
          <summary className="cursor-pointer font-semibold">Add a canteen</summary>
          <form onSubmit={(event) => { event.preventDefault(); void createCanteen(event.currentTarget) }} className="mt-4 grid gap-3 sm:grid-cols-2">
            <input name="name" required minLength={2} maxLength={80} placeholder="Canteen name" aria-label="Canteen name" className="rounded-lg border border-stone-300 px-3 py-2 text-sm" />
            <input name="collegeName" maxLength={120} placeholder="College name" aria-label="College name" className="rounded-lg border border-stone-300 px-3 py-2 text-sm" />
            <input name="campusName" required minLength={2} maxLength={100} placeholder="Campus name" aria-label="Campus name" className="rounded-lg border border-stone-300 px-3 py-2 text-sm" />
            <input name="location" maxLength={160} placeholder="Campus location" aria-label="Campus location" className="rounded-lg border border-stone-300 px-3 py-2 text-sm" />
            <button className="rounded-xl bg-stone-900 px-4 py-2 text-sm font-semibold text-white sm:col-span-2">Create canteen</button>
          </form>
        </details>
      )}

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3">
        {cards.map(([label, value]) => (
          <div key={label} className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-stone-100">
            <p className="text-xs text-stone-500">{label}</p>
            <p className="mt-1 text-2xl font-semibold">{value}</p>
          </div>
        ))}
      </div>

      <section className="mb-6 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-stone-100">
        <h2 className="mb-2 font-semibold">Payment reconciliation</h2>
        {data.mismatches.length === 0 ? <p className="text-sm text-emerald-700">Every paid order has a matching payment.</p> : (
          <ul className="space-y-1 text-sm text-red-700">{data.mismatches.map((m) => <li key={m}>⚠ {m}</li>)}</ul>
        )}
      </section>

      {data.failedRefunds.length > 0 && (
        <section className="mb-6 rounded-2xl bg-red-50 p-5 ring-1 ring-red-100">
          <h2 className="mb-2 font-semibold text-red-800">Refunds that failed</h2>
          <ul className="space-y-2 text-sm">
            {data.failedRefunds.map((r) => (
              <li key={r.id} className="flex items-center justify-between">
                <span>{inr(r.amountPaise)} · order {r.orderId.slice(-6)}</span>
                <button onClick={() => retryRefund(r.id)} className="rounded-lg bg-red-600 px-3 py-1 text-white">Retry</button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <SetupForms counters={data.counters} canteenId={canteenId} onDone={load} />
      <ManagementPanel canteenId={canteenId} />
      <OrderRecoveryPanel canteenId={canteenId} />
      <FeedbackPanel canteenId={canteenId} />

      <section className="mb-6 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-stone-100">
        <h2 className="mb-3 font-semibold">Menu and stock</h2>
        <ul className="divide-y divide-stone-100 text-sm">
          {data.foods.map((f) => (
            <li key={f.id} className="py-3">
              <div className="flex flex-wrap items-center gap-3">
                <span className="min-w-40 flex-1 font-medium">{f.name} <span className="font-normal text-stone-400">{inr(f.pricePaise)}</span></span>
                <label className="flex items-center gap-1.5 text-stone-500">
                  Stock
                  <input type="number" min={0} defaultValue={f.stock} key={f.stock} aria-label={`${f.name} stock`}
                    onBlur={(e) => Number(e.target.value) !== f.stock && save(`/api/admin/foods/${f.id}`, { stock: Number(e.target.value) })}
                    className="w-20 rounded-lg border border-stone-300 px-2 py-1 text-stone-900" />
                </label>
                <button onClick={() => save(`/api/admin/foods/${f.id}`, { isAvailable: !f.isAvailable })} className={`w-28 rounded-full px-3 py-1 text-xs font-medium ${f.isAvailable ? 'bg-emerald-100 text-emerald-800' : 'bg-stone-200 text-stone-600'}`}>
                  {f.isAvailable ? 'Available' : 'Unavailable'}
                </button>
              </div>
              <details className="mt-2 text-xs text-stone-500">
                <summary className="cursor-pointer">Edit details</summary>
                <form onSubmit={(event) => {
                  event.preventDefault()
                  const values = new FormData(event.currentTarget)
                  const rawImage = String(values.get('imageUrl') ?? '').trim()
                  void save(`/api/admin/foods/${f.id}`, {
                    name: String(values.get('name') ?? ''),
                    description: String(values.get('description') ?? ''),
                    category: String(values.get('category') ?? ''),
                    pricePaise: Math.round(Number(values.get('price')) * 100),
                    prepMinutes: Number(values.get('prepMinutes')),
                    imageUrl: rawImage || null,
                  })
                }} className="mt-3 grid gap-3 sm:grid-cols-2">
                  <label>Name<input name="name" required minLength={2} maxLength={60} defaultValue={f.name} className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm text-stone-900" /></label>
                  <label>Category<input name="category" required minLength={2} maxLength={30} defaultValue={f.category} className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm text-stone-900" /></label>
                  <label>Description<input name="description" maxLength={200} defaultValue={f.description} className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm text-stone-900" /></label>
                  <label>Price (₹)<input name="price" type="number" min="1" max="10000" step="0.01" required defaultValue={(f.pricePaise / 100).toFixed(2)} className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm text-stone-900" /></label>
                  <label>Preparation time (minutes)<input name="prepMinutes" type="number" min="1" max="60" required defaultValue={f.prepMinutes} className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm text-stone-900" /></label>
                  <label>Image
                    <ImageUploadField
                      canteenId={canteenId}
                      value={imageUrls[f.id] ?? f.imageUrl ?? ''}
                      onChange={(imageUrl) => setImageUrls((old) => ({ ...old, [f.id]: imageUrl }))}
                    />
                  </label>
                  <div className="flex gap-3 sm:col-span-2">
                    <button className="rounded-lg bg-stone-900 px-3 py-2 text-white">Save details</button>
                    <button type="button" onClick={() => deleteFood(f.id, f.name)} className="rounded-lg border border-red-200 px-3 py-2 text-red-700">Delete item</button>
                  </div>
                </form>
              </details>
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-stone-100">
        <h2 className="mb-3 font-semibold">Recent orders</h2>
        <table className="w-full text-left text-sm">
          <thead className="text-xs text-stone-500"><tr><th className="pb-2">Order</th><th>Student</th><th>Counter</th><th>Status</th><th className="text-right">Amount</th></tr></thead>
          <tbody className="divide-y divide-stone-100">
            {data.recent.map((o) => (
              <tr key={o.id}><td className="py-2">{o.number}</td><td>{o.student}</td><td>{o.counter}</td><td>{o.status.toLowerCase().replace('_', ' ')}</td><td className="text-right">{inr(o.totalPaise)}</td></tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  )
}
