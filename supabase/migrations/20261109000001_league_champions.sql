-- League champions: whoever tops a league on a finished card wins that card's title (ties share
-- it). It takes at least two members playing the card, and more than 0 points. Worked out from
-- the scores, so there's nothing new to store, and current members count for past cards too.
--
-- league_champions() is for the league's own members. league_titles() is for profiles, which are
-- public: anyone can see that a player won a title, but leagues stay private, so the league's
-- name only comes back to its members.

create function public.league_champions(league uuid)
returns table (event_id text, event_name text, starts_on date, display_name text, avatar text, points integer)
language sql
stable
security definer
set search_path = ''
as $$
  with played as (
    select s.event_id, s.user_id, s.points,
           rank() over (partition by s.event_id order by s.points desc) as place,
           count(*) over (partition by s.event_id) as players
    from public.scores s
    join public.league_members m on m.user_id = s.user_id
    where m.league_id = league_champions.league and public.is_league_member(league_champions.league)
  )
  select e.id, e.name, e.starts_on, p.display_name, p.avatar, w.points
  from played w
  join public.events e on e.id = w.event_id and e.scored_at is not null
  join public.profiles p on p.id = w.user_id
  where w.place = 1 and w.players >= 2 and w.points > 0
  order by e.starts_on desc, p.display_name;
$$;

create function public.league_titles(player uuid)
returns table (event_id text, event_name text, starts_on date, points integer, league_name text)
language sql
stable
security definer
set search_path = ''
as $$
  select e.id, e.name, e.starts_on, s.points,
         case when public.is_league_member(l.id) then l.name end
  from public.league_members m
  join public.leagues l on l.id = m.league_id
  join public.scores s on s.user_id = m.user_id
  join public.events e on e.id = s.event_id and e.scored_at is not null
  where m.user_id = league_titles.player
    and s.points > 0
    and exists (
      select 1 from public.league_members other
      join public.scores theirs on theirs.user_id = other.user_id and theirs.event_id = s.event_id
      where other.league_id = m.league_id and other.user_id <> m.user_id
    )
    and not exists (
      select 1 from public.league_members other
      join public.scores theirs on theirs.user_id = other.user_id and theirs.event_id = s.event_id
      where other.league_id = m.league_id and theirs.points > s.points
    )
  order by e.starts_on desc, l.created_at;
$$;

revoke all on function public.league_champions(uuid), public.league_titles(uuid) from public, anon;
grant execute on function public.league_champions(uuid) to authenticated;
grant execute on function public.league_titles(uuid) to anon, authenticated;
