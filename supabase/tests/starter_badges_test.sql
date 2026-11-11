-- Starter badges: each one's condition, and that a visitor can read them. Run with
-- supabase/tests/run.sh.

\set ON_ERROR_STOP 1
\set QUIET 1
\o /dev/null
\ir helpers.sql

insert into auth.users (id) values
  ('00000000-0000-0000-0000-00000000bb01'),
  ('00000000-0000-0000-0000-00000000bb02');
insert into public.profiles (id, display_name) values
  ('00000000-0000-0000-0000-00000000bb01', 'sb_new'),
  ('00000000-0000-0000-0000-00000000bb02', 'sb_all');
insert into public.events (id, name, starts_on, locks_at) values
  ('sb', 'Starter card', current_date + 7, now() + interval '7 days'),
  ('sb-small', 'Two fights so far', current_date + 9, now() + interval '9 days');
insert into public.bouts (id, event_id, position, fighter_a, fighter_b, a_name, b_name, segment) values
  ('sb:a1:b1', 'sb', 1, 'a1', 'b1', 'A1', 'B1', 'main'),
  ('sb:a2:b2', 'sb', 2, 'a2', 'b2', 'A2', 'B2', 'main'),
  ('sb:a3:b3', 'sb', 3, 'a3', 'b3', 'A3', 'B3', 'main'),
  ('sb:a4:b4', 'sb', 4, 'a4', 'b4', 'A4', 'B4', 'prelims'),
  ('sb-small:a:b', 'sb-small', 1, 'a', 'b', 'A', 'B', 'main'),
  ('sb-small:c:d', 'sb-small', 2, 'c', 'd', 'C', 'D', 'main');
insert into public.leagues (id, name, owner_id) values
  ('00000000-0000-0000-0000-00000000bb09', 'Starters', '00000000-0000-0000-0000-00000000bb02');
insert into public.league_members (league_id, user_id) values
  ('00000000-0000-0000-0000-00000000bb09', '00000000-0000-0000-0000-00000000bb02');
-- sb_all picks the whole main card (not the prelim) and calls one method; sb_new picks all of
-- the two-fight card, which is too small to count.
insert into public.picks (user_id, bout_id, winner, method) values
  ('00000000-0000-0000-0000-00000000bb02', 'sb:a1:b1', 'a1', 'DEC'),
  ('00000000-0000-0000-0000-00000000bb02', 'sb:a2:b2', 'a2', null),
  ('00000000-0000-0000-0000-00000000bb02', 'sb:a3:b3', 'a3', null),
  ('00000000-0000-0000-0000-00000000bb01', 'sb-small:a:b', 'a', null),
  ('00000000-0000-0000-0000-00000000bb01', 'sb-small:c:d', 'c', null);

set role anon;
set request.jwt.claim.sub = '';
select pg_temp.expect_count($$select 1 from public.starter_badges('00000000-0000-0000-0000-00000000bb02')$$, 5, 'all five for a player who did everything');
select pg_temp.expect_count($$select 1 from public.starter_badges('00000000-0000-0000-0000-00000000bb01')$$, 2, 'first pick and account only for the newcomer');
select pg_temp.expect_count($$select 1 from public.starter_badges('00000000-0000-0000-0000-00000000bb01') where badge = 'full-card'$$, 0, 'a two-fight card counting as a full card');
select pg_temp.expect_count($$select 1 from public.starter_badges('00000000-0000-0000-0000-000000000000')$$, 0, 'badges for nobody');
reset role;

\o
\echo All starter badge tests passed.
