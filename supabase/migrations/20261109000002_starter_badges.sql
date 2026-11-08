-- Starter badges: quick ones for new players, earned by playing and not by results. Worked out
-- from what's already stored. Public, like the rest of a profile: it only says that someone has
-- picked, never whom or on which fight.

create function public.starter_badges(player uuid)
returns table (badge text)
language sql
stable
security definer
set search_path = ''
as $$
  select 'first-pick'::text where exists (
    select 1 from public.picks p where p.user_id = starter_badges.player
  )
  union all
  select 'called-method' where exists (
    select 1 from public.picks p where p.user_id = starter_badges.player and p.method is not null
  )
  union all
  -- At least three main-card fights, so a card that's barely announced doesn't count.
  select 'full-card' where exists (
    select 1
    from public.bouts b
    left join public.picks p on p.bout_id = b.id and p.user_id = starter_badges.player
    where b.segment = 'main'
    group by b.event_id
    having count(*) >= 3 and count(*) = count(p.user_id)
  )
  union all
  select 'signed-up' where exists (
    select 1 from public.profiles p where p.id = starter_badges.player
  )
  union all
  select 'in-league' where exists (
    select 1 from public.league_members m where m.user_id = starter_badges.player
  );
$$;

revoke all on function public.starter_badges(uuid) from public, anon;
grant execute on function public.starter_badges(uuid) to anon, authenticated;
