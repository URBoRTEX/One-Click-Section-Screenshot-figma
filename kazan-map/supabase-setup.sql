-- Kazan trip map: public journal, media, walk tracks and daily health.
-- Run this file once in Supabase Dashboard -> SQL Editor.

create extension if not exists pgcrypto;

create or replace function public.is_urbortex()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select lower(coalesce(
    auth.jwt() -> 'user_metadata' ->> 'user_name',
    auth.jwt() -> 'user_metadata' ->> 'preferred_username',
    auth.jwt() -> 'user_metadata' ->> 'user_login',
    ''
  )) = 'urbortex';
$$;

grant execute on function public.is_urbortex() to anon, authenticated;

create table if not exists public.place_journal (
  place_id text primary key,
  status text not null default '' check (status in ('', 'near', 'done')),
  comment text not null default '',
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);

create table if not exists public.place_media (
  id uuid primary key default gen_random_uuid(),
  place_id text not null references public.place_journal(place_id) on delete cascade,
  storage_path text not null unique,
  media_type text not null check (media_type in ('image', 'video')),
  mime_type text,
  original_name text,
  size_bytes bigint,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id)
);

create index if not exists place_media_place_id_idx
  on public.place_media(place_id, created_at);

create table if not exists public.walk_tracks (
  id uuid primary key default gen_random_uuid(),
  day_key text not null,
  started_at timestamptz not null,
  ended_at timestamptz not null,
  distance_m double precision not null default 0,
  duration_s integer not null default 0,
  points jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id)
);

create index if not exists walk_tracks_day_key_idx
  on public.walk_tracks(day_key, started_at);

create table if not exists public.daily_health (
  day_key text primary key,
  steps integer check (steps is null or steps >= 0),
  source text not null default 'manual',
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);

alter table public.place_journal enable row level security;
alter table public.place_media enable row level security;
alter table public.walk_tracks enable row level security;
alter table public.daily_health enable row level security;

drop policy if exists "Public reads place journal" on public.place_journal;
create policy "Public reads place journal"
on public.place_journal for select
to anon, authenticated
using (true);

drop policy if exists "URBoRTEX writes place journal" on public.place_journal;
create policy "URBoRTEX writes place journal"
on public.place_journal for all
to authenticated
using (public.is_urbortex())
with check (public.is_urbortex());

drop policy if exists "Public reads place media" on public.place_media;
create policy "Public reads place media"
on public.place_media for select
to anon, authenticated
using (true);

drop policy if exists "URBoRTEX writes place media" on public.place_media;
create policy "URBoRTEX writes place media"
on public.place_media for all
to authenticated
using (public.is_urbortex())
with check (public.is_urbortex());

drop policy if exists "Public reads walk tracks" on public.walk_tracks;
create policy "Public reads walk tracks"
on public.walk_tracks for select
to anon, authenticated
using (true);

drop policy if exists "URBoRTEX writes walk tracks" on public.walk_tracks;
create policy "URBoRTEX writes walk tracks"
on public.walk_tracks for all
to authenticated
using (public.is_urbortex())
with check (public.is_urbortex());

drop policy if exists "Public reads daily health" on public.daily_health;
create policy "Public reads daily health"
on public.daily_health for select
to anon, authenticated
using (true);

drop policy if exists "URBoRTEX writes daily health" on public.daily_health;
create policy "URBoRTEX writes daily health"
on public.daily_health for all
to authenticated
using (public.is_urbortex())
with check (public.is_urbortex());

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'kazan-trip-media',
  'kazan-trip-media',
  true,
  125829120,
  array['image/jpeg','image/png','image/webp','image/heic','image/heif','video/mp4','video/quicktime','video/webm']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "URBoRTEX uploads trip media" on storage.objects;
create policy "URBoRTEX uploads trip media"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'kazan-trip-media'
  and public.is_urbortex()
);

drop policy if exists "URBoRTEX updates trip media" on storage.objects;
create policy "URBoRTEX updates trip media"
on storage.objects for update
to authenticated
using (
  bucket_id = 'kazan-trip-media'
  and public.is_urbortex()
)
with check (
  bucket_id = 'kazan-trip-media'
  and public.is_urbortex()
);

drop policy if exists "URBoRTEX deletes trip media" on storage.objects;
create policy "URBoRTEX deletes trip media"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'kazan-trip-media'
  and public.is_urbortex()
);

-- The bucket is public, so direct public URLs can be viewed by anyone.
