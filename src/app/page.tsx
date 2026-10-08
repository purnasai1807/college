'use client'
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { clock, inr } from '@/lib/client/format'
import { openCheckout } from '@/lib/client/razorpay'

type Food = { id: string; name: string; description: string; category: string; pricePaise: number; imageUrl: string | null; prepMinutes: number; soldOut: boolean }
type Slot = { id: string; startsAt: string; endsAt: string; left: number }
type CanteenOption = { id: string; name: string; collegeName: string; campus: { name: string } }
type Menu = {
  canteen: { id: string; name: string; collegeName: string; isOpen: boolean }
  counters: { id: string; name: string }[]
  slots: Slot[]
  foods: Food[]
}

const greeting = () => {
  const h = new Date().getHours()
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'
}

export default function Home() {
  const router = useRouter()
  const [menu, setMenu] = useState<Menu | null>(null)
  const [canteens, setCanteens] = useState<CanteenOption[]>([])
  const [selectedCanteenId, setSelectedCanteenId] = useState('')
  const [error, setError] = useState('')
  const [cart, setCart] = useState<Record<string, number>>({})
  const [cartReady, setCartReady] = useState(false)
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('All')
  const [open, setOpen] = useState(false)
  const [counterId, setCounterId] = useState('')
  const [slotId, setSlotId] = useState('')
  const [paying, setPaying] = useState(false)
  const [favs, setFavs] = useState<string[]>([])

  async function loadMenu(canteenId: string) {
    const response = await fetch(`/api/menu?canteenId=${encodeURIComponent(canteenId)}`)
    const json = await response.json()
    if (!json.success) throw new Error(json.error.message)
    setMenu(json.data)
  }

  useEffect(() => {
    fetch('/api/canteens')
      .then((r) => r.json())
      .then(async (json) => {
        if (!json.success) throw new Error(json.error.message)
        setCanteens(json.data)
        if (!json.data.length) throw new Error('No canteens are available yet.')
        setSelectedCanteenId(json.data[0].id)
        await loadMenu(json.data[0].id)
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Could not load the menu. Check your connection.'))
  }, [])

  async function changeCanteen(canteenId: string) {
    setSelectedCanteenId(canteenId)
    setMenu(null)
    setCart({})
    setCartReady(false)
    setCounterId('')
    setSlotId('')
    setError('')
    try {
      await loadMenu(canteenId)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load the menu.')
    }
  }

  const categories = useMemo(() => ['All', 'Favorites', ...new Set(menu?.foods.map((f) => f.category) ?? [])], [menu])
  const shown = menu?.foods.filter(
    (f) => (category === 'All' || (category === 'Favorites' ? favs.includes(f.id) : f.category === category)) && f.name.toLowerCase().includes(query.toLowerCase())
  )
  const lines = (menu?.foods ?? []).filter((f) => cart[f.id]).map((f) => ({ ...f, qty: cart[f.id] }))
  const count = lines.reduce((n, l) => n + l.qty, 0)
  const total = lines.reduce((n, l) => n + l.qty * l.pricePaise, 0)

  const change = (id: string, d: number) =>
    setCart((c) => {
      const qty = Math.max(0, Math.min(10, (c[id] ?? 0) + d))
      const next = { ...c, [id]: qty }
      if (!qty) delete next[id]
      return next
    })

  useEffect(() => {
    fetch('/api/favorites')
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => j?.success && setFavs(j.data.foodIds))
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (!menu) return
    const reorder = sessionStorage.getItem('cc_reorder')
    const key = `cc_cart:${menu.canteen.id}`
    const stored = reorder ?? sessionStorage.getItem(key)
    if (reorder) sessionStorage.removeItem('cc_reorder')
    let next: Record<string, number> = {}
    let incompleteReorder = false
    if (stored) {
      try {
        const wanted: { foodId: string; qty: number }[] = reorder
          ? JSON.parse(stored)
          : Object.entries(JSON.parse(stored) as Record<string, number>).map(([foodId, qty]) => ({ foodId, qty }))
        for (const item of wanted) {
          const food = menu.foods.find((candidate) => candidate.id === item.foodId)
          if (food && !food.soldOut && Number.isInteger(item.qty) && item.qty > 0 && item.qty <= 10) {
            next[food.id] = item.qty
          }
        }
        incompleteReorder = Boolean(reorder && Object.keys(next).length < wanted.length)
      } catch {
        sessionStorage.removeItem(key)
        incompleteReorder = Boolean(reorder)
      }
    }
    setCart(next)
    if (incompleteReorder) {
      setError('Some items from that order are no longer available, so they were left out.')
    }
    setCartReady(true)
    if (reorder && Object.keys(next).length) setOpen(true)
  }, [menu])

  useEffect(() => {
    if (!menu || !cartReady) return
    const key = `cc_cart:${menu.canteen.id}`
    if (Object.keys(cart).length) sessionStorage.setItem(key, JSON.stringify(cart))
    else sessionStorage.removeItem(key)
  }, [cart, cartReady, menu])

  async function toggleFav(id: string) {
    const res = await fetch('/api/favorites', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ foodId: id }) })
    if (res.status === 401) return router.push('/login')
    const json = await res.json()
    if (json.success) setFavs(json.data.foodIds)
  }

  async function pay() {
    if (!menu) return
    setPaying(true)
    setError('')
    try {
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          canteenId: menu.canteen.id,
          counterId,
          slotId,
          items: lines.map((l) => ({ foodId: l.id, qty: l.qty })),
        }),
      })
      if (res.status === 401) return router.push('/login')
      const json = await res.json()
      if (!json.success) throw new Error(json.error.message)
      const d = json.data
      setCart({})
      setOpen(false)
      try {
        await openCheckout({
          key: d.publicKey,
          orderId: d.providerOrderId,
          amountPaise: d.amountPaise,
          onClose: () => router.push(`/orders/${d.orderId}`),
        })
      } catch {
        router.push(`/orders/${d.orderId}`)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong. Please try again.')
    } finally {
      setPaying(false)
    }
  }

  if (!menu) {
    return (
      <main className="mx-auto max-w-2xl px-5 py-10">
        {error ? <p role="alert" className="rounded-xl bg-red-50 p-4 text-sm text-red-700">{error}</p> : (
          <div className="space-y-3">{[0, 1, 2, 3].map((i) => <div key={i} className="h-24 animate-pulse rounded-2xl bg-stone-200" />)}</div>
        )}
      </main>
    )
  }

  const closed = !menu.canteen.isOpen
  const ready = count > 0 && counterId && slotId && !closed

  return (
    <main className="mx-auto max-w-2xl px-5 pb-32 pt-8">
      <header className="mb-6">
        <p className="text-sm text-stone-500">{greeting()} 👋{menu.canteen.collegeName && ` · ${menu.canteen.collegeName}`}</p>
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">{menu.canteen.name}</h1>
          <span className={`rounded-full px-3 py-1 text-xs font-medium ${closed ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'}`}>
            {closed ? 'Closed' : 'Open'}
          </span>
        </div>
        {canteens.length > 1 && (
          <label className="mt-3 block text-sm text-stone-600">
            Canteen
            <select
              value={selectedCanteenId}
              onChange={(e) => void changeCanteen(e.target.value)}
              className="ml-2 rounded-lg border border-stone-300 bg-white px-3 py-2"
              aria-label="Choose a canteen"
            >
              {canteens.map((canteen) => (
                <option key={canteen.id} value={canteen.id}>
                  {canteen.campus.name} · {canteen.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <a href="/orders" className="mt-2 inline-block text-sm text-amber-700 hover:underline">My orders</a>
        <a href="/notifications" className="ml-4 mt-2 inline-block text-sm text-amber-700 hover:underline">Notifications</a>
        <a href="/profile" className="ml-4 mt-2 inline-block text-sm text-amber-700 hover:underline">Profile</a>
        <a href="/login" className="ml-4 mt-2 inline-block text-sm text-amber-700 hover:underline">Sign in</a>
      </header>

      {closed && <p className="mb-4 rounded-xl bg-red-50 p-4 text-sm text-red-700">Ordering is temporarily unavailable. Please try again later.</p>}

      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search the menu"
        aria-label="Search the menu"
        className="mb-4 w-full rounded-xl border border-stone-300 bg-white px-4 py-3 text-sm outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-200"
      />
      <div className="mb-5 flex gap-2 overflow-x-auto pb-1">
        {categories.map((c) => (
          <button key={c} onClick={() => setCategory(c)} className={`shrink-0 rounded-full px-4 py-1.5 text-sm transition ${category === c ? 'bg-stone-900 text-white' : 'bg-white text-stone-600 ring-1 ring-stone-200 hover:ring-stone-300'}`}>
            {c}
          </button>
        ))}
      </div>

      <ul className="space-y-3">
        {shown?.map((f) => (
          <li key={f.id} className="flex items-center gap-4 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-stone-100">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-amber-100 text-2xl font-semibold text-amber-700">
              {f.imageUrl ? <img src={f.imageUrl} alt={f.name} loading="lazy" className="h-full w-full object-cover" /> : f.name[0]}
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-medium">{f.name}</p>
              <p className="truncate text-xs text-stone-500">{f.description}</p>
              <p className="mt-1 text-sm font-semibold">{inr(f.pricePaise)}</p>
            </div>
            <button onClick={() => toggleFav(f.id)} aria-label={favs.includes(f.id) ? `Remove ${f.name} from favorites` : `Add ${f.name} to favorites`} className="text-lg text-amber-600">{favs.includes(f.id) ? '♥' : '♡'}</button>
            {f.soldOut ? (
              <span className="rounded-full bg-red-50 px-3 py-1 text-xs font-medium text-red-600">Sold out</span>
            ) : cart[f.id] ? (
              <div className="flex items-center gap-2 rounded-full bg-amber-500 px-2 py-1 text-white">
                <button aria-label={`Remove one ${f.name}`} onClick={() => change(f.id, -1)} className="h-7 w-7 text-lg leading-none">−</button>
                <span className="w-4 text-center text-sm font-semibold">{cart[f.id]}</span>
                <button aria-label={`Add one ${f.name}`} onClick={() => change(f.id, 1)} className="h-7 w-7 text-lg leading-none">+</button>
              </div>
            ) : (
              <button disabled={closed} onClick={() => change(f.id, 1)} className="rounded-full border border-amber-500 px-4 py-1.5 text-sm font-medium text-amber-600 transition hover:bg-amber-50 disabled:opacity-40">Add</button>
            )}
          </li>
        ))}
        {shown?.length === 0 && <li className="py-10 text-center text-sm text-stone-500">Nothing matches that search.</li>}
      </ul>

      {count > 0 && !open && (
        <button onClick={() => setOpen(true)} className="fixed inset-x-5 bottom-5 mx-auto flex max-w-2xl items-center justify-between rounded-2xl bg-stone-900 px-5 py-4 text-white shadow-lg">
          <span className="text-sm">{count} {count === 1 ? 'item' : 'items'}</span>
          <span className="text-sm font-semibold">View cart · {inr(total)}</span>
        </button>
      )}

      {open && (
        <div className="fixed inset-0 z-10 flex items-end bg-black/40" onClick={() => setOpen(false)}>
          <div onClick={(e) => e.stopPropagation()} className="mx-auto max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-t-3xl bg-white p-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold">Your order</h2>
              <button onClick={() => setOpen(false)} className="text-sm text-stone-500">Close</button>
            </div>

            <ul className="mb-4 divide-y divide-stone-100">
              {lines.map((l) => (
                <li key={l.id} className="flex items-center justify-between py-3 text-sm">
                  <span>{l.name} × {l.qty}</span>
                  <span className="font-medium">{inr(l.qty * l.pricePaise)}</span>
                </li>
              ))}
            </ul>

            <label className="mb-1 block text-xs font-medium text-stone-500">Pickup counter</label>
            <div className="mb-4 flex flex-wrap gap-2">
              {menu.counters.map((c) => (
                <button key={c.id} onClick={() => setCounterId(c.id)} className={`rounded-xl px-4 py-2 text-sm ring-1 ${counterId === c.id ? 'bg-amber-50 ring-amber-500 text-amber-800' : 'ring-stone-200 text-stone-600'}`}>{c.name}</button>
              ))}
            </div>

            <label className="mb-1 block text-xs font-medium text-stone-500">Pickup time</label>
            <div className="mb-5 grid grid-cols-2 gap-2">
              {menu.slots.map((s) => (
                <button key={s.id} disabled={s.left <= 0} onClick={() => setSlotId(s.id)} className={`rounded-xl px-3 py-2 text-left text-sm ring-1 disabled:opacity-40 ${slotId === s.id ? 'bg-amber-50 ring-amber-500' : 'ring-stone-200'}`}>
                  <span className="block font-medium">{clock(s.startsAt)} – {clock(s.endsAt)}</span>
                  <span className="text-xs text-stone-500">{s.left > 0 ? `${s.left} left` : 'Full'}</span>
                </button>
              ))}
            </div>

            {error && <p role="alert" className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
            <div className="mb-3 flex items-center justify-between text-base font-semibold">
              <span>Total</span><span>{inr(total)}</span>
            </div>
            <button disabled={!ready || paying} onClick={pay} className="w-full rounded-xl bg-amber-500 py-3.5 text-sm font-semibold text-white transition hover:bg-amber-600 disabled:opacity-50">
              {paying ? 'Opening payment…' : 'Pay with UPI'}
            </button>
            {!counterId || !slotId ? <p className="mt-2 text-center text-xs text-stone-500">Choose a counter and a pickup time to continue.</p> : null}
          </div>
        </div>
      )}
    </main>
  )
}
