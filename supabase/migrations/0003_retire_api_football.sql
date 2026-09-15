begin;

-- API-Football tamamen kaldirildi (ucretsiz plan guncel sezona erisemiyor).
-- Fikstur artik The Odds API'nin event id'siyle geliyor, mac esleme yok.
-- Onceki senkronlar hep 0 mac uretti, bu yuzden matches tablosu guvenle
-- bosaltilabilir (cascade ile bagli odds_snapshots/ai_analyses/manual_odds/
-- team_stats_snapshots satirlari da temizlenir).
truncate table matches cascade;

delete from leagues where name = 'TFF 1. Lig';

alter table leagues
  drop column api_football_id,
  drop column current_season;

alter table leagues
  add constraint leagues_name_key unique (name);

alter table matches
  drop column api_football_fixture_id,
  drop column home_team_api_id,
  drop column away_team_api_id,
  add column odds_api_event_id text not null unique;

drop table if exists team_stats_snapshots;

create table if not exists match_research (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null unique references matches(id) on delete cascade,
  content text not null,
  sources jsonb not null default '[]'::jsonb,
  model_used text not null,
  generated_at timestamptz not null default now()
);

create index if not exists match_research_match_id_idx on match_research(match_id);

alter table match_research enable row level security;

commit;
