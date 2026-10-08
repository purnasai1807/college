'use client'

import { FormEvent, useState } from 'react'
import { useRouter } from 'next/navigation'

const field = 'w-full rounded-xl border border-stone-300 px-4 py-3 text-sm outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-200'

export default function RegisterPage() {
  const router = useRouter()
  const [form, setForm] = useState({ name: '', studentId: '', email: '', password: '' })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const json = await res.json()
      if (!json.success) return setError(json.error.message)
      router.push('/')
    } catch {
      setError('Could not create your account. Check your connection.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6">
      <a href="/" className="mb-7 text-sm text-stone-500 hover:text-stone-800">← College Canteen</a>
      <h1 className="text-2xl font-semibold">Create your student account</h1>
      <p className="mb-6 mt-1 text-sm text-stone-500">Use your college details to order ahead and skip the queue.</p>
      <form onSubmit={submit} className="space-y-3">
        <input className={field} placeholder="Full name" aria-label="Full name" autoComplete="name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} minLength={2} maxLength={80} required />
        <input className={field} placeholder="Student ID" aria-label="Student ID" value={form.studentId} onChange={(e) => setForm({ ...form, studentId: e.target.value })} minLength={3} maxLength={30} required />
        <input className={field} type="email" placeholder="College email" aria-label="College email" autoComplete="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
        <input className={field} type="password" placeholder="Password" aria-label="Password" autoComplete="new-password" minLength={8} maxLength={100} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required />
        {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        <button disabled={busy} className="w-full rounded-xl bg-amber-500 py-3 text-sm font-semibold text-white transition hover:bg-amber-600 disabled:opacity-60">
          {busy ? 'Creating account…' : 'Create account'}
        </button>
      </form>
      <a href="/login" className="mt-5 text-sm text-stone-500 hover:text-stone-800">Already have an account? Sign in</a>
    </main>
  )
}
