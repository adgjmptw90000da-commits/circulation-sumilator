create extension if not exists pgcrypto;

create table if not exists public.presets (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  params jsonb not null,
  display jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.presets
  add column if not exists display jsonb;

create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists set_presets_updated_at on public.presets;
create trigger set_presets_updated_at
before update on public.presets
for each row execute function public.set_updated_at();

alter table public.presets enable row level security;

drop policy if exists presets_read on public.presets;
create policy presets_read on public.presets
for select using (true);
