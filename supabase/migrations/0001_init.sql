begin;

create extension if not exists pgcrypto;

create table if not exists leagues (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  country text not null,
  api_football_id integer not null unique,
  odds_api_sport_key text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists matches (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references leagues(id) on delete cascade,
  api_football_fixture_id integer not null unique,
  home_team text not null,
  away_team text not null,
  kickoff_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists matches_league_id_idx on matches(league_id);
create index if not exists matches_kickoff_at_idx on matches(kickoff_at);

create table if not exists team_stats_snapshots (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references matches(id) on delete cascade,
  team text not null check (team in ('home', 'away')),
  form text,
  injuries jsonb not null default '[]'::jsonb,
  cards jsonb not null default '[]'::jsonb,
  last_matches jsonb not null default '[]'::jsonb,
  stats jsonb not null default '{}'::jsonb,
  fetched_at timestamptz not null default now()
);

create index if not exists team_stats_snapshots_match_id_idx on team_stats_snapshots(match_id);
create index if not exists team_stats_snapshots_match_fetched_idx on team_stats_snapshots(match_id, fetched_at desc);

create table if not exists odds_snapshots (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references matches(id) on delete cascade,
  market text not null,
  outcome text not null,
  bookmaker text not null,
  price numeric not null,
  fetched_at timestamptz not null default now()
);

create index if not exists odds_snapshots_match_id_idx on odds_snapshots(match_id);
create index if not exists odds_snapshots_fetched_at_idx on odds_snapshots(fetched_at);
create index if not exists odds_snapshots_match_fetched_idx on odds_snapshots(match_id, fetched_at desc);

create table if not exists ai_analyses (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references matches(id) on delete cascade,
  team_analyst_text text not null,
  betting_analyst_text text not null,
  commentator_text text not null,
  summary_text text not null,
  model_used text not null,
  generated_at timestamptz not null default now()
);

create index if not exists ai_analyses_match_id_idx on ai_analyses(match_id);
create index if not exists ai_analyses_match_generated_idx on ai_analyses(match_id, generated_at desc);

create table if not exists manual_odds (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references matches(id) on delete cascade,
  entered_by text not null,
  market text not null,
  outcome text not null,
  price numeric not null,
  entered_at timestamptz not null default now()
);

create index if not exists manual_odds_match_id_idx on manual_odds(match_id);

alter table leagues enable row level security;
alter table matches enable row level security;
alter table team_stats_snapshots enable row level security;
alter table odds_snapshots enable row level security;
alter table ai_analyses enable row level security;
alter table manual_odds enable row level security;

commit;
