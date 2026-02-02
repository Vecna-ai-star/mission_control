-- Mission Control minimal schema
create table if not exists public.boards (
  id uuid primary key,
  name text not null default 'Mission Control',
  state jsonb not null,
  updated_at timestamptz not null default now()
);
