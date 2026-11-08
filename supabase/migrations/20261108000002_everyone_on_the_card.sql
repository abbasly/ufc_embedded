-- Everyone with a main-card pick is on the card, from the first result: with 0 points until one
-- of their fights is decided, rather than missing from the standings. (Before, a player, or the
-- model, whose fights hadn't been decided yet had no score at all, so "vs the model" showed "no
-- card in common" while both had picks on it.)
--
-- Same rules as before: main card only, points and "right" only for decided fights (a win),
-- "picked" counts the decided fights you picked.

create or replace function public.tally_event(event text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.scores where event_id = event;
  insert into public.scores (user_id, event_id, correct, picked, points)
  select p.user_id, event,
         count(*) filter (where b.outcome = 'win' and p.winner = b.winner),
         count(*) filter (where b.outcome = 'win'),
         coalesce(sum(
           case when b.outcome = 'win' and p.winner = b.winner then
             10
             + case when p.method is not null and p.method = b.method then 5 else 0 end
             + case when (case when p.winner = b.fighter_a then b.market_p_a else 1 - b.market_p_a end) < 0.5
                    then 5 else 0 end
           else 0 end
         ), 0)
  from public.picks p
  join public.bouts b on b.id = p.bout_id
  where b.event_id = event and b.segment = 'main'
  group by p.user_id;
end;
$$;
