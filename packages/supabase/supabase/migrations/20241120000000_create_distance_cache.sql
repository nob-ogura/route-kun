-- Distance Cache table for Google Distance Matrix API results
-- Design: docs/DistanceCacheDesign.md

create table if not exists public.distance_cache (
  key text primary key,
  origin_lat double precision not null,
  origin_lng double precision not null,
  destination_lat double precision not null,
  destination_lng double precision not null,
  mode text not null check (mode in ('driving', 'walking', 'bicycling', 'transit')),
  time_bucket timestamptz not null,
  distance_m integer not null check (distance_m >= 0),
  duration_s integer not null check (duration_s >= 0),
  provider text not null default 'google_distance_matrix',
  status text not null default 'fresh' check (status in ('fresh', 'expired', 'error')),
  requested_at timestamptz not null default timezone('utc', now()),
  expires_at timestamptz not null,
  request_fingerprint text not null,
  metadata jsonb not null default '{}'::jsonb,
  hit_count integer not null default 0 check (hit_count >= 0),
  last_hit_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

comment on table public.distance_cache is 'Caches distance/duration results from Google Distance Matrix API';
comment on column public.distance_cache.key is 'SHA256 hash of normalized origin/destination/mode/time_bucket/options';
comment on column public.distance_cache.time_bucket is 'Departure time rounded to 5-minute buckets';
comment on column public.distance_cache.request_fingerprint is 'Hash of API request parameters (trafficModel, unitSystem, etc.)';
comment on column public.distance_cache.metadata is 'Debug info: API response excerpt, error details, etc.';
comment on column public.distance_cache.hit_count is 'Number of cache hits (auto-incremented on read)';

-- Indexes for efficient queries
create index if not exists distance_cache_expires_at_idx on public.distance_cache (expires_at);
create index if not exists distance_cache_status_idx on public.distance_cache (status);
create index if not exists distance_cache_provider_idx on public.distance_cache (provider);

-- Partial index for background refresh jobs (future use)
create index if not exists distance_cache_expired_idx on public.distance_cache (expires_at, requested_at) 
  where status = 'expired';

-- RLS: service_role only (no user access)
alter table public.distance_cache enable row level security;

-- Deny all operations for anon and authenticated users
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'distance_cache'
      and policyname = 'distance_cache_service_only'
  ) then
    execute 'create policy distance_cache_service_only on public.distance_cache for all using (false)';
  end if;
end;
$$ language plpgsql;

-- Trigger to auto-update updated_at
drop trigger if exists distance_cache_set_updated_at on public.distance_cache;

create trigger distance_cache_set_updated_at
  before update on public.distance_cache
  for each row
  execute function public.set_updated_at();

-- Function to increment hit_count atomically
create or replace function public.increment_distance_cache_hit(cache_key text) returns void as $$
begin
  update public.distance_cache
  set
    hit_count = hit_count + 1,
    last_hit_at = timezone('utc', now())
  where key = cache_key;
end;
$$ language plpgsql security definer;

comment on function public.increment_distance_cache_hit is 'Atomically increment hit_count for a cache entry';

