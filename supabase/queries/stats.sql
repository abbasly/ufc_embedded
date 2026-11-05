-- Pick'em at a glance: paste into the Supabase SQL editor and run. Read-only.
-- (Page views come from Cloudflare and GoatCounter; this is what only the database knows.)

select 'accounts' as what, count(*)::text as value from auth.users
union all select 'with a display name', count(*)::text from public.profiles
union all select 'new accounts, last 24 h', count(*)::text from auth.users where created_at > now() - interval '1 day'
union all select 'signed in with Google', count(*)::text from auth.identities where provider = 'google'
union all select 'players with a pick', count(distinct user_id)::text from public.picks
union all select 'picks', count(*)::text from public.picks
union all select 'picks with a method', count(*)::text from public.picks where method is not null
union all select 'leagues', count(*)::text from public.leagues
union all select 'league memberships', count(*)::text from public.league_members
union all select 'biggest league', coalesce(max(n), 0)::text from (select count(*) as n from public.league_members group by league_id) l;

-- Picks per card, and how many people picked it:
-- select b.event_id, count(*) as picks, count(distinct p.user_id) as players
-- from public.picks p join public.bouts b on b.id = p.bout_id group by b.event_id order by b.event_id;

-- Sign-ups per day:
-- select date(created_at) as day, count(*) from auth.users group by 1 order by 1 desc;

-- The crowd's favourite on every bout of a card (change the event id):
-- select b.a_name, b.b_name,
--        round(100.0 * count(*) filter (where p.winner = b.fighter_a) / nullif(count(*), 0)) as pct_a, count(*) as picks
-- from public.bouts b left join public.picks p on p.bout_id = b.id
-- where b.event_id = '2026-11-07-ufc-fight-night' group by b.id order by b.position;
