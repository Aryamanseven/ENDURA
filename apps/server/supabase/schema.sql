-- ╔══════════════════════════════════════════════════════════╗
-- ║  ENDURA.RUN – Supabase Postgres Schema (start fresh)   ║
-- ║  Run this in: Supabase Dashboard → SQL Editor → New     ║
-- ╚══════════════════════════════════════════════════════════╝

-- Profiles (keyed by Clerk user_id string, e.g. "user_2x...")
create table if not exists public.profiles (
  user_id  text primary key,            -- Clerk userId
  username text not null default '',
  preferences jsonb not null default '{"units":"metric"}'::jsonb,
  profile_picture_path text,            -- Supabase Storage path
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Runs
create table if not exists public.runs (
  id              uuid primary key default gen_random_uuid(),
  user_id         text not null,
  title           text not null,
  date            timestamptz not null,
  distance_km     double precision not null,
  duration_seconds integer not null,
  avg_pace        double precision not null,
  elevation_gain  double precision not null,
  gpx_path        text,                  -- Supabase Storage path
  gpx_raw         text,
  route_coordinates jsonb,
  prediction      jsonb,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists runs_user_id_idx      on public.runs(user_id);
create index if not exists runs_user_date_idx    on public.runs(user_id, date desc);

-- Certificates
create table if not exists public.certificates (
  id                    uuid primary key default gen_random_uuid(),
  user_id               text not null,
  title                 text not null,
  distance_label        text not null,
  official_time_seconds integer not null,
  event_date            date not null,
  notes                 text not null default '',
  file_path             text,           -- Supabase Storage path
  file_name             text,
  file_mime             text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index if not exists certs_user_date_idx on public.certificates(user_id, event_date desc);

-- ────────────────────────────────────────────
-- Storage buckets (create manually in dashboard OR via SQL):
--   1) gpx-files    (public: false)
--   2) certificates (public: false)
--   3) avatars      (public: true – so profile pics can be shown)
--
-- In Supabase Dashboard → Storage → New Bucket:
--   Name: gpx-files      | Public: off
--   Name: certificates   | Public: off
--   Name: avatars         | Public: on
-- ────────────────────────────────────────────
