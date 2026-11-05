-- Leagues: private groups of friends with their own leaderboard. Someone creates a league and
-- shares its invite link; whoever opens it (signed in) joins. Members see the league, each
-- other's names and standings, and, once a card has locked, each other's picks on it.
--
-- Leagues are invisible to everyone else: there is no list of leagues, only invite codes.
-- Creating, joining and leaving go through functions, so membership rules live in one place.

create table public.leagues (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 3 and 40),
  invite_code text not null unique default upper(substr(md5(gen_random_uuid()::text), 1, 8)),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.league_members (
  league_id uuid not null references public.leagues (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (league_id, user_id)
);
create index league_members_user on public.league_members (user_id);

alter table public.leagues enable row level security;
alter table public.league_members enable row level security;

-- Membership checks for the policies. Security definer, so a policy on league_members can ask
-- about league_members without recursing into itself.
create function public.is_league_member(league uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.league_members where league_id = league and user_id = auth.uid());
$$;

-- Whether the caller shares a league with ``other``.
create function public.shares_league_with(other uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.league_members mine
    join public.league_members theirs on theirs.league_id = mine.league_id
    where mine.user_id = auth.uid() and theirs.user_id = other
  );
$$;

create policy "members see their leagues" on public.leagues
  for select to authenticated using (public.is_league_member(id));
create policy "owners rename their leagues" on public.leagues
  for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "owners delete their leagues" on public.leagues
  for delete to authenticated using (owner_id = auth.uid());

create policy "members see who's in their leagues" on public.league_members
  for select to authenticated using (public.is_league_member(league_id));

-- League-mates see each other's picks, but only once the card has locked (no copying).
create policy "league-mates see picks after the lock" on public.picks
  for select to authenticated
  using (not public.bout_is_open(bout_id) and public.shares_league_with(user_id));

-- Create a league; the creator is its first member. Returns the new league's id.
create function public.create_league(league_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_id uuid;
begin
  if auth.uid() is null then
    raise exception 'sign in first' using errcode = '42501';
  end if;
  if (select count(*) from public.leagues where owner_id = auth.uid()) >= 10 then
    raise exception 'you can own up to 10 leagues' using errcode = '23514';
  end if;
  insert into public.leagues (name, owner_id) values (btrim(league_name), auth.uid()) returning id into new_id;
  insert into public.league_members (league_id, user_id) values (new_id, auth.uid());
  return new_id;
end;
$$;

-- Join a league by its invite code (any case). Returns the league's id; joining twice is fine.
create function public.join_league(code text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  league uuid;
begin
  if auth.uid() is null then
    raise exception 'sign in first' using errcode = '42501';
  end if;
  select id into league from public.leagues where invite_code = upper(btrim(code));
  if league is null then
    raise exception 'no league with that invite code' using errcode = 'P0002';
  end if;
  if (select count(*) from public.league_members where league_id = league) >= 100 then
    raise exception 'this league is full (100 members)' using errcode = '23514';
  end if;
  insert into public.league_members (league_id, user_id) values (league, auth.uid())
    on conflict do nothing;
  return league;
end;
$$;

-- Leave a league. When the owner leaves, the league goes with them.
create function public.leave_league(league uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.leagues where id = league and owner_id = auth.uid();
  delete from public.league_members where league_id = league and user_id = auth.uid();
end;
$$;

-- A league's standings: every member, with their points over all scored events (0 if none
-- yet). Only for members of that league.
create function public.league_standings(league uuid)
returns table (display_name text, points bigint, correct bigint, picked bigint, events bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select p.display_name,
         coalesce(sum(s.points), 0), coalesce(sum(s.correct), 0), coalesce(sum(s.picked), 0),
         count(s.event_id)
  from public.league_members m
  join public.profiles p on p.id = m.user_id
  left join public.scores s on s.user_id = m.user_id
  where m.league_id = league and public.is_league_member(league)
  group by p.display_name
  order by 2 desc, 3 desc, p.display_name;
$$;

revoke all on function public.create_league(text), public.join_league(text), public.leave_league(uuid),
  public.league_standings(uuid) from public, anon;
grant execute on function public.create_league(text), public.join_league(text), public.leave_league(uuid),
  public.league_standings(uuid) to authenticated;
