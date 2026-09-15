begin;

alter table ai_analyses
  add column surprise_pick_text text not null default '';

commit;
