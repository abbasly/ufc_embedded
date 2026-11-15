-- A league's board for its latest card: each member's points on that card, and the model's (it
-- plays every card, so a league can see whether they beat it). The latest card is the most recent
-- one any member has points on (live as the results come in, final once scored). Members who
-- didn't play it are listed too, after the others, with played = false. Members only.

create function public.league_card_standings(league uuid)
returns table (
  event_id text, event_name text, starts_on date, scored boolean,
  display_name text, avatar text, points integer, correct integer, picked integer, played boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  with members as (
    select m.user_id from public.league_members m where m.league_id = league
  ),
  players as (
    select user_id from members
    union
    select p.id from public.profiles p where p.display_name = 'the_model'
  ),
  latest as (
    select e.id, e.name, e.starts_on, e.scored_at is not null as scored
    from public.events e
    where exists (select 1 from public.scores s join members m on m.user_id = s.user_id where s.event_id = e.id)
    order by e.starts_on desc, e.id desc
    limit 1
  )
  select l.id, l.name, l.starts_on, l.scored, p.display_name, p.avatar,
         coalesce(s.points, 0), coalesce(s.correct, 0)::integer, coalesce(s.picked, 0)::integer,
         s.user_id is not null
  from latest l
  cross join players pl
  join public.profiles p on p.id = pl.user_id
  left join public.scores s on s.user_id = pl.user_id and s.event_id = l.id
  where public.is_league_member(league)
  order by s.user_id is null, coalesce(s.points, 0) desc, coalesce(s.correct, 0) desc, p.display_name;
$$;
revoke all on function public.league_card_standings(uuid) from public, anon;
grant execute on function public.league_card_standings(uuid) to authenticated;
