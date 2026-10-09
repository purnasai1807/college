'use client'
import { useLive } from '@/lib/client/live'
import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { useParams, useRouter } from 'next/navigation'
import QRCode from 'qrcode'
import { clock, inr } from '@/lib/client/format'
import { openCheckout } from '@/lib/client/razorpay'

type Order = {
  id: string
  number: string
  status: string
  totalPaise: number
  counter: string
  slot: { startsAt: string; endsAt: string }
  items: { name: string; qty: number; unitPaise: number }[]
  checkout: { providerOrderId: string; publicKey: string } | null
  queue: { position: number; readyAt: string } | null
  feedback: { rating: number; comment: string; status: string; response: string | null } | null
}

const STEPS = [
  ['PAID', 'Payment verified'],
  ['ACCEPTED', 'Accepted'],
  ['PREPARING', 'Preparing'],
  ['READY', 'Ready for pickup'],
  ['COLLECTED', 'Collected'],
]
const FINISHED = ['COLLECTED', 'CANCELLED']

export default function OrderPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [order, setOrder] = useState<Order | null>(null)
  const [qr, setQr] = useState('')
  const [error, setError] = useState('')
  const [rating, setRating] = useState(5)
  const [comment, setComment] = useState('')
  const [feedbackMessage, setFeedbackMessage] = useState('')
  const [sendingFeedback, setSendingFeedback] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/orders/${id}`)
      if (res.status === 401) return router.push('/login')
      const json = await res.json()
      json.success ? setOrder(json.data) : setError(json.error.message)
    } catch {
      setError('Could not reach the server. Check your connection.')
    }
  }, [id, router])

  useEffect(() => { load() }, [load])

  useLive(load)

  const hasQr = !!order && ['PAID', 'ACCEPTED', 'PREPARING', 'READY'].includes(order.status)
  useEffect(() => {
    if (!hasQr) return
    fetch(`/api/orders/${id}/qr`)
      .then((r) => r.json())
      .then(async (j) => j.success && setQr(await QRCode.toDataURL(j.data.token, { width: 480, margin: 2 })))
      .catch(() => {})
  }, [hasQr, id])

  if (!order) {
    return (
      <main className="mx-auto max-w-md px-5 py-10">
        {error ? <p role="alert" className="rounded-xl bg-red-50 p-4 text-sm text-red-700">{error}</p> : <div className="h-64 animate-pulse rounded-3xl bg-stone-200" />}
      </main>
    )
  }

  const step = STEPS.findIndex(([s]) => s === order.status)
  const cancelled = order.status === 'CANCELLED'

  async function submitFeedback(event: FormEvent) {
    event.preventDefault()
    setSendingFeedback(true)
    setFeedbackMessage('')
    try {
      const response = await fetch(`/api/orders/${id}/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rating, comment }),
      })
      const json = await response.json()
      if (!response.ok || !json.success) throw new Error(json.error?.message ?? 'Could not submit feedback.')
      setOrder((current) => current ? { ...current, feedback: json.data } : current)
      setFeedbackMessage('Thanks—your feedback was sent to the canteen.')
    } catch (cause) {
      setFeedbackMessage(cause instanceof Error ? cause.message : 'Could not submit feedback.')
    } finally {
      setSendingFeedback(false)
    }
  }

  return (
    <main className="mx-auto max-w-md px-5 py-8">
      <button onClick={() => router.push('/')} className="mb-5 text-sm text-stone-500 hover:text-stone-800">← Back to menu</button>

      <section className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-stone-100">
        <p className="text-xs uppercase tracking-wide text-stone-400">Order</p>
        <h1 className="text-xl font-semibold">{order.number}</h1>
        <p className="mt-1 text-sm text-stone-500">{order.counter} · {clock(order.slot.startsAt)} – {clock(order.slot.endsAt)}</p>
        {order.queue && <p className="mt-1 text-sm text-amber-700">Queue position {order.queue.position} · estimated ready around {clock(order.queue.readyAt)}</p>}

        {order.status === 'PAYMENT_PENDING' && (
          <div className="mt-5 rounded-2xl bg-amber-50 p-4 text-sm text-amber-900">
            <p className="font-medium">Waiting for Razorpay payment confirmation</p>
            <p className="mt-1 text-amber-800">Scan the UPI QR in checkout. This order changes to confirmed only after Razorpay verifies the payment; if you already paid, please wait and don’t pay twice.</p>
            {order.checkout && (
              <button
                onClick={() => openCheckout({ key: order.checkout!.publicKey, orderId: order.checkout!.providerOrderId, amountPaise: order.totalPaise, onClose: load })}
                className="mt-3 rounded-xl bg-amber-500 px-4 py-2 font-semibold text-white"
              >
                Show UPI QR · {inr(order.totalPaise)}
              </button>
            )}
          </div>
        )}

        {cancelled && <p className="mt-5 rounded-2xl bg-red-50 p-4 text-sm text-red-700">This order was cancelled. If money was taken, it will be refunded.</p>}

        {!cancelled && order.status !== 'PAYMENT_PENDING' && (
          <ol className="mt-6 space-y-3">
            {STEPS.map(([key, label], i) => (
              <li key={key} className="flex items-center gap-3 text-sm">
                <span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs ${i < step ? 'bg-emerald-500 text-white' : i === step ? 'bg-amber-500 text-white' : 'bg-stone-100 text-stone-400'}`}>{i < step ? '✓' : i + 1}</span>
                <span className={i <= step ? 'font-medium' : 'text-stone-400'}>{label}</span>
              </li>
            ))}
          </ol>
        )}

        {qr && (
          <div className="mt-6 rounded-2xl bg-stone-50 p-4 text-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qr} alt="Pickup QR code" className="mx-auto w-56 rounded-xl bg-white p-2" />
            <p className="mt-3 text-sm text-stone-600">Show this QR to the staff at {order.counter}.</p>
          </div>
        )}

        <ul className="mt-6 divide-y divide-stone-100 border-t border-stone-100 text-sm">
          {order.items.map((i) => (
            <li key={i.name} className="flex justify-between py-2.5"><span>{i.name} × {i.qty}</span><span>{inr(i.qty * i.unitPaise)}</span></li>
          ))}
          <li className="flex justify-between pt-3 font-semibold"><span>Total</span><span>{inr(order.totalPaise)}</span></li>
        </ul>
        {!cancelled && order.status !== 'PAYMENT_PENDING' && <a href={`/orders/${order.id}/receipt`} className="mt-4 block text-center text-sm text-amber-700 hover:underline">View receipt</a>}
        {order.status === 'COLLECTED' && (
          <section className="mt-6 border-t border-stone-100 pt-5">
            <h2 className="font-semibold">Order feedback</h2>
            {order.feedback ? (
              <div className="mt-2 rounded-xl bg-emerald-50 p-4 text-sm text-emerald-900">
                <p>{'★'.repeat(order.feedback.rating)}{'☆'.repeat(5 - order.feedback.rating)} · Feedback {order.feedback.status.toLowerCase()}</p>
                {order.feedback.comment && <p className="mt-2 whitespace-pre-wrap">{order.feedback.comment}</p>}
                {order.feedback.response && <p className="mt-3 border-t border-emerald-200 pt-3"><strong>Canteen response:</strong> {order.feedback.response}</p>}
              </div>
            ) : (
              <form onSubmit={submitFeedback} className="mt-3 space-y-3">
                <label className="block text-sm text-stone-600">
                  Rating
                  <select value={rating} onChange={(event) => setRating(Number(event.target.value))} className="ml-2 rounded-lg border border-stone-300 px-3 py-2">
                    <option value={5}>5 · Excellent</option><option value={4}>4 · Good</option><option value={3}>3 · Okay</option><option value={2}>2 · Poor</option><option value={1}>1 · Very poor</option>
                  </select>
                </label>
                <label className="block text-sm text-stone-600">
                  Comments (optional)
                  <textarea value={comment} onChange={(event) => setComment(event.target.value)} maxLength={1000} rows={3} className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2" />
                </label>
                <button disabled={sendingFeedback} className="rounded-xl bg-stone-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
                  {sendingFeedback ? 'Sending…' : 'Send feedback'}
                </button>
                {feedbackMessage && <p role="status" className="text-sm text-stone-600">{feedbackMessage}</p>}
              </form>
            )}
          </section>
        )}
      </section>
    </main>
  )
}
