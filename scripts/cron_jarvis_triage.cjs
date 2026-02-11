/* eslint-disable @typescript-eslint/no-require-imports */
/* Jarvis triage cron — Centro de Mando
   Reqs:
   - SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL)
   - SUPABASE_SERVICE_ROLE_KEY
   - CENTRO_OWNER_ID
*/

const { createClient } = require('@supabase/supabase-js');

function mustEnv(...names) {
  for (const name of names) {
    const v = process.env[name];
    if (v) return v;
  }
  throw new Error(`Missing env: ${names.join(' | ')}`);
}

// Prefer server-only SUPABASE_URL, but allow reuse of the Next public URL for convenience.
const SUPABASE_URL = mustEnv('SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = mustEnv('SUPABASE_SERVICE_ROLE_KEY');
const OWNER_ID = mustEnv('CENTRO_OWNER_ID');

const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function normalizeText(s) {
  return (s || '').toString().trim();
}

function inferAgentBucket(title, description) {
  const t = `${normalizeText(title)}\n${normalizeText(description)}`.toLowerCase();
  const has = (...words) => words.some(w => t.includes(w));
  if (has('skool', 'comunidad', 'curso', 'miembros', 'post', 'contenido')) return 'Skool';
  if (has('deploy', 'infra', 'servidor', 'gateway', 'cron', 'ssh', 'dns', 'docker', 'uptime', 'monitor')) return 'Ops';
  if (has('bug', 'error', 'fix', 'api', 'next', 'frontend', 'backend', 'supabase', 'sql', 'typescript', 'codigo', 'código')) return 'Dev';
  if (has('investigar', 'research', 'benchmark', 'comparar', 'alternativa', 'documentación', 'docs')) return 'Research';
  return 'Jarvis';
}

function needsNico(task) {
  const title = normalizeText(task.title);
  const desc = normalizeText(task.description);
  const tooVague = title.length < 8 || /^\W*(idea|ayuda|pendiente|hacer|tbd|todo)\W*$/i.test(title);
  const noDesc = desc.length === 0;
  return tooVague && noDesc;
}

function buildSubtasks(task) {
  const bucket = inferAgentBucket(task.title, task.description);

  // Base steps (kept generic but verifiable)
  const subtasks = [];

  subtasks.push({
    title: 'Aclarar alcance y criterios',
    definition_of_done:
      'Queda escrito en la tarea: objetivo, entradas necesarias, restricciones, y criterio de éxito verificable (qué se considera “hecho”).',
    bucket: 'Jarvis',
  });

  if (bucket === 'Research') {
    subtasks.push({
      title: 'Investigación rápida (3 fuentes)',
      definition_of_done:
        'Entrega un resumen de 10-15 líneas + 3 links relevantes + recomendación clara (qué hacer / qué no hacer) con pros y contras.',
      bucket: 'Research',
    });
  }

  if (bucket === 'Skool') {
    subtasks.push({
      title: 'Diseñar pieza / acción para Skool',
      definition_of_done:
        'Queda un borrador listo para publicar (texto final) + checklist de publicación (dónde, cuándo, CTA).',
      bucket: 'Skool',
    });
  }

  if (bucket === 'Dev') {
    subtasks.push({
      title: 'Implementación técnica',
      definition_of_done:
        'PR/commit listo o cambios aplicados: incluye qué se cambió, cómo probarlo y evidencia (captura/log) de que pasa.',
      bucket: 'Dev',
    });
  }

  if (bucket === 'Ops') {
    subtasks.push({
      title: 'Ejecución/operación',
      definition_of_done:
        'Cambio aplicado en entorno correspondiente + verificación (comando/screenshot/log) + rollback plan documentado.',
      bucket: 'Ops',
    });
  }

  // Always close with validation
  subtasks.push({
    title: 'Validación final',
    definition_of_done:
      'Checklist de verificación completado y nota final en la tarea confirmando que el objetivo se cumplió.',
    bucket: 'Jarvis',
  });

  // Cap at 7
  return subtasks.slice(0, 7);
}

async function getAgentRoster(ownerId) {
  const { data, error } = await sb
    .from('agents')
    .select('id,name,role,is_active')
    .eq('owner_id', ownerId)
    .eq('is_active', true);
  if (error) throw error;
  const map = new Map();
  for (const a of data || []) map.set((a.name || '').toLowerCase(), a);
  return map;
}

async function insertActivity({ owner_id, actor_type, actor_agent_id, action, entity_type, entity_id, data }) {
  const { error } = await sb.from('activity_log').insert({
    owner_id,
    actor_type,
    actor_agent_id,
    action,
    entity_type,
    entity_id,
    data: data || {},
  });
  if (error) throw error;
}

async function main() {
  const roster = await getAgentRoster(OWNER_ID);
  const jarvisAgent = roster.get('jarvis');
  const jarvisId = jarvisAgent?.id || null;

  const { data: tasks, error: tasksErr } = await sb
    .from('tasks')
    .select('id,title,description,status,created_at,owner_id')
    .eq('owner_id', OWNER_ID)
    .eq('status', 'inbox')
    .order('created_at', { ascending: true })
    .limit(20);

  if (tasksErr) throw tasksErr;

  const processed = [];

  for (const task of tasks || []) {
    // safety: only inbox
    if (task.status !== 'inbox') continue;

    // check existing subtasks
    const { data: existingSubs, error: subsErr } = await sb
      .from('subtasks')
      .select('id')
      .eq('owner_id', OWNER_ID)
      .eq('task_id', task.id)
      .limit(1);
    if (subsErr) throw subsErr;

    const alreadyHas = (existingSubs || []).length > 0;
    let createdCount = 0;
    let newStatus = 'triage';

    const needs = needsNico(task);
    if (needs) newStatus = 'needs_nico';

    // create subtasks only if none exist AND not needs_nico (missing critical data)
    if (!alreadyHas && !needs) {
      const plan = buildSubtasks(task);

      // pick agent ids
      const pickId = (bucket) => {
        const key = (bucket || '').toLowerCase();
        const a = roster.get(key);
        return a?.id || jarvisId || null;
      };

      const rows = plan.map((p, idx) => ({
        owner_id: OWNER_ID,
        task_id: task.id,
        title: p.title,
        status: 'in_progress',
        assignee_agent_id: pickId(p.bucket),
        definition_of_done: p.definition_of_done,
        sort_order: idx,
        metadata: { triage_bucket: p.bucket },
      }));

      const { error: insErr, data: insData } = await sb.from('subtasks').insert(rows).select('id');
      if (insErr) throw insErr;
      createdCount = insData?.length || rows.length;

      await insertActivity({
        owner_id: OWNER_ID,
        actor_type: 'agent',
        actor_agent_id: jarvisId,
        action: 'create_subtasks',
        entity_type: 'task',
        entity_id: task.id,
        data: { created: createdCount },
      });
    }

    // comment summary (always)
    const resumen = normalizeText(task.description)
      ? normalizeText(task.description).slice(0, 240)
      : 'Sin descripción (se requiere aclarar).';

    const pasos = needs
      ? ['Falta info crítica: describe objetivo + entregable esperado + contexto (links/ejemplos).']
      : [
          'Revisar subtasks y ejecutar en orden.',
          'Actualizar resultados en cada subtask.',
          'Cerrar con validación final.',
        ];

    const commentBody = [
      `Resumen: ${resumen}`,
      '',
      'Pasos:',
      ...pasos.map(p => `- ${p}`),
      '',
      'Links:',
      '- (vacío)',
      '',
      'Riesgos:',
      needs ? '- Bloqueo por falta de contexto.' : '- Estimación puede cambiar al descubrir dependencias.',
    ].join('\n');

    const { error: cErr } = await sb.from('comments').insert({
      owner_id: OWNER_ID,
      task_id: task.id,
      author_type: 'agent',
      author_agent_id: jarvisId,
      body: commentBody,
    });
    if (cErr) throw cErr;

    await insertActivity({
      owner_id: OWNER_ID,
      actor_type: 'agent',
      actor_agent_id: jarvisId,
      action: 'add_comment',
      entity_type: 'task',
      entity_id: task.id,
      data: { kind: 'triage_summary' },
    });

    // move status
    const { error: uErr } = await sb
      .from('tasks')
      .update({ status: newStatus })
      .eq('owner_id', OWNER_ID)
      .eq('id', task.id)
      .eq('status', 'inbox');
    if (uErr) throw uErr;

    await insertActivity({
      owner_id: OWNER_ID,
      actor_type: 'agent',
      actor_agent_id: jarvisId,
      action: 'move_status',
      entity_type: 'task',
      entity_id: task.id,
      data: { from: 'inbox', to: newStatus },
    });

    processed.push({ id: task.id, subtasks_created: createdCount, status: newStatus, skipped_existing: alreadyHas });
  }

  // Output summary
  if (processed.length === 0) {
    console.log('Procesado: 0 tasks (no había tasks en inbox).');
    return;
  }

  console.log(`Procesado: ${processed.length} tasks`);
  for (const p of processed) {
    const extra = p.skipped_existing ? ' (subtasks ya existían)' : '';
    console.log(`- ${p.id}: +${p.subtasks_created} subtasks, status=${p.status}${extra}`);
  }
}

main().catch((e) => {
  console.error('ERROR triage:', e?.message || e);
  process.exitCode = 1;
});
