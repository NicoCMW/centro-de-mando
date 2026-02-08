import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createServerSupabase } from '@/lib/supabase/server'

const STATUSES = [
  'inbox',
  'triage',
  'in_progress',
  'blocked',
  'review',
  'needs_nico',
  'done',
  'canceled',
] as const

type Status = (typeof STATUSES)[number]

type TaskRow = {
  id: string
  title: string
  description: string | null
  status: Status
  priority: 'low' | 'medium' | 'high' | 'urgent'
  updated_at: string
}

async function moveTask(formData: FormData) {
  'use server'

  const id = String(formData.get('id'))
  const status = String(formData.get('status')) as Status

  const supabase = await createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { error } = await supabase
    .from('tasks')
    .update({ status })
    .eq('id', id)

  if (error) throw new Error(error.message)
}

async function createTask(formData: FormData) {
  'use server'

  const title = String(formData.get('title') ?? '').trim()
  const description = String(formData.get('description') ?? '').trim()

  if (!title) return

  const supabase = await createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { error } = await supabase.from('tasks').insert({
    owner_id: user.id,
    title,
    description: description || null,
    status: 'inbox',
    priority: 'medium',
    created_by: 'nico',
  })

  if (error) throw new Error(error.message)
}

export default async function BoardPage() {
  const supabase = await createServerSupabase()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: tasks, error } = await supabase
    .from('tasks')
    .select('id,title,description,status,priority,updated_at')
    .order('updated_at', { ascending: false })

  if (error) {
    return (
      <main className="p-6">
        <h1 className="text-2xl font-semibold">Centro de Mando</h1>
        <p className="mt-3 text-sm">Error: {error.message}</p>
      </main>
    )
  }

  const byStatus = new Map<Status, TaskRow[]>()
  STATUSES.forEach((s) => byStatus.set(s, []))
  ;(tasks as TaskRow[] | null)?.forEach((t) => {
    byStatus.get(t.status)?.push(t)
  })

  return (
    <main className="p-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Centro de Mando</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Kanban v1 conectado a Supabase.
          </p>
        </div>

        <div className="text-sm">
          <Link className="underline" href="/login">
            Cuenta
          </Link>
        </div>
      </div>

      <section className="mt-6 max-w-xl">
        <h2 className="font-medium">Crear task</h2>
        <form action={createTask} className="mt-2 space-y-2">
          <input
            name="title"
            className="w-full border rounded px-3 py-2"
            placeholder="Título"
            required
          />
          <textarea
            name="description"
            className="w-full border rounded px-3 py-2"
            placeholder="Descripción (opcional)"
            rows={3}
          />
          <button className="bg-black text-white rounded px-3 py-2">
            Crear
          </button>
        </form>
      </section>

      <section className="mt-10">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {STATUSES.map((status) => (
            <div key={status} className="border rounded p-3">
              <div className="font-medium capitalize">{status}</div>
              <div className="mt-3 space-y-3">
                {(byStatus.get(status) ?? []).map((t) => (
                  <div key={t.id} className="border rounded p-2">
                    <div className="text-sm font-medium">{t.title}</div>
                    {t.description && (
                      <div className="text-xs text-muted-foreground mt-1">
                        {t.description}
                      </div>
                    )}

                    <form action={moveTask} className="mt-2 flex gap-2">
                      <input type="hidden" name="id" value={t.id} />
                      <select
                        name="status"
                        defaultValue={t.status}
                        className="text-xs border rounded px-2 py-1"
                      >
                        {STATUSES.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                      <button className="text-xs border rounded px-2 py-1">
                        Mover
                      </button>
                    </form>
                  </div>
                ))}

                {(byStatus.get(status) ?? []).length === 0 && (
                  <div className="text-xs text-muted-foreground">Vacío</div>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>
    </main>
  )
}
