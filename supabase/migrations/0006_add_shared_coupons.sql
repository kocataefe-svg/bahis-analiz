begin;

create table if not exists shared_coupons (
  id uuid primary key default gen_random_uuid(),
  user_name text not null,
  picks jsonb not null,
  total_odds numeric not null,
  created_at timestamptz not null default now()
);

create index if not exists shared_coupons_created_at_idx on shared_coupons(created_at desc);

alter table shared_coupons enable row level security;

commit;
