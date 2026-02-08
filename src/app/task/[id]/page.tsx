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
  assigned_agent_id: string | null
  owner_id: string
  created_at: string
  updated_at: string
}

type SubtaskRow = {
  id: string
  task_id: string
  title: string
  status: Status
  assignee_agent_id: string | null
  definition_of_done: string
  result_summary: string | null
  created_at: string
  updated_at: string
}

type CommentRow = {
  id: string
  task_id: string
  subtask_id: string | null
  author_type: 'nico' | 'agent' | 'system'
  author_agent_id: string | null
  body: string
  created_at: string
}

type AgentRow = {
  id: string
  name: string
  role: string
  status: string
  is_active: boolean
}

async function updateTask(formData: FormData) {
  'use server'

  const id = String(formData.get('id'))
  const status = String(formData.get('status')) as Status
  const assigned_agent_id = String(formData.get('assigned_agent_id') ?? '')

  const supabase = await createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const patch: { status: Status; assigned_agent_id: string | null } = {
    status,
    assigned_agent_id: assigned_agent_id ? assigned_agent_id : null,
  }

  const { error } = await supabase.from('tasks').update(patch).eq('id', id)
  if (error) throw new Error(error.message)
}

async function addComment(formData: FormData) {
  'use server'

  const task_id = String(formData.get('task_id'))
  const body = String(formData.get('body') ?? '').trim()
  if (!body) return

  const supabase = await createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { error } = await supabase.from('comments').insert({
    owner_id: user.id,
    task_id,
    author_type: 'nico',
    body,
  })

  if (error) throw new Error(error.message)
}

async function createSubtask(formData: FormData) {
  'use server'

  const task_id = String(formData.get('task_id'))
  const title = String(formData.get('title') ?? '').trim()
  const definition_of_done = String(formData.get('definition_of_done') ?? '').trim()
  const assignee_agent_id = String(formData.get('assignee_agent_id') ?? '')

  if (!title || !definition_of_done) return

  const supabase = await createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { error } = await supabase.from('subtasks').insert({
    owner_id: user.id,
    task_id,
    title,
    definition_of_done,
    status: 'in_progress',
    assignee_agent_id: assignee_agent_id ? assignee_agent_id : null,
  })

  if (error) throw new Error(error.message)
}

async function updateSubtask(formData: FormData) {
  'use server'

  const id = String(formData.get('id'))
  const status = String(formData.get('status')) as Status
  const result_summary = String(formData.get('result_summary') ?? '').trim()

  const supabase = await createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { error } = await supabase
    .from('subtasks')
    .update({ status, result_summary: result_summary || null })
    .eq('id', id)

  if (error) throw new Error(error.message)
}

