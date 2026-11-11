-- Packs get harder to earn. The pack for playing now needs the whole main card picked (scores
-- count picks on decided fights, so a draw or no contest doesn't get in the way).
--
-- And the league bonus only counts a real contest: at least 3 members played the card, and only
-- people who were in the league before it locked count. Otherwise anyone could start a league
-- after the results, invite someone they beat, and collect a pack. (League titles on profiles
-- still follow the looser rule: they're only for show.)

create or replace function public.claim_packs()
returns table (id uuid, event_id text, event_name text, reason text)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  me uuid := auth.uid();
begin
  if me is null then
    raise exception 'sign in first' using errcode = '42501';
  end if;

  insert into public.packs (user_id, event_id, reason)
  select me, s.event_id, 'played'
  from public.scores s
  join public.events e on e.id = s.event_id and e.scored_at is not null
  where s.user_id = me
    and s.picked > 0
    and s.picked >= (
      select count(*) from public.bouts b
      where b.event_id = s.event_id and b.segment = 'main' and b.outcome = 'win'
    )
  on conflict (user_id, event_id, reason) do nothing;

  insert into public.packs (user_id, event_id, reason)
  select me, r.event_id, 'podium'
  from (
    select s.event_id, s.user_id, s.points,
           rank() over (partition by s.event_id order by s.points desc) as place
    from public.scores s
    join public.events e on e.id = s.event_id and e.scored_at is not null
  ) r
  where r.user_id = me and r.place <= 3 and r.points > 0
  on conflict (user_id, event_id, reason) do nothing;

  -- One bonus per card, however many leagues were won on it.
  insert into public.packs (user_id, event_id, reason)
  select distinct me, s.event_id, 'league'
  from public.league_members mine
  join public.scores s on s.user_id = me
  join public.events e on e.id = s.event_id and e.scored_at is not null
  where mine.user_id = me
    and s.points > 0
    and mine.joined_at < e.locks_at
    and (
      select count(*)
      from public.league_members other
      join public.scores theirs on theirs.user_id = other.user_id and theirs.event_id = s.event_id
      where other.league_id = mine.league_id and other.joined_at < e.locks_at
    ) >= 3
    and not exists (
      select 1
      from public.league_members other
      join public.scores theirs on theirs.user_id = other.user_id and theirs.event_id = s.event_id
      where other.league_id = mine.league_id and other.joined_at < e.locks_at and theirs.points > s.points
    )
  on conflict (user_id, event_id, reason) do nothing;

  return query
    select p.id, p.event_id, coalesce(e.name, 'A past card'), p.reason
    from public.packs p
    left join public.events e on e.id = p.event_id
    where p.user_id = me and p.opened_at is null
    order by p.created_at, p.reason;
end;
$$;
