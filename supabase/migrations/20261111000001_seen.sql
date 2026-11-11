-- What a player has already been shown: the cards they've opened ('card:<fighter>' or
-- 'card:<fighter>:shiny') and the badges they've been told about ('badge:<key>'). Kept with the
-- account, so a new browser or cleared site data doesn't show them all again. Private to the player.

create table public.seen (
  user_id uuid not null references public.profiles (id) on delete cascade,
  item text not null check (char_length(item) between 1 and 120),
  seen_at timestamptz not null default now(),
  primary key (user_id, item)
);

alter table public.seen enable row level security;
revoke all on public.seen from anon, authenticated;
grant select, insert on public.seen to authenticated;

create policy "players see what they've seen" on public.seen
  for select to authenticated using (user_id = auth.uid());
create policy "players mark things seen" on public.seen
  for insert to authenticated with check (user_id = auth.uid());
