-- Mosselkapitein — cloud-save backend (Supabase)
-- Plak dit hele blok in Supabase → SQL Editor → Run.
-- Het maakt één tabel + twee functies. Saves zijn alleen bereikbaar mét een code
-- (de functies draaien als eigenaar, dus niemand kan alle saves opsommen).

create table if not exists public.saves (
  code       text primary key,
  data       jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.saves enable row level security;
-- geen directe tabel-toegang voor 'anon' — alles loopt via de functies hieronder

create or replace function public.put_save(p_code text, p_data jsonb)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.saves(code, data, updated_at)
  values (p_code, p_data, now())
  on conflict (code) do update set data = excluded.data, updated_at = now();
$$;

create or replace function public.get_save(p_code text)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select data from public.saves where code = p_code;
$$;

grant execute on function public.put_save(text, jsonb) to anon;
grant execute on function public.get_save(text)         to anon;
