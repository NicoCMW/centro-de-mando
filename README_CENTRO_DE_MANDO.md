# Centro de Mando (v1)

Next.js + Supabase Mission Control style task board.

## Local dev
1. Copy env:
   - `cp .env.example .env.local`
2. Fill Supabase keys.
3. Run:
   - `npm run dev`

## Automation scripts
### Jarvis triage cron (inbox → triage)
Creates a lightweight “triage pass” over `tasks.status=inbox`:
- Adds a short triage comment
- If the task has enough info and no subtasks yet: creates 3–5 subtasks (with DoD)
- Moves task status to `triage` (or `needs_nico` when the task is too vague)
- Writes activity entries in `activity_log`

Run:
```bash
# required env vars
export SUPABASE_URL="..."
export SUPABASE_SERVICE_ROLE_KEY="..."
export CENTRO_OWNER_ID="..."  # owner_id in your schema

npm run triage:jarvis
```

Notes:
- Uses Service Role key (server-only). Never run this in the browser.
- Safe-guards: only touches tasks where `status=inbox` and `owner_id=CENTRO_OWNER_ID`.

## Pages (planned)
- `/board`
- `/task/[id]`
- `/agents`
- `/standups`
- `/settings`
