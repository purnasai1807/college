'use client'
import { FormEvent, useState } from 'react'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const router = useRouter()
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [form, setForm] = useState({ name: '', studentId: '', email: '', password: '' })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm({ ...form, [k]: e.target.value })

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      const res = await fetch(`/api/auth/${mode}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const json = await res.json()
      if (!json.success) return setError(json.error.message)
      const home: Record<string, string> = { KITCHEN: '/kitchen', STAFF: '/scan', ADMIN: '/admin', SUPER_ADMIN: '/admin' }
      router.push(home[json.data.role] ?? '/')
    } catch {
      setError('Could not reach the server. Check your connection.')
    } finally {
      setBusy(false)
    }
  }

  const field = 'w-full rounded-xl border border-stone-300 bg-white px-4 py-3 text-sm outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-200'

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6">
      <div className="mb-8">
        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-500 text-2xl">🍴</div>
        <h1 className="text-2xl font-semibold">College Canteen</h1>
        <p className="mt-1 text-sm text-stone-500">Order ahead, pay by UPI, skip the queue.</p>
      </div>

      <form onSubmit={submit} className="space-y-3">
        {mode === 'register' && (
          <>
            <input className={field} placeholder="Full name" aria-label="Full name" value={form.name} onChange={set('name')} required />
            <input className={field} placeholder="Student ID" aria-label="Student ID" value={form.studentId} onChange={set('studentId')} required />
          </>
        )}
        <input className={field} type="email" placeholder="College email" aria-label="Email" value={form.email} onChange={set('email')} required />
        <input className={field} type="password" placeholder="Password" aria-label="Password" minLength={mode === 'register' ? 8 : 1} value={form.password} onChange={set('password')} required />
        {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        <button disabled={busy} className="w-full rounded-xl bg-amber-500 py-3 text-sm font-semibold text-white transition hover:bg-amber-600 disabled:opacity-60">
          {busy ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'}
        </button>
      </form>

      <a href="/forgot-password" className="mt-4 text-sm text-stone-500 hover:text-stone-800">Forgot your password?</a>

      <button onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError('') }} className="mt-5 text-sm text-stone-500 hover:text-stone-800">
        {mode === 'login' ? 'New here? Create an account' : 'Already registered? Sign in'}
      </button>
    </main>
  )
}
