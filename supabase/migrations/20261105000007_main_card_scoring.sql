-- Only the main card scores: prelims are there to pick for fun (a full card is a lot of picks).
-- And league-mates can see who has already picked a bout, but not whom, before the lock.

create or replace function public.score_event(event text)
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
  where b.event_id = event and b.outcome = 'win' and b.segment = 'main'
  group by p.user_id;
  update public.events set scored_at = now() where id = event;
end;
$$;

revoke all on function public.score_event(text) from public, anon, authenticated;
grant execute on function public.score_event(text) to service_role;

-- Which of your league-mates have picked each bout of an event: names and avatars, never the
-- pick itself (that shows only after the lock, through the picks policy).
create function public.mates_who_picked(event text)
returns table (bout_id text, display_name text, avatar text)
language sql
stable
security definer
set search_path = ''
as $$
  select p.bout_id, pr.display_name, pr.avatar
  from public.picks p
  join public.bouts b on b.id = p.bout_id
  join public.profiles pr on pr.id = p.user_id
  where b.event_id = event and p.user_id <> auth.uid() and public.shares_league_with(p.user_id);
$$;

revoke all on function public.mates_who_picked(text) from public, anon;
grant execute on function public.mates_who_picked(text) to authenticated;
