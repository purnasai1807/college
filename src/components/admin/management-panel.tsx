'use client'
import { useCallback, useEffect, useState } from 'react'
import { adminUrl } from '@/lib/client/admin-context'

type Counter = { id: string; name: string; isOpen: boolean }
type Slot = { id: string; startsAt: string; endsAt: string; capacity: number; booked: number; isOpen: boolean }
type Staff = { id: string; name: string; email: string; role: string; enabled: boolean; counterId: string | null }
type Data = { counters: Counter[]; slots: Slot[]; staff: Staff[] }

export default function ManagementPanel({ canteenId }: { canteenId: string }) {
  const [data, setData] = useState<Data | null>(null)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    const response = await fetch(adminUrl('/api/admin/management', canteenId))
    const json = await response.json()
    if (!response.ok || !json.success) {
      setError(json.error?.message ?? 'Could not load canteen management.')
      return
    }
    setData(json.data)
    setError('')
  }, [canteenId])

  useEffect(() => { void load() }, [load])

  async function update(body: object) {
    const response = await fetch(adminUrl('/api/admin/management', canteenId), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const json = await response.json()
    if (!response.ok || !json.success) setError(json.error?.message ?? 'Could not save changes.')
    await load()
  }

  async function remove(kind: 'counter' | 'slot', id: string) {
    if (!confirm(`Delete this ${kind}? Historical bookings cannot be removed.`)) return
    const response = await fetch(adminUrl('/api/admin/management', canteenId), {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind, id }),
    })
    const json = await response.json()
    if (!response.ok || !json.success) setError(json.error?.message ?? 'Could not delete this record.')
    await load()
  }

  return (
    <section className="mb-6 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-stone-100">
      <h2 className="mb-3 font-semibold">Manage counters, pickup slots, and staff</h2>
      {error && <p role="alert" className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {!data ? <p className="text-sm text-stone-500">Loading management records…</p> : (
        <div className="space-y-5 text-sm">
          <div>
            <h3 className="mb-2 font-medium">Counters</h3>
            {data.counters.map((counter) => (
              <div key={counter.id} className="mb-2 flex flex-wrap items-center gap-2">
                <input aria-label="Counter name" defaultValue={counter.name} onBlur={(event) => {
                  if (event.target.value.trim() !== counter.name) void update({ kind: 'counter', id: counter.id, name: event.target.value })
                }} className="min-w-40 flex-1 rounded-lg border border-stone-300 px-3 py-2" />
                <button onClick={() => void update({ kind: 'counter', id: counter.id, isOpen: !counter.isOpen })} className="rounded-lg border px-3 py-2">
                  {counter.isOpen ? 'Open' : 'Closed'}
                </button>
                <button onClick={() => void remove('counter', counter.id)} className="rounded-lg border border-red-200 px-3 py-2 text-red-700">Delete</button>
              </div>
            ))}
            {data.counters.length === 0 && <p className="text-stone-500">No counters have been added.</p>}
          </div>
          <div>
            <h3 className="mb-2 font-medium">Upcoming pickup slots</h3>
            {data.slots.map((slot) => (
              <div key={slot.id} className="mb-2 flex flex-wrap items-center gap-2">
                <span className="min-w-52 flex-1">{new Date(slot.startsAt).toLocaleString()} · {slot.booked}/{slot.capacity} booked</span>
                <label className="flex items-center gap-1">Capacity
                  <input aria-label="Slot capacity" type="number" min={slot.booked} max={500} defaultValue={slot.capacity} onBlur={(event) => {
                    const capacity = Number(event.target.value)
                    if (capacity !== slot.capacity) void update({ kind: 'slot', id: slot.id, capacity })
                  }} className="w-20 rounded-lg border border-stone-300 px-2 py-2" />
                </label>
                <button onClick={() => void update({ kind: 'slot', id: slot.id, isOpen: !slot.isOpen })} className="rounded-lg border px-3 py-2">
                  {slot.isOpen ? 'Open' : 'Closed'}
                </button>
                <button onClick={() => void remove('slot', slot.id)} className="rounded-lg border border-red-200 px-3 py-2 text-red-700">Delete</button>
              </div>
            ))}
            {data.slots.length === 0 && <p className="text-stone-500">No upcoming pickup slots.</p>}
          </div>
          <div>
            <h3 className="mb-2 font-medium">Staff accounts</h3>
            {data.staff.map((staff) => (
              <div key={staff.id} className="mb-2 flex flex-wrap items-center gap-2">
                <span className="min-w-48 flex-1">{staff.name} · {staff.email} · {staff.role}</span>
                <select aria-label={`${staff.name} counter`} value={staff.counterId ?? ''} onChange={(event) => {
                  void update({ kind: 'staff', id: staff.id, counterId: event.target.value || null })
                }} className="rounded-lg border border-stone-300 px-2 py-2">
                  <option value="">All counters</option>{data.counters.map((counter) => <option key={counter.id} value={counter.id}>{counter.name}</option>)}
                </select>
                <button onClick={() => void update({ kind: 'staff', id: staff.id, enabled: !staff.enabled })} className="rounded-lg border px-3 py-2">
                  {staff.enabled ? 'Enabled · disable' : 'Disabled · enable'}
                </button>
              </div>
            ))}
            {data.staff.length === 0 && <p className="text-stone-500">No staff accounts have been added.</p>}
          </div>
        </div>
      )}
    </section>
  )
}
