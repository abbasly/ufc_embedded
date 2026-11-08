-- Closest predictors: agreement counts, and only among picks the caller may see.
-- Run with supabase/tests/run.sh.

\set ON_ERROR_STOP 1
\set QUIET 1
\o /dev/null

insert into auth.users (id) values
  ('00000000-0000-0000-0000-0000000000d1'),
  ('00000000-0000-0000-0000-0000000000d2'),
  ('00000000-0000-0000-0000-0000000000d3');
insert into public.profiles (id, display_name) values
  ('00000000-0000-0000-0000-0000000000d1', 'cp_ann'),
  ('00000000-0000-0000-0000-0000000000d2', 'cp_bob'),
  ('00000000-0000-0000-0000-0000000000d3', 'cp_out');
insert into public.events (id, name, starts_on, locks_at) values
  ('cp', 'Locked card', current_date - 1, now() - interval '1 day'),
  ('cp-open', 'Open card', current_date + 7, now() + interval '7 days');
insert into public.bouts (id, event_id, position, fighter_a, fighter_b, a_name, b_name) values
  ('cp:a1:b1', 'cp', 1, 'a1', 'b1', 'A1', 'B1'),
  ('cp:a2:b2', 'cp', 2, 'a2', 'b2', 'A2', 'B2'),
  ('cp:a3:b3', 'cp', 3, 'a3', 'b3', 'A3', 'B3'),
  ('cp:a4:b4', 'cp', 4, 'a4', 'b4', 'A4', 'B4'),
  ('cp-open:a:b', 'cp-open', 1, 'a', 'b', 'A', 'B');
insert into public.leagues (id, name, owner_id) values
  ('00000000-0000-0000-0000-0000000000d9', 'Closest', '00000000-0000-0000-0000-0000000000d1');
insert into public.league_members (league_id, user_id) values
  ('00000000-0000-0000-0000-0000000000d9', '00000000-0000-0000-0000-0000000000d1'),
  ('00000000-0000-0000-0000-0000000000d9', '00000000-0000-0000-0000-0000000000d2');
insert into public.picks (user_id, bout_id, winner) values
  ('00000000-0000-0000-0000-0000000000d1', 'cp:a1:b1', 'a1'),
  ('00000000-0000-0000-0000-0000000000d1', 'cp:a2:b2', 'a2'),
  ('00000000-0000-0000-0000-0000000000d1', 'cp:a3:b3', 'a3'),
  ('00000000-0000-0000-0000-0000000000d1', 'cp:a4:b4', 'a4'),
  ('00000000-0000-0000-0000-0000000000d1', 'cp-open:a:b', 'a'),
  ('00000000-0000-0000-0000-0000000000d2', 'cp:a1:b1', 'a1'),
  ('00000000-0000-0000-0000-0000000000d2', 'cp:a2:b2', 'a2'),
  ('00000000-0000-0000-0000-0000000000d2', 'cp:a3:b3', 'b3'),
  ('00000000-0000-0000-0000-0000000000d2', 'cp:a4:b4', 'a4'),
  ('00000000-0000-0000-0000-0000000000d2', 'cp-open:a:b', 'a'),
  ('00000000-0000-0000-0000-0000000000d3', 'cp:a1:b1', 'a1'),
  ('00000000-0000-0000-0000-0000000000d3', 'cp:a2:b2', 'a2'),
  ('00000000-0000-0000-0000-0000000000d3', 'cp:a3:b3', 'a3'),
  ('00000000-0000-0000-0000-0000000000d3', 'cp:a4:b4', 'a4');

\ir helpers.sql

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000d1';
select pg_temp.expect_count($$select 1 from public.closest_predictors('00000000-0000-0000-0000-0000000000d1')
  where display_name = 'cp_bob' and shared = 4 and agreed = 3$$, 1, 'a league-mate: 3 of 4 locked fights agreed (the open card not counted)');
select pg_temp.expect_count($$select 1 from public.closest_predictors('00000000-0000-0000-0000-0000000000d1')
  where display_name = 'cp_out'$$, 0, 'someone outside your leagues: their picks stay out of it');

-- An outsider learns nothing about the league's picks.
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000d3';
select pg_temp.expect_count($$select 1 from public.closest_predictors('00000000-0000-0000-0000-0000000000d3')$$, 0, 'an outsider comparing themselves with the league');
select pg_temp.expect_count($$select 1 from public.closest_predictors('00000000-0000-0000-0000-0000000000d1')$$, 0, 'an outsider asking about a league member');

set role anon;
select pg_temp.refused($$select 1 from public.closest_predictors('00000000-0000-0000-0000-0000000000d1')$$, 'a visitor who is not signed in');
reset role;

\o
\echo All closest predictor tests passed.
