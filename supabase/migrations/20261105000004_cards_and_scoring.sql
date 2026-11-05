-- Fight cards as the UFC bills them, results, profile pictures and scoring.
--
-- Bouts get their card segment (main card, prelims, early prelims), whether they're title
-- fights, and an outcome once fought (a win, a draw or a no contest). Profiles get an avatar:
-- a fighter of the user's choosing, shown with that fighter's photo (no uploads to moderate).
-- score_event() turns an event's results into points for everyone who picked.

alter table public.bouts
  add column segment text not null default 'main' check (segment in ('main', 'prelims', 'early')),
  add column title boolean not null default false,
  add column outcome text check (outcome in ('win', 'draw', 'nc')),
  add constraint bouts_result_consistent check (
    (outcome is null and winner is null and method is null)
    or (outcome = 'win' and winner is not null)
    or (outcome in ('draw', 'nc') and winner is null and method is null)
  );

alter table public.profiles
  add column avatar text check (avatar ~ '^[a-z0-9-]{1,80}$'); -- a fighter's public id

-- Score an event from its results (run by the pipeline, or by hand in the SQL editor once the
-- results are in; safe to run again). For each user with picks on it:
--   10 points for the right winner,
--   +5 if the method was right too (KO/TKO, submission or decision),
--   +5 if the winner was the bookmakers' underdog.
-- Draws and no contests don't count either way.
create function public.score_event(event text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.scores where event_id = event;
  insert into public.scores (user_id, event_id, correct, picked, points)
  select p.user_id, event,
         count(*) filter (where p.winner = b.winner),
         count(*),
         coalesce(sum(
           case when p.winner = b.winner then
             10
             + case when p.method is not null and p.method = b.method then 5 else 0 end
             + case when (case when p.winner = b.fighter_a then b.market_p_a else 1 - b.market_p_a end) < 0.5
                    then 5 else 0 end
           else 0 end
         ), 0)
  from public.picks p
  join public.bouts b on b.id = p.bout_id
  where b.event_id = event and b.outcome = 'win'
  group by p.user_id;
  update public.events set scored_at = now() where id = event;
end;
$$;

revoke all on function public.score_event(text) from public, anon, authenticated;
grant execute on function public.score_event(text) to service_role;

-- The leaderboards, now with each player's avatar.
create or replace view public.leaderboard with (security_invoker = true) as
  select p.display_name, sum(s.points) as points, sum(s.correct) as correct, sum(s.picked) as picked,
         count(*) as events, p.avatar
  from public.scores s join public.profiles p on p.id = s.user_id
  group by p.id, p.display_name, p.avatar;

drop function public.league_standings(uuid);
create function public.league_standings(league uuid)
returns table (display_name text, points bigint, correct bigint, picked bigint, events bigint, avatar text)
language sql
stable
security definer
set search_path = ''
as $$
  select p.display_name,
         coalesce(sum(s.points), 0), coalesce(sum(s.correct), 0), coalesce(sum(s.picked), 0),
         count(s.event_id), p.avatar
  from public.league_members m
  join public.profiles p on p.id = m.user_id
  left join public.scores s on s.user_id = m.user_id
  where m.league_id = league and public.is_league_member(league)
  group by p.id, p.display_name, p.avatar
  order by 2 desc, 3 desc, p.display_name;
$$;
revoke all on function public.league_standings(uuid) from public, anon;
grant execute on function public.league_standings(uuid) to authenticated;
