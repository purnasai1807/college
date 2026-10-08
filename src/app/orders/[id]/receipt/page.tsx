'use client'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { inr } from '@/lib/client/format'

type Order = { canteenName: string; number: string; status: string; totalPaise: number; createdAt: string; counter: string; items: { name: string; qty: number; unitPaise: number }[] }

export default function Receipt() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [order, setOrder] = useState<Order | null>(null)
  const [name, setName] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    Promise.all([fetch(`/api/orders/${id}`), fetch('/api/auth/me')])
      .then(async ([o, me]) => {
        if (o.status === 401) return router.push('/login')
        const [oj, mj] = await Promise.all([o.json(), me.json()])
        if (!oj.success) return setError(oj.error.message)
        setOrder(oj.data)
        if (mj.success) setName(mj.data.name)
      })
      .catch(() => setError('Could not reach the server. Check your connection.'))
  }, [id, router])

  if (!order) return <main className="p-8 text-sm">{error || 'Loading…'}</main>
  if (['CREATED', 'PAYMENT_PENDING', 'CANCELLED'].includes(order.status)) {
    return <main className="p-8 text-sm">There is no receipt for an unpaid or cancelled order.</main>
  }

  return (
    <main className="mx-auto max-w-sm px-5 py-8">
      <article className="rounded-2xl bg-white p-6 font-mono text-sm shadow-sm ring-1 ring-stone-100">
        <h1 className="text-center text-base font-bold tracking-wide">{order.canteenName.toUpperCase()}</h1>
        <p className="mt-4">Order: {order.number}</p>
        {name && <p>Student: {name}</p>}
        <p>Date: {new Date(order.createdAt).toLocaleDateString('en-IN', { dateStyle: 'medium' })}</p>
        <p>Pickup: {order.counter}</p>
        <hr className="my-3 border-dashed border-stone-300" />
        {order.items.map((i) => (
          <p key={i.name} className="flex justify-between"><span>{i.name} × {i.qty}</span><span>{inr(i.qty * i.unitPaise)}</span></p>
        ))}
        <hr className="my-3 border-dashed border-stone-300" />
        <p className="flex justify-between font-bold"><span>TOTAL</span><span>{inr(order.totalPaise)}</span></p>
        <p className="mt-3">Payment: UPI · PAID</p>
      </article>
      <button onClick={() => window.print()} className="mt-4 w-full rounded-xl bg-stone-900 py-3 text-sm font-semibold text-white print:hidden">Print or save as PDF</button>
    </main>
  )
}
