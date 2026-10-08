'use client'
import { FormEvent, useState } from 'react'
import { adminUrl } from '@/lib/client/admin-context'
import ImageUploadField from './image-upload-field'

type Field = [key: string, label: string, type?: string]

const FORMS: Record<string, { title: string; fields: Field[] }> = {
  food: { title: 'Food item', fields: [['name', 'Name'], ['description', 'Description'], ['category', 'Category'], ['price', 'Price (₹)', 'number'], ['stock', 'Stock', 'number'], ['prepMinutes', 'Prep minutes', 'number'], ['imageUrl', 'Image URL', 'url']] },
  counter: { title: 'Counter', fields: [['name', 'Counter name']] },
  slots: { title: 'Pickup slots', fields: [['date', 'Date', 'date'], ['from', 'From', 'time'], ['to', 'To', 'time'], ['minutes', 'Slot length (min)', 'number'], ['capacity', 'Orders per slot', 'number']] },
  staff: { title: 'Staff account', fields: [['name', 'Name'], ['email', 'Email', 'email'], ['role', 'Role'], ['counterId', 'Counter (counter staff only)'], ['password', 'Temporary password', 'password']] },
}

const input = 'w-full rounded-lg border border-stone-300 px-3 py-2 text-sm outline-none focus:border-amber-500'

export default function SetupForms({ counters, canteenId, onDone }: { counters: { id: string; name: string }[]; canteenId: string; onDone: () => void }) {
  const [kind, setKind] = useState('food')
  const [values, setValues] = useState<Record<string, string>>({})
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    const body: Record<string, unknown> = { kind }
    for (const [key, , type] of FORMS[kind].fields) {
      const v = values[key]
      if (v === undefined || v === '') continue
      if (key === 'price') body.pricePaise = Math.round(Number(v) * 100)
      else body[key] = type === 'number' ? Number(v) : v
    }
    const res = await fetch(adminUrl('/api/admin/setup', canteenId), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const json = await res.json()
    if (json.success) { setValues({}); onDone() }
    setMessage({ ok: json.success, text: json.success ? 'Saved.' : json.error.message })
  }

  return (
    <section className="mb-6 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-stone-100">
      <h2 className="mb-3 font-semibold">Add to the canteen</h2>
      <div className="mb-4 flex flex-wrap gap-2">
        {Object.entries(FORMS).map(([k, f]) => (
          <button key={k} type="button" onClick={() => { setKind(k); setValues({}); setMessage(null) }} className={`rounded-full px-3.5 py-1.5 text-sm ${kind === k ? 'bg-stone-900 text-white' : 'bg-stone-100 text-stone-600'}`}>{f.title}</button>
        ))}
      </div>
      <form onSubmit={submit} className="grid gap-3 md:grid-cols-2">
        {FORMS[kind].fields.map(([key, label, type]) => (
          <label key={key} className="text-xs text-stone-500">
            {label}
            {key === 'role' ? (
              <select className={input} value={values.role ?? ''} onChange={(e) => setValues({ ...values, role: e.target.value })} required>
                <option value="">Choose…</option><option>STAFF</option><option>KITCHEN</option><option>ADMIN</option>
              </select>
            ) : key === 'counterId' ? (
              <select className={input} value={values.counterId ?? ''} onChange={(e) => setValues({ ...values, counterId: e.target.value })}>
                <option value="">None</option>{counters.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            ) : key === 'imageUrl' ? (
              <ImageUploadField
                canteenId={canteenId}
                value={values.imageUrl ?? ''}
                onChange={(imageUrl) => setValues({ ...values, imageUrl })}
              />
            ) : (
              <input className={input} type={type ?? 'text'} value={values[key] ?? ''} onChange={(e) => setValues({ ...values, [key]: e.target.value })} required={key !== 'description'} />
            )}
          </label>
        ))}
        <div className="flex items-center gap-3 md:col-span-2">
          <button className="rounded-xl bg-amber-500 px-5 py-2 text-sm font-semibold text-white">Add</button>
          {message && <p role="status" className={`text-sm ${message.ok ? 'text-emerald-700' : 'text-red-700'}`}>{message.text}</p>}
        </div>
      </form>
    </section>
  )
}
