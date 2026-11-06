-- After a card is scored, everyone who picked gets an email with how they did (the
-- results-email Edge Function, called by a database webhook on events). Players can turn it off
-- on their profile; results_email_notices makes sure nobody gets the same card twice, even when
-- a card is scored again after a correction. Private: only the Edge Function touches it.

alter table public.profiles
  add column notify_results boolean not null default true;

create table public.results_email_notices (
  event_id text not null references public.events (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  sent_at timestamptz not null default now(),
  primary key (event_id, user_id)
);
alter table public.results_email_notices enable row level security;
revoke all on public.results_email_notices from anon, authenticated;
