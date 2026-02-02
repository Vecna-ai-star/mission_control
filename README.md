# Mission Control

Lightweight Kanban with:
- localStorage cache
- Supabase persistence via Vercel serverless functions (`/api/board`)

## Supabase schema
Run `sql/schema.sql` in your Mission Control Supabase project.

## Vercel env vars
Set in Vercel Project Settings → Environment Variables:
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `MISSION_CONTROL_BOARD_ID` (uuid row id)
- `VITE_MISSION_CONTROL_BOARD_ID` (same uuid, exposed to client)

## Local dev

```bash
npm i
npm run dev
```

Note: without `VITE_MISSION_CONTROL_BOARD_ID`, the app will work locally using localStorage only.
