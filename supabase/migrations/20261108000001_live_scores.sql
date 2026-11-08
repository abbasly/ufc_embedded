-- Live scores: points go up fight by fight while a card is on, not only once it's over.
--
-- tally_event() counts the points from the results in so far (the scoring rules are unchanged:
-- main card only, 10 for the winner, +5 for the method, +5 for an underdog). The sync runs it
-- after every result. score_event() is the same tally plus marking the card as scored, which
-- it still does only once every bout has a result: that's what shows the final podium and
-- sends the results emails.

create function public.tally_event(event text)
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
end;
$$;

create or replace function public.score_event(event text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.tally_event(event);
  update public.events set scored_at = now() where id = event;
end;
$$;

revoke all on function public.tally_event(text) from public, anon, authenticated;
grant execute on function public.tally_event(text) to service_role;
