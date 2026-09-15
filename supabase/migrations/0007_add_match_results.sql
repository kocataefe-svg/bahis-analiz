begin;

create table if not exists match_results (
  match_id uuid primary key references matches(id) on delete cascade,
  home_score int not null,
  away_score int not null,
  checked_at timestamptz not null default now()
);

alter table match_results enable row level security;

commit;
