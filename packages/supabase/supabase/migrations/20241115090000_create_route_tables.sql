create extension if not exists "pgcrypto";
create extension if not exists postgis;

create table if not exists public.routes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  origin_id text not null,
  origin_label text,
  origin_lat double precision not null,
  origin_lng double precision not null,
  destination_count integer not null check (destination_count >= 0),
  total_distance_m integer not null check (total_distance_m >= 0),
  total_duration_s integer not null check (total_duration_s >= 0),
  algorithm text not null check (algorithm in ('optimizer', 'nearest_neighbor')),
  params_digest text not null,
  params_snapshot jsonb not null,
  diagnostics jsonb not null,
  distance_cache_hit_count integer not null default 0,
  distance_cache_miss_count integer not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  start_location geography(Point, 4326) generated always as (
    ST_SetSRID(ST_MakePoint(origin_lng, origin_lat), 4326)
  ) stored
);

comment on column public.routes.params_digest is 'Deterministic hash of origin/destination/options payload';

create table if not exists public.route_stops (
  id uuid primary key default gen_random_uuid(),
  route_id uuid not null references public.routes (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  stop_id text not null,
  label text,
  lat double precision not null,
  lng double precision not null,
  sequence integer not null check (sequence >= 0),
  distance_from_previous_m integer not null default 0,
  duration_from_previous_s integer not null default 0,
  cumulative_distance_m integer not null default 0,
  cumulative_duration_s integer not null default 0,
  raw_input jsonb not null,
  created_at timestamptz not null default timezone('utc', now()),
  location geography(Point, 4326) generated always as (
    ST_SetSRID(ST_MakePoint(lng, lat), 4326)
  ) stored
);

create index if not exists routes_user_created_idx on public.routes (user_id, created_at desc);
create index if not exists routes_params_digest_idx on public.routes (user_id, params_digest);
create index if not exists route_stops_route_sequence_idx on public.route_stops (route_id, sequence);

alter table public.routes enable row level security;
alter table public.route_stops enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'routes'
      and policyname = 'routes_select_own'
  ) then
    execute 'create policy routes_select_own on public.routes for select using (auth.uid() = user_id)';
  end if;
end;
$$ language plpgsql;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'routes'
      and policyname = 'routes_insert_own'
  ) then
    execute 'create policy routes_insert_own on public.routes for insert with check (auth.uid() = user_id)';
  end if;
end;
$$ language plpgsql;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'route_stops'
      and policyname = 'route_stops_select_own'
  ) then
    execute 'create policy route_stops_select_own on public.route_stops for select using (auth.uid() = user_id)';
  end if;
end;
$$ language plpgsql;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'route_stops'
      and policyname = 'route_stops_insert_own'
  ) then
    execute 'create policy route_stops_insert_own on public.route_stops for insert with check (auth.uid() = user_id)';
  end if;
end;
$$ language plpgsql;

create or replace function public.set_updated_at() returns trigger as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$ language plpgsql;

drop trigger if exists routes_set_updated_at on public.routes;

create trigger routes_set_updated_at
  before update on public.routes
  for each row
  execute function public.set_updated_at();
