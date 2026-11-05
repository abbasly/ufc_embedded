-- How everyone picked: per bout, how many players picked each fighter. Only counts (never who
-- picked what), and only once the card has locked, so nobody can follow the crowd before.
-- Security definer: picks themselves stay private under their row level security.

create function public.pick_split(event text)
returns table (bout_id text, fighter text, picks bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select p.bout_id, p.winner, count(*)
  from public.picks p
  join public.bouts b on b.id = p.bout_id
  join public.events e on e.id = b.event_id
  where b.event_id = event and now() >= e.locks_at
  group by p.bout_id, p.winner;
$$;

revoke all on function public.pick_split(text) from public;
grant execute on function public.pick_split(text) to anon, authenticated;
