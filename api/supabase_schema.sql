-- Schoonover Invitational schema for Supabase Postgres
-- Run in Supabase SQL Editor

create extension if not exists pgcrypto;

create table if not exists public.users (
  id text primary key,
  name text not null,
  email text not null,
  pin text not null,
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);

create unique index if not exists users_email_key on public.users (lower(email));
create unique index if not exists users_pin_key on public.users (pin);

create table if not exists public.tournaments (
  id text primary key,
  slot integer not null unique,
  name text not null default '',
  espn_event_id text not null default '',
  odds_sport_key text not null default '',
  start_date text not null default '',
  end_date text not null default '',
  deadline text not null default '',
  golfers jsonb not null default '[]'::jsonb,
  status text not null default 'setup',
  created_at timestamptz not null default now()
);

create table if not exists public.teams (
  id text primary key,
  user_id text not null,
  user_name text not null,
  user_email text not null,
  tournament_id text not null,
  team_number integer not null,
  golfers jsonb not null default '[]'::jsonb,
  total_cost bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  admin_modified boolean not null default false,
  constraint teams_user_tournament_team_unique unique (user_id, tournament_id, team_number)
);

create index if not exists teams_user_tournament_idx on public.teams (user_id, tournament_id);
create index if not exists teams_tournament_idx on public.teams (tournament_id);

create table if not exists public.score_cache (
  tournament_id text primary key,
  scores jsonb not null default '[]'::jsonb,
  last_updated text not null default ''
);

-- Enable RLS
alter table public.users enable row level security;
alter table public.tournaments enable row level security;
alter table public.teams enable row level security;
alter table public.score_cache enable row level security;

-- Open access policies so anon-key backend mode works immediately.
-- For stricter production security, switch backend to service_role key and tighten policies later.
grant all on table public.users to anon, authenticated;
grant all on table public.tournaments to anon, authenticated;
grant all on table public.teams to anon, authenticated;
grant all on table public.score_cache to anon, authenticated;

drop policy if exists users_no_direct_access on public.users;
drop policy if exists tournaments_no_direct_access on public.tournaments;
drop policy if exists teams_no_direct_access on public.teams;
drop policy if exists score_cache_no_direct_access on public.score_cache;

drop policy if exists users_open_access on public.users;
create policy users_open_access on public.users
for all to anon, authenticated
using (true)
with check (true);

drop policy if exists tournaments_open_access on public.tournaments;
create policy tournaments_open_access on public.tournaments
for all to anon, authenticated
using (true)
with check (true);

drop policy if exists teams_open_access on public.teams;
create policy teams_open_access on public.teams
for all to anon, authenticated
using (true)
with check (true);

drop policy if exists score_cache_open_access on public.score_cache;
create policy score_cache_open_access on public.score_cache
for all to anon, authenticated
using (true)
with check (true);
