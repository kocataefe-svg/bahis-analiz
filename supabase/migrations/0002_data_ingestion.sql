begin;

alter table leagues add column if not exists current_season integer;
alter table matches add column if not exists home_team_api_id integer;
alter table matches add column if not exists away_team_api_id integer;

commit;
