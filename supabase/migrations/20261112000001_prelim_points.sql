-- Prelims score too: 1 point for each right winner on the prelims or early prelims (no method or
-- underdog bonus). The main card keeps 10 + 5 + 5, so it still decides a card. "correct" and
-- "picked" stay main-card counts. A player with only prelim picks is on the card as well.
--
-- Every card already tallied is tallied again under the new rule, so past standings, league
-- titles and podiums include the prelims. scored_at is left alone: no new results emails.

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
         count(*) filter (where b.segment = 'main' and b.outcome = 'win' and p.winner = b.winner),
         count(*) filter (where b.segment = 'main' and b.outcome = 'win'),
         coalesce(sum(
           case when b.outcome = 'win' and p.winner = b.winner then
             case when b.segment <> 'main' then 1
                  else 10
                    + case when p.method is not null and p.method = b.method then 5 else 0 end
                    + case when (case when p.winner = b.fighter_a then b.market_p_a else 1 - b.market_p_a end) < 0.5
                           then 5 else 0 end
             end
           else 0 end
         ), 0)
  from public.picks p
  join public.bouts b on b.id = p.bout_id
  where b.event_id = event
  group by p.user_id;
end;
$$;

select public.tally_event(id)
from public.events e
where exists (select 1 from public.scores s where s.event_id = e.id);
