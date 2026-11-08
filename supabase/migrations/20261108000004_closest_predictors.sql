-- Who picks most like a player: for each other player, on how many locked fights they both
-- picked and how many of those they agreed on.
--
-- Security invoker on purpose: it runs with the caller's own row level security, so it only ever
-- compares picks the caller may already see (their own, friends', league-mates', the model's,
-- all after the lock). Nothing about anyone else's picks is revealed.

create function public.closest_predictors(player uuid)
returns table (display_name text, avatar text, shared bigint, agreed bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  select o.display_name, o.avatar, count(*), count(*) filter (where mine.winner = theirs.winner)
  from public.picks mine
  join public.picks theirs on theirs.bout_id = mine.bout_id and theirs.user_id <> mine.user_id
  join public.profiles o on o.id = theirs.user_id
  where mine.user_id = player and not public.bout_is_open(mine.bout_id)
  group by o.display_name, o.avatar
  having count(*) >= 3
  order by count(*) filter (where mine.winner = theirs.winner)::float / count(*) desc, count(*) desc, o.display_name;
$$;

revoke all on function public.closest_predictors(uuid) from public, anon;
grant execute on function public.closest_predictors(uuid) to authenticated;
