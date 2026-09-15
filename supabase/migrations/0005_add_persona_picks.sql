begin;

alter table ai_analyses
  add column team_analyst_pick jsonb,
  add column commentator_pick jsonb,
  add column betting_analyst_pick jsonb,
  add column surprise_combo_pick jsonb;

commit;
