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

const PRIORITIES = ['low', 'medium', 'high', 'urgent'] as const

type Status = (typeof STATUSES)[number]
type Priority = (typeof PRIORITIES)[number]

type TaskRow = {
  id: string
  title: string
  description: string | null
  status: Status
  priority: Priority
  updated_at: string
}

type BoardSearchParams = {
  q?: string
  status?: Status
  priority?: Priority
  since?: 'today'
}

function buildTodayIsoStart() {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d.toISOString()
}

function priorityClass(p: Priority) {
  switch (p) {
    case 'urgent':
      return 'bg-red-100 text-red-900 border-red-200'
    case 'high':
      return 'bg-orange-100 text-orange-900 border-orange-200'
    case 'medium':
      return 'bg-slate-100 text-slate-900 border-slate-200'
    case 'low':
      return 'bg-emerald-100 text-emerald-900 border-emerald-200'
  }
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

async function bulkUpdateTasks(formData: FormData) {
  'use server'

  const ids = formData.getAll('ids').map(String).filter(Boolean)
  const status = String(formData.get('status') ?? '') as Status
  const priority = String(formData.get('priority') ?? '') as Priority

  if (ids.length === 0) return

  const patch: Partial<{ status: Status; priority: Priority }> = {}
  if (status) patch.status = status
  if (priority) patch.priority = priority
  if (Object.keys(patch).length === 0) return

  const supabase = await createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  // RLS should enforce owner_id; still keep server-side auth check.
  const { error } = await supabase.from('tasks').update(patch).in('id', ids)
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
  const priority = sp.priority
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
  if (priority) query = query.eq('priority', priority)

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

  const isFiltered = Boolean(q || status || priority || since)

  const quick = {
    all: '/board',
    inbox: '/board?status=inbox',
    needsNico: '/board?status=needs_nico',
    today: '/board?since=today',
    urgent: '/board?priority=urgent',
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
              <Link className="underline" href={quick.urgent}>
                Urgent
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
                {q ? `q=\"${q}\" ` : ''}
                {status ? `status=${status} ` : ''}
                {priority ? `priority=${priority} ` : ''}
                {since ? `since=${since}` : ''}
              </div>
            )}
          </div>

          <form method="get" className="flex flex-wrap gap-2">
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
              name="priority"
              defaultValue={priority ?? ''}
              className="border rounded px-3 py-2 text-sm"
            >
              <option value="">(cualquier prioridad)</option>
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {p}
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

        {!status && !q && !priority && !since ? (
          <div className="mt-6 grid grid-cols-1 md:grid-cols-4 gap-4">
            {STATUSES.map((s) => (
              <div key={s} className="border rounded p-3">
                <div className="font-medium capitalize">{s}</div>
                <div className="mt-3 space-y-3">
                  {(byStatus.get(s) ?? []).map((t) => (
                    <div key={t.id} className="border rounded p-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="text-sm font-medium">
                          <Link className="underline" href={`/task/${t.id}`}>
                            {t.title}
                          </Link>
                        </div>
                        <span
                          className={`text-[10px] leading-4 px-2 py-0.5 border rounded-full ${priorityClass(
                            t.priority
                          )}`}
                          title={`priority=${t.priority}`}
                        >
                          {t.priority}
                        </span>
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
            <div className="border rounded p-3">
              <div className="text-sm font-medium">Acciones en lote</div>
              <p className="text-xs text-muted-foreground mt-1">
                Selecciona tasks y aplica cambios de status/prioridad en un solo
                click.
              </p>

              <form id="bulk" action={bulkUpdateTasks} className="mt-3 flex flex-wrap gap-2 items-end">
                <label className="text-xs">
                  <div className="mb-1">Status (opcional)</div>
                  <select name="status" defaultValue="" className="text-xs border rounded px-2 py-1">
                    <option value="">(no cambiar)</option>
                    {STATUSES.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="text-xs">
                  <div className="mb-1">Priority (opcional)</div>
                  <select name="priority" defaultValue="" className="text-xs border rounded px-2 py-1">
                    <option value="">(no cambiar)</option>
                    {PRIORITIES.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                </label>

                <button className="text-xs border rounded px-3 py-2">
                  Aplicar a seleccionadas
                </button>
              </form>

              <div className="text-[11px] text-muted-foreground mt-2">
                Tip: puedes filtrar arriba (p.ej. status=inbox) y luego mover 10 a
                triage de una.
              </div>
            </div>

            {(tasks as TaskRow[] | null)?.map((t) => (
              <div key={t.id} className="border rounded p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex gap-3">
                    <input
                      type="checkbox"
                      name="ids"
                      value={t.id}
                      form="bulk"
                      className="mt-1"
                      aria-label={`Seleccionar ${t.title}`}
                    />

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
