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

type BoardSearchParams = {
  q?: string
  status?: Status
  since?: 'today'
}

function buildTodayIsoStart() {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d.toISOString()
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

  const { error } = await supabase.from('tasks').update({ status }).eq('id', id)

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

export default async function BoardPage({
  searchParams,
}: {
  searchParams: Promise<BoardSearchParams>
}) {
  const sp = await searchParams
  const q = (sp.q ?? '').trim()
  const status = sp.status
  const since = sp.since

  const supabase = await createServerSupabase()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  let query = supabase
    .from('tasks')
    .select('id,title,description,status,priority,updated_at')
    .order('updated_at', { ascending: false })

  if (status) query = query.eq('status', status)

  if (since === 'today') {
    query = query.gte('updated_at', buildTodayIsoStart())
  }

  if (q) {
    // Supabase filter: title ILIKE OR description ILIKE
    const safe = q.replaceAll(',', ' ')
    query = query.or(`title.ilike.%${safe}%,description.ilike.%${safe}%`)
  }

  const { data: tasks, error } = await query

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

  const isFiltered = Boolean(q || status || since)

  const quick = {
    all: '/board',
    inbox: '/board?status=inbox',
    needsNico: '/board?status=needs_nico',
    today: '/board?since=today',
  }

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
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="text-sm font-medium">Vista rápida</div>
            <div className="mt-1 flex flex-wrap gap-3 text-sm">
              <Link className="underline" href={quick.all}>
                Todo
              </Link>
              <Link className="underline" href={quick.inbox}>
                Inbox
              </Link>
              <Link className="underline" href={quick.needsNico}>
                Needs Nico
              </Link>
              <Link className="underline" href={quick.today}>
                Updated hoy
              </Link>
              {isFiltered && (
                <Link className="underline" href="/board">
                  Limpiar filtros
                </Link>
              )}
            </div>

            {isFiltered && (
              <div className="mt-2 text-xs text-muted-foreground">
                Filtros activos:{' '}
                {q ? `q="${q}" ` : ''}
                {status ? `status=${status} ` : ''}
                {since ? `since=${since}` : ''}
              </div>
            )}
          </div>

          <form method="get" className="flex gap-2">
            <input
              name="q"
              defaultValue={q}
              className="border rounded px-3 py-2 text-sm"
              placeholder="Buscar (título o descripción)"
            />
            <select
              name="status"
              defaultValue={status ?? ''}
              className="border rounded px-3 py-2 text-sm"
            >
              <option value="">(cualquier estado)</option>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <select
              name="since"
              defaultValue={since ?? ''}
              className="border rounded px-3 py-2 text-sm"
            >
              <option value="">(cualquier fecha)</option>
              <option value="today">updated hoy</option>
            </select>
            <button className="border rounded px-3 py-2 text-sm">Aplicar</button>
          </form>
        </div>

        {!status && !q && !since ? (
          <div className="mt-6 grid grid-cols-1 md:grid-cols-4 gap-4">
            {STATUSES.map((s) => (
              <div key={s} className="border rounded p-3">
                <div className="font-medium capitalize">{s}</div>
                <div className="mt-3 space-y-3">
                  {(byStatus.get(s) ?? []).map((t) => (
                    <div key={t.id} className="border rounded p-2">
                      <div className="text-sm font-medium">
                        <Link className="underline" href={`/task/${t.id}`}>
                          {t.title}
                        </Link>
                      </div>
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
                          {STATUSES.map((opt) => (
                            <option key={opt} value={opt}>
                              {opt}
                            </option>
                          ))}
                        </select>
                        <button className="text-xs border rounded px-2 py-1">
                          Mover
                        </button>
                      </form>
                    </div>
                  ))}

                  {(byStatus.get(s) ?? []).length === 0 && (
                    <div className="text-xs text-muted-foreground">Vacío</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="mt-6 space-y-3">
            {(tasks as TaskRow[] | null)?.map((t) => (
              <div key={t.id} className="border rounded p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-medium">
                      <Link className="underline" href={`/task/${t.id}`}>
                        {t.title}
                      </Link>
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      status={t.status} • priority={t.priority}
                    </div>
                    {t.description && (
                      <div className="text-xs text-muted-foreground mt-2">
                        {t.description}
                      </div>
                    )}
                  </div>

                  <form action={moveTask} className="flex gap-2">
                    <input type="hidden" name="id" value={t.id} />
                    <select
                      name="status"
                      defaultValue={t.status}
                      className="text-xs border rounded px-2 py-1"
                    >
                      {STATUSES.map((opt) => (
                        <option key={opt} value={opt}>
                          {opt}
                        </option>
                      ))}
                    </select>
                    <button className="text-xs border rounded px-2 py-1">
                      Mover
                    </button>
                  </form>
                </div>
              </div>
            ))}

            {(tasks as TaskRow[] | null)?.length === 0 && (
              <div className="text-sm text-muted-foreground">
                No hay resultados para estos filtros.
              </div>
            )}
          </div>
        )}
      </section>
    </main>
  )
}
