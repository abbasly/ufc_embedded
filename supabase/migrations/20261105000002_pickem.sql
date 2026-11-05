-- Pick'em: fans pick winners on upcoming UFC cards, scored after each event.
--
-- Who writes what:
--   events, bouts  the data pipeline, with the service-role key (bypasses RLS); everyone reads
--   picks          each user, only their own, only until the event locks
--   scores         the scoring job (service role) after each event; everyone reads (leaderboard)

create table public.events (
  id text primary key,                 -- e.g. '2026-11-14-ufc-334'
  name text not null,                  -- 'UFC 334: Gane vs. Hokit'
  starts_on date not null,
  locks_at timestamptz not null,       -- picks close here (the first fight's start)
  scored_at timestamptz                -- set once results are in and picks are scored
);

create table public.bouts (
  id text primary key,                 -- '<event id>:<fighter a>:<fighter b>'
  event_id text not null references public.events (id) on delete cascade,
  position smallint not null,          -- running order, main event first
  fighter_a text not null,             -- public fighter ids, as on the site
  fighter_b text not null,
  a_name text not null,
  b_name text not null,
  model_p_a real,                      -- our model's P(A wins), shown next to the pick
  market_p_a real,                     -- bookmakers' P(A wins)
  winner text check (winner is null or winner in (fighter_a, fighter_b)),
  method text check (method is null or method in ('KO/TKO', 'SUB', 'DEC')),
  unique (event_id, position)
);

create table public.picks (
  user_id uuid not null references public.profiles (id) on delete cascade,
  bout_id text not null references public.bouts (id) on delete cascade,
  winner text not null,                -- the picked fighter's id
  method text check (method is null or method in ('KO/TKO', 'SUB', 'DEC')),
  updated_at timestamptz not null default now(),
  primary key (user_id, bout_id)
);

create table public.scores (
  user_id uuid not null references public.profiles (id) on delete cascade,
  event_id text not null references public.events (id) on delete cascade,
  correct smallint not null check (correct >= 0),
  picked smallint not null check (picked >= correct),
  points integer not null default 0,   -- winners plus a bonus for the right method
  primary key (user_id, event_id)
);

create index picks_bout on public.picks (bout_id);
create index bouts_event on public.bouts (event_id);
create index scores_event on public.scores (event_id);

alter table public.events enable row level security;
alter table public.bouts enable row level security;
alter table public.picks enable row level security;
alter table public.scores enable row level security;

create policy "events are public" on public.events for select using (true);
create policy "bouts are public" on public.bouts for select using (true);
create policy "scores are public" on public.scores for select using (true);

-- Whether a bout's event still takes picks. Security definer so the policies below can read
-- the event without granting anything else.
create function public.bout_is_open(bout text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select now() < e.locks_at
  from public.bouts b join public.events e on e.id = b.event_id
  where b.id = bout;
$$;

-- A user sees only their own picks (everyone else's are private, even after the event; the
-- leaderboard shows totals only). Changes are allowed until the event locks, and a pick must
-- name one of the bout's two fighters. (Columns are qualified with "picks.": bouts has a
-- winner column too, the result, which an unqualified name would silently refer to.)
create policy "users read their own picks" on public.picks
  for select to authenticated using (user_id = auth.uid());
create policy "users pick before the lock" on public.picks
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and public.bout_is_open(bout_id)
    and exists (select 1 from public.bouts b where b.id = picks.bout_id and picks.winner in (b.fighter_a, b.fighter_b))
  );
create policy "users change picks before the lock" on public.picks
  for update to authenticated
  using (user_id = auth.uid() and public.bout_is_open(bout_id))
  with check (
    user_id = auth.uid()
    and public.bout_is_open(bout_id)
    and exists (select 1 from public.bouts b where b.id = picks.bout_id and picks.winner in (b.fighter_a, b.fighter_b))
  );
create policy "users drop picks before the lock" on public.picks
  for delete to authenticated using (user_id = auth.uid() and public.bout_is_open(bout_id));

-- Keep updated_at honest whatever the client sends.
create function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
create trigger picks_touch before insert or update on public.picks
  for each row execute function public.touch_updated_at();

-- The leaderboard: total points per user over all scored events, with display names.
-- security_invoker: it runs with the reader's rights, so the tables' policies still apply.
create view public.leaderboard with (security_invoker = true) as
  select p.display_name, sum(s.points) as points, sum(s.correct) as correct, sum(s.picked) as picked,
         count(*) as events
  from public.scores s join public.profiles p on p.id = s.user_id
  group by p.display_name;
