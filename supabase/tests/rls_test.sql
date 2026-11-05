-- Row level security tests: each block acts as a visitor (anon) or a signed-in user and checks
-- what the database lets them do. A failed expectation raises "TEST FAILED: ...", which stops
-- the run (psql ON_ERROR_STOP). Run with supabase/tests/run.sh. Test files share one database,
-- so each counts only its own fixtures.

\set ON_ERROR_STOP 1
\set QUIET 1
\o /dev/null

-- Fixtures, as the database owner: two users, an event still open for picks, one already locked.
insert into auth.users (id) values
  ('aaaaaaaa-0000-0000-0000-000000000001'),
  ('bbbbbbbb-0000-0000-0000-000000000002');
insert into public.events (id, name, starts_on, locks_at) values
  ('open', 'Open card', current_date + 7, now() + interval '7 days'),
  ('locked', 'Locked card', current_date - 1, now() - interval '1 day');
insert into public.bouts (id, event_id, position, fighter_a, fighter_b, a_name, b_name) values
  ('open:x:y', 'open', 1, 'x', 'y', 'X', 'Y'),
  ('locked:x:y', 'locked', 1, 'x', 'y', 'X', 'Y');

\ir helpers.sql

-- ---- Alice signs in and sets up her profile and picks --------------------------------------
set role authenticated;
set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';
insert into public.profiles (id, display_name) values ('aaaaaaaa-0000-0000-0000-000000000001', 'alice');
select pg_temp.refused($$insert into public.profiles (id, display_name) values ('bbbbbbbb-0000-0000-0000-000000000002', 'mallory')$$,
  'creating a profile for someone else');
select pg_temp.refused($$insert into public.profiles (id, display_name) values ('aaaaaaaa-0000-0000-0000-000000000001', 'x')$$,
  'a display name under 3 characters');
insert into public.picks (user_id, bout_id, winner) values ('aaaaaaaa-0000-0000-0000-000000000001', 'open:x:y', 'x');
update public.picks set winner = 'y' where bout_id = 'open:x:y';
select pg_temp.expect_count($$select 1 from public.picks where winner = 'y' and user_id = 'aaaaaaaa-0000-0000-0000-000000000001'$$, 1, 'Alice changing her open pick');
select pg_temp.refused($$insert into public.picks (user_id, bout_id, winner) values ('aaaaaaaa-0000-0000-0000-000000000001', 'locked:x:y', 'x')$$,
  'picking after the event locked');
select pg_temp.refused($$update public.picks set winner = 'nobody' where bout_id = 'open:x:y'$$,
  'picking a fighter who is not in the bout');
select pg_temp.refused($$insert into public.scores (user_id, event_id, correct, picked) values ('aaaaaaaa-0000-0000-0000-000000000001', 'open', 9, 9)$$,
  'a user writing their own score');
select pg_temp.refused($$insert into public.events (id, name, starts_on, locks_at) values ('fake', 'Fake', current_date, now() + interval '1 day')$$,
  'a user creating an event');

-- ---- Bob signs in: he must not see or touch Alice's picks ------------------------------------
set request.jwt.claim.sub = 'bbbbbbbb-0000-0000-0000-000000000002';
insert into public.profiles (id, display_name) values ('bbbbbbbb-0000-0000-0000-000000000002', 'bob');
select pg_temp.refused($$insert into public.profiles (id, display_name) values ('bbbbbbbb-0000-0000-0000-000000000002', 'alice')$$,
  'a second profile for the same user');
select pg_temp.expect_count($$select 1 from public.picks$$, 0, 'Bob seeing Alice''s picks');
update public.picks set winner = 'x' where user_id = 'aaaaaaaa-0000-0000-0000-000000000001';
delete from public.picks where user_id = 'aaaaaaaa-0000-0000-0000-000000000001';
select pg_temp.refused($$insert into public.picks (user_id, bout_id, winner) values ('aaaaaaaa-0000-0000-0000-000000000001', 'open:x:y', 'x')$$,
  'Bob picking in Alice''s name');
update public.profiles set display_name = 'hacked' where id = 'aaaaaaaa-0000-0000-0000-000000000001';

-- ---- A visitor who isn't signed in: read the public tables, write nothing --------------------
set role anon;
reset request.jwt.claim.sub;
select pg_temp.expect_count($$select 1 from public.events where id in ('open', 'locked')$$, 2, 'visitors reading events');
select pg_temp.expect_count($$select 1 from public.bouts where event_id in ('open', 'locked')$$, 2, 'visitors reading bouts');
select pg_temp.expect_count($$select 1 from public.profiles where display_name in ('alice', 'bob')$$, 2, 'visitors reading display names');
select pg_temp.expect_count($$select 1 from public.picks$$, 0, 'visitors seeing anyone''s picks');
select pg_temp.refused($$insert into public.picks (user_id, bout_id, winner) values ('aaaaaaaa-0000-0000-0000-000000000001', 'open:x:y', 'x')$$,
  'a visitor picking');
select pg_temp.refused($$select public.delete_my_account()$$, 'a visitor calling delete_my_account');

-- ---- As the owner again: Bob's attempts changed nothing --------------------------------------
reset role;
select pg_temp.expect_count($$select 1 from public.picks where user_id = 'aaaaaaaa-0000-0000-0000-000000000001' and winner = 'y'$$, 1,
  'Alice''s pick surviving Bob''s update and delete');
select pg_temp.expect_count($$select 1 from public.profiles where display_name = 'alice'$$, 1, 'Alice''s name surviving Bob''s rename');

-- ---- Once the event locks, Alice can't change her pick either --------------------------------
update public.events set locks_at = now() - interval '1 minute' where id = 'open';
set role authenticated;
set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';
update public.picks set winner = 'x' where bout_id = 'open:x:y';
delete from public.picks where bout_id = 'open:x:y';
reset role;
select pg_temp.expect_count($$select 1 from public.picks where winner = 'y' and user_id = 'aaaaaaaa-0000-0000-0000-000000000001'$$, 1, 'Alice''s pick frozen after the lock');

-- ---- The leaderboard shows totals only ---------------------------------------------------------
insert into public.scores (user_id, event_id, correct, picked, points) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'locked', 1, 1, 1);
set role anon;
select pg_temp.expect_count($$select 1 from public.leaderboard where display_name = 'alice' and points = 1$$, 1, 'the leaderboard');

-- ---- Alice deletes her account: everything of hers goes ------------------------------------------
set role authenticated;
set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';
select public.delete_my_account();
reset role;
select pg_temp.expect_count($$select 1 from auth.users where id = 'aaaaaaaa-0000-0000-0000-000000000001'$$, 0, 'Alice''s user after deletion');
select pg_temp.expect_count($$select 1 from public.profiles where display_name = 'alice'$$, 0, 'Alice''s profile after deletion');
select pg_temp.expect_count($$select 1 from public.picks where user_id = 'aaaaaaaa-0000-0000-0000-000000000001'$$, 0, 'Alice''s picks after deletion');
select pg_temp.expect_count($$select 1 from public.scores where user_id = 'aaaaaaaa-0000-0000-0000-000000000001'$$, 0, 'Alice''s scores after deletion');
select pg_temp.expect_count($$select 1 from public.profiles where display_name = 'bob'$$, 1, 'Bob untouched by Alice''s deletion');

\echo 'All row level security tests passed.'