export default async function TaskPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const supabase = await createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: task, error: taskErr } = await supabase
    .from('tasks')
    .select(
      'id,title,description,status,priority,assigned_agent_id,owner_id,created_at,updated_at'
    )
    .eq('id', id)
    .maybeSingle()

  if (taskErr) {
    return (
      <main className="p-6">
        <p className="text-sm">Error: {taskErr.message}</p>
        <Link className="underline" href="/board">
          Volver
        </Link>
      </main>
    )
  }

  if (!task) {
    return (
      <main className="p-6">
        <p className="text-sm">Task no encontrada.</p>
        <Link className="underline" href="/board">
          Volver
        </Link>
      </main>
    )
  }

  const { data: subtasks } = await supabase
    .from('subtasks')
    .select(
      'id,task_id,title,status,assignee_agent_id,definition_of_done,result_summary,created_at,updated_at'
    )
    .eq('task_id', id)
    .order('created_at', { ascending: true })

  const { data: comments } = await supabase
    .from('comments')
    .select('id,task_id,subtask_id,author_type,author_agent_id,body,created_at')
    .eq('task_id', id)
    .order('created_at', { ascending: true })

  const { data: agents } = await supabase
    .from('agents')
    .select('id,name,role,status,is_active')
    .eq('is_active', true)
    .order('name', { ascending: true })

  const agentMap = new Map<string, AgentRow>()
  ;(agents as AgentRow[] | null)?.forEach((a) => agentMap.set(a.id, a))

  const t = task as TaskRow

  return (
    <main className="p-6 max-w-4xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link className="underline text-sm" href="/board">
            ← Volver al board
          </Link>
          <h1 className="text-2xl font-semibold mt-3">{t.title}</h1>
          {t.description && (
            <p className="text-sm text-muted-foreground mt-2">{t.description}</p>
          )}
          <p className="text-xs text-muted-foreground mt-3">
            {t.status} · {t.priority} · updated {new Date(t.updated_at).toLocaleString()}
          </p>
        </div>

        <div className="text-sm">
          <Link className="underline" href="/login">
            Cuenta
          </Link>
        </div>
      </div>

      <section className="mt-8 border rounded p-4">
        <h2 className="font-medium">Task settings</h2>
        <form action={updateTask} className="mt-3 flex flex-wrap gap-3 items-end">
          <input type="hidden" name="id" value={t.id} />

          <label className="text-sm">
            <div className="text-xs mb-1">Status</div>
            <select
              name="status"
              defaultValue={t.status}
              className="border rounded px-2 py-1"
            >
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>

          <label className="text-sm">
            <div className="text-xs mb-1">Assigned agent</div>
            <select
              name="assigned_agent_id"
              defaultValue={t.assigned_agent_id ?? ''}
              className="border rounded px-2 py-1"
            >
              <option value="">(none)</option>
              {(agents as AgentRow[] | null)?.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} · {a.role}
                </option>
              ))}
            </select>
          </label>

          <button className="border rounded px-3 py-2">Guardar</button>
        </form>
      </section>

      <section className="mt-8 border rounded p-4">
        <h2 className="font-medium">Subtasks</h2>

        <div className="mt-4 space-y-3">
          {(subtasks as SubtaskRow[] | null)?.map((s) => (
            <div key={s.id} className="border rounded p-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-medium">{s.title}</div>
                  <div className="text-xs text-muted-foreground mt-1">
                    DoD: {s.definition_of_done}
                  </div>
                  {s.result_summary && (
                    <div className="text-xs mt-2">Result: {s.result_summary}</div>
                  )}
                  <div className="text-xs text-muted-foreground mt-2">
                    {s.status}
                    {s.assignee_agent_id
                      ? ` · ${agentMap.get(s.assignee_agent_id)?.name ?? 'agent'}`
                      : ''}
                  </div>
                </div>

                <form action={updateSubtask} className="flex gap-2 items-end">
                  <input type="hidden" name="id" value={s.id} />
                  <select
                    name="status"
                    defaultValue={s.status}
                    className="text-xs border rounded px-2 py-1"
                  >
                    {STATUSES.map((st) => (
                      <option key={st} value={st}>
                        {st}
                      </option>
                    ))}
                  </select>
                  <input
                    name="result_summary"
                    defaultValue={s.result_summary ?? ''}
                    placeholder="result (optional)"
                    className="text-xs border rounded px-2 py-1"
                  />
                  <button className="text-xs border rounded px-2 py-1">
                    Update
                  </button>
                </form>
              </div>
            </div>
          ))}

          {(!subtasks || subtasks.length === 0) && (
            <div className="text-sm text-muted-foreground">Sin subtasks.</div>
          )}
        </div>

        <div className="mt-6">
          <h3 className="text-sm font-medium">Crear subtask</h3>
          <form action={createSubtask} className="mt-2 space-y-2">
            <input type="hidden" name="task_id" value={t.id} />
            <input
              name="title"
              className="w-full border rounded px-3 py-2"
              placeholder="Título"
              required
            />
            <textarea
              name="definition_of_done"
              className="w-full border rounded px-3 py-2"
              placeholder="Definition of Done (obligatorio)"
              rows={3}
              required
            />
            <select
              name="assignee_agent_id"
              defaultValue={t.assigned_agent_id ?? ''}
              className="border rounded px-2 py-2 text-sm"
            >
              <option value="">(sin asignar)</option>
              {(agents as AgentRow[] | null)?.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} · {a.role}
                </option>
              ))}
            </select>
            <button className="bg-black text-white rounded px-3 py-2">
              Crear subtask
            </button>
          </form>
        </div>
      </section>

      <section className="mt-8 border rounded p-4">
        <h2 className="font-medium">Comentarios</h2>

        <div className="mt-4 space-y-3">
          {(comments as CommentRow[] | null)?.map((c) => (
            <div key={c.id} className="border rounded p-3">
              <div className="text-xs text-muted-foreground">
                {new Date(c.created_at).toLocaleString()} · {c.author_type}
                {c.author_agent_id
                  ? ` · ${agentMap.get(c.author_agent_id)?.name ?? c.author_agent_id}`
                  : ''}
              </div>
              <div className="text-sm mt-2 whitespace-pre-wrap">{c.body}</div>
            </div>
          ))}

          {(!comments || comments.length === 0) && (
            <div className="text-sm text-muted-foreground">Sin comentarios.</div>
          )}
        </div>

        <div className="mt-6">
          <h3 className="text-sm font-medium">Añadir comentario</h3>
          <form action={addComment} className="mt-2 space-y-2">
            <input type="hidden" name="task_id" value={t.id} />
            <textarea
              name="body"
              className="w-full border rounded px-3 py-2"
              placeholder="Escribe un comentario…"
              rows={4}
              required
            />
            <button className="bg-black text-white rounded px-3 py-2">
              Comentar
            </button>
          </form>
        </div>
      </section>

      <section className="mt-8 text-xs text-muted-foreground">
        <div>Task ID: {t.id}</div>
        <div>Owner: {t.owner_id}</div>
      </section>
    </main>
  )
}
