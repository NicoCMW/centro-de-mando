'use client'

import { useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function LoginClient() {
  const router = useRouter()
  const search = useSearchParams()
  const next = search.get('next') ?? '/board'

  const supabase = useMemo(() => createClient(), [])

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [mode, setMode] = useState<'password' | 'magic'>('password')
  const [status, setStatus] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setStatus(null)
    setLoading(true)

    try {
      if (mode === 'password') {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        })
        if (error) throw error
        router.replace(next)
        router.refresh()
        return
      }

      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: `${window.location.origin}${next}`,
        },
      })
      if (error) throw error
      setStatus('Te envié un link al email. Ábrelo para entrar.')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error de login'
      setStatus(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="p-6 max-w-md">
      <h1 className="text-2xl font-semibold">Login</h1>
      <p className="text-sm text-muted-foreground mt-2">
        Centro de Mando (single-user).
      </p>

      <div className="mt-4 flex gap-2">
        <button
          className={`px-3 py-1 rounded border ${mode === 'password' ? 'bg-black text-white' : ''}`}
          onClick={() => setMode('password')}
          type="button"
        >
          Password
        </button>
        <button
          className={`px-3 py-1 rounded border ${mode === 'magic' ? 'bg-black text-white' : ''}`}
          onClick={() => setMode('magic')}
          type="button"
        >
          Magic link
        </button>
      </div>

      <form onSubmit={onSubmit} className="mt-6 space-y-3">
        <label className="block">
          <div className="text-sm mb-1">Email</div>
          <input
            className="w-full border rounded px-3 py-2"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            type="email"
            required
          />
        </label>

        {mode === 'password' && (
          <label className="block">
            <div className="text-sm mb-1">Password</div>
            <input
              className="w-full border rounded px-3 py-2"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type="password"
              required
            />
          </label>
        )}

        <button
          className="w-full bg-black text-white rounded px-3 py-2 disabled:opacity-50"
          disabled={loading}
        >
          {loading ? 'Entrando…' : 'Entrar'}
        </button>

        {status && <p className="text-sm">{status}</p>}
      </form>
    </main>
  )
}
