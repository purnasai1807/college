'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { inr } from '@/lib/client/format'
import { adminUrl } from '@/lib/client/admin-context'

type Report = {
  daily: { day: string; orders: number; gross: number }[]
  items: { name: string; qty: number; revenue: number }[]
  payments: { status: string; count: number; amountPaise: number }[]
  lowStock: { name: string; stock: number }[]
}
type Settlement = {
  capturedPaise: number
  refundsPaidPaise: number
  netSettledPaise: number
  outstandingRefundsPaise: number
  pendingPaymentsPaise: number
  failedPaymentsPaise: number
  paymentCount: number
  refundCount: number
}

const card = 'mb-6 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-stone-100'

export default function Reports() {
  const router = useRouter()
  const [days, setDays] = useState(30)
  const [data, setData] = useState<Report | null>(null)
  const [settlement, setSettlement] = useState<Settlement | null>(null)
  const [settlementError, setSettlementError] = useState('')
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
  const [from, setFrom] = useState(today)
  const [to, setTo] = useState(today)
  const [error, setError] = useState('')

  useEffect(() => {
    setData(null)
    const canteenId = new URLSearchParams(window.location.search).get('canteenId') ?? ''
    fetch(adminUrl(`/api/admin/reports/items?days=${days}`, canteenId))
      .then(async (res) => {
        if (res.status === 401 || res.status === 403) return router.push('/login')
        const json = await res.json()
        json.success ? setData(json.data) : setError(json.error.message)
      })
      .catch(() => setError('Could not reach the server.'))
  }, [days, router])

  useEffect(() => {
    const canteenId = new URLSearchParams(window.location.search).get('canteenId') ?? ''
    fetch(adminUrl(`/api/admin/reports/settlement?from=${from}&to=${to}`, canteenId))
      .then(async (res) => {
        const json = await res.json()
        if (json.success) {
          setSettlement(json.data)
          setSettlementError('')
        } else {
          setSettlement(null)
          setSettlementError(json.error.message)
        }
      })
      .catch(() => setSettlementError('Could not load settlement data.'))
  }, [from, to])

  return (
    <main className="mx-auto max-w-3xl px-5 py-8">
      <a href={adminUrl('/admin', new URLSearchParams(typeof window === 'undefined' ? '' : window.location.search).get('canteenId') ?? '')} className="text-sm text-stone-500 hover:text-stone-800">← Admin</a>
      <div className="mb-5 mt-3 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Reports</h1>
        <div className="flex items-center gap-3">
          <select value={days} onChange={(e) => setDays(Number(e.target.value))} aria-label="Period" className="rounded-lg border border-stone-300 px-3 py-1.5 text-sm">
            <option value={7}>Last 7 days</option><option value={30}>Last 30 days</option><option value={90}>Last 90 days</option>
          </select>
          <a href={adminUrl(`/api/admin/reports/items?days=${days}&format=csv`, new URLSearchParams(typeof window === 'undefined' ? '' : window.location.search).get('canteenId') ?? '')} className="text-sm text-amber-700 hover:underline">Items CSV</a>
        </div>
      </div>
      {error && <p role="alert" className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      <section className={card}>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-semibold">Payment settlement and reconciliation</h2>
          <a href={adminUrl(`/api/admin/reports/settlement?from=${from}&to=${to}&format=csv`, new URLSearchParams(typeof window === 'undefined' ? '' : window.location.search).get('canteenId') ?? '')} className="text-sm text-amber-700 hover:underline">Settlement CSV</a>
        </div>
        <div className="mb-4 flex flex-wrap gap-3 text-sm">
          <label>From <input type="date" value={from} onChange={(event) => setFrom(event.target.value)} className="ml-1 rounded-lg border border-stone-300 px-2 py-1" /></label>
          <label>To <input type="date" value={to} onChange={(event) => setTo(event.target.value)} className="ml-1 rounded-lg border border-stone-300 px-2 py-1" /></label>
        </div>
        {settlementError && <p role="alert" className="text-sm text-red-700">{settlementError}</p>}
        {settlement && (
          <dl className="grid grid-cols-2 gap-3 text-sm md:grid-cols-3">
            <div><dt className="text-stone-500">Captured</dt><dd className="font-semibold">{inr(settlement.capturedPaise)}</dd></div>
            <div><dt className="text-stone-500">Successful refunds</dt><dd className="font-semibold">{inr(settlement.refundsPaidPaise)}</dd></div>
            <div><dt className="text-stone-500">Net settled</dt><dd className="font-semibold">{inr(settlement.netSettledPaise)}</dd></div>
            <div><dt className="text-stone-500">Refunds in progress</dt><dd className="font-semibold">{inr(settlement.outstandingRefundsPaise)}</dd></div>
            <div><dt className="text-stone-500">Pending payments</dt><dd className="font-semibold">{inr(settlement.pendingPaymentsPaise)}</dd></div>
            <div><dt className="text-stone-500">Failed/expired payments</dt><dd className="font-semibold">{inr(settlement.failedPaymentsPaise)}</dd></div>
          </dl>
        )}
      </section>
      {!data && !error && <div className="h-40 animate-pulse rounded-2xl bg-stone-200" />}
      {data && (
        <>
          <section className={card}>
            <h2 className="mb-3 font-semibold">Daily sales</h2>
            <table className="w-full text-left text-sm"><thead className="text-xs text-stone-500"><tr><th>Day</th><th>Orders</th><th className="text-right">Gross</th></tr></thead>
              <tbody className="divide-y divide-stone-100">{data.daily.map((d) => <tr key={d.day}><td className="py-2">{d.day}</td><td>{d.orders}</td><td className="text-right">{inr(d.gross)}</td></tr>)}</tbody>
            </table>
            {data.daily.length === 0 && <p className="text-sm text-stone-500">No sales in this period.</p>}
          </section>
          <section className={card}>
            <h2 className="mb-3 font-semibold">Items by quantity sold</h2>
            <table className="w-full text-left text-sm"><thead className="text-xs text-stone-500"><tr><th>Item</th><th>Sold</th><th className="text-right">Revenue</th></tr></thead>
              <tbody className="divide-y divide-stone-100">{data.items.map((i) => <tr key={i.name}><td className="py-2">{i.name}</td><td>{i.qty}</td><td className="text-right">{inr(i.revenue)}</td></tr>)}</tbody>
            </table>
          </section>
          <section className={card}>
            <h2 className="mb-3 font-semibold">Payments</h2>
            <ul className="text-sm">{data.payments.map((p) => <li key={p.status} className="flex justify-between py-1"><span>{p.status.toLowerCase().replace('_', ' ')} ({p.count})</span><span>{inr(p.amountPaise)}</span></li>)}</ul>
          </section>
          <section className={card}>
            <h2 className="mb-3 font-semibold">Low stock</h2>
            {data.lowStock.length === 0 ? <p className="text-sm text-stone-500">Everything is well stocked.</p> : (
              <ul className="text-sm">{data.lowStock.map((f) => <li key={f.name} className="flex justify-between py-1"><span>{f.name}</span><span className={f.stock === 0 ? 'text-red-600' : 'text-amber-700'}>{f.stock === 0 ? 'Sold out' : `${f.stock} left`}</span></li>)}</ul>
            )}
          </section>
        </>
      )}
    </main>
  )
}
