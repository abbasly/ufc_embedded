-- What a visitor or a signed-in troublemaker might try, and must not get away with. Every
-- statement here has to be refused (or change nothing). Run with supabase/tests/run.sh.

\set ON_ERROR_STOP 1
\set QUIET 1
\o /dev/null

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000ee1', 'eve@example.com'),
  ('00000000-0000-0000-0000-000000000ee2', 'vic@example.com');
insert into public.profiles (id, display_name) values
  ('00000000-0000-0000-0000-000000000ee1', 'eve'),
  ('00000000-0000-0000-0000-000000000ee2', 'vic');
insert into public.events (id, name, starts_on, locks_at) values
  ('atk', 'Attack card', current_date + 7, now() + interval '7 days'),
  ('atk-done', 'Locked card', current_date - 1, now() - interval '1 day');
insert into public.bouts (id, event_id, position, fighter_a, fighter_b, a_name, b_name) values
  ('atk:x:y', 'atk', 1, 'x', 'y', 'X', 'Y'),
  ('atk-done:x:y', 'atk-done', 1, 'x', 'y', 'X', 'Y');
insert into public.picks (user_id, bout_id, winner) values ('00000000-0000-0000-0000-000000000ee2', 'atk:x:y', 'x');
select public.score_event('atk-done');

\ir helpers.sql

-- ---- A visitor (not signed in) -------------------------------------------------------------------
set role anon;
reset request.jwt.claim.sub;
select pg_temp.refused($$insert into public.events (id, name, starts_on, locks_at) values ('fake', 'x', current_date, now())$$, 'a visitor adding an event');
update public.events set locks_at = now() + interval '1 year' where id = 'atk-done';
delete from public.bouts where event_id like 'atk%';
select pg_temp.refused($$insert into public.scores (user_id, event_id, correct, picked, points) values ('00000000-0000-0000-0000-000000000ee1', 'atk', 1, 1, 999)$$, 'a visitor writing a score');
select pg_temp.expect_count($$select 1 from public.picks$$, 0, 'a visitor reading picks');
select pg_temp.expect_count($$select 1 from public.friendships$$, 0, 'a visitor reading friendships');
select pg_temp.refused($$select 1 from public.friend_request_notices$$, 'a visitor reading who was emailed');
select pg_temp.expect_count($$select 1 from public.leagues$$, 0, 'a visitor reading leagues and invite codes');
select pg_temp.refused($$select public.score_event('atk')$$, 'a visitor running the scoring');
select pg_temp.refused($$select public.delete_my_account()$$, 'a visitor deleting accounts');
select pg_temp.refused($$select public.join_league('ABCDEF12')$$, 'a visitor joining a league');
select pg_temp.refused($$select public.friend_request('00000000-0000-0000-0000-000000000ee1')$$, 'a visitor sending a friend request');
select pg_temp.refused($$select * from public.mates_who_picked('atk')$$, 'a visitor asking who picked');
select pg_temp.refused($$select 1 from auth.users$$, 'a visitor reading accounts and emails');

-- ---- Eve, signed in, going after Vic and the game ------------------------------------------------
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000ee1';
update public.events set locks_at = now() + interval '1 year' where id = 'atk-done';
update public.bouts set winner = 'x', outcome = 'win' where id = 'atk-done:x:y';
delete from public.events where id like 'atk%';
select pg_temp.refused($$insert into public.scores (user_id, event_id, correct, picked, points) values ('00000000-0000-0000-0000-000000000ee1', 'atk', 1, 1, 999)$$, 'a player writing her own score');
update public.scores set points = 999;
select pg_temp.refused($$select public.score_event('atk-done')$$, 'a player running the scoring');
-- Picks: not as someone else, not after the lock, not on a fighter who isn't in the bout.
select pg_temp.refused($$insert into public.picks (user_id, bout_id, winner) values ('00000000-0000-0000-0000-000000000ee2', 'atk:x:y', 'y')$$, 'picking in someone else''s name');
update public.picks set winner = 'y' where user_id = '00000000-0000-0000-0000-000000000ee2';
delete from public.picks where user_id = '00000000-0000-0000-0000-000000000ee2';
select pg_temp.refused($$insert into public.picks (user_id, bout_id, winner) values ('00000000-0000-0000-0000-000000000ee1', 'atk-done:x:y', 'x')$$, 'picking after the lock');
select pg_temp.refused($$insert into public.picks (user_id, bout_id, winner) values ('00000000-0000-0000-0000-000000000ee1', 'atk:x:y', 'nobody')$$, 'picking a fighter not in the bout');
-- Her own pick can't be moved onto someone else.
insert into public.picks (user_id, bout_id, winner) values ('00000000-0000-0000-0000-000000000ee1', 'atk:x:y', 'x');
select pg_temp.refused($$update public.picks set user_id = '00000000-0000-0000-0000-000000000ee2' where user_id = '00000000-0000-0000-0000-000000000ee1'$$, 'moving a pick to someone else');
-- Profiles: not Vic's, not a second one, not a name that breaks the rules.
update public.profiles set display_name = 'hacked', avatar = 'x' where id = '00000000-0000-0000-0000-000000000ee2';
select pg_temp.refused($$update public.profiles set id = '00000000-0000-0000-0000-000000000ee2' where id = '00000000-0000-0000-0000-000000000ee1'$$, 'taking over someone''s profile id');
select pg_temp.refused($$update public.profiles set display_name = '<script>' where id = '00000000-0000-0000-0000-000000000ee1'$$, 'a display name with markup');
select pg_temp.refused($$update public.profiles set display_name = 'vic' where id = '00000000-0000-0000-0000-000000000ee1'$$, 'taking someone''s display name');
-- Names that pass for the site itself.
select pg_temp.refused($$update public.profiles set display_name = 'Admin' where id = '00000000-0000-0000-0000-000000000ee1'$$, 'calling yourself Admin');
select pg_temp.refused($$update public.profiles set display_name = 'ufc_official' where id = '00000000-0000-0000-0000-000000000ee1'$$, 'calling yourself ufc_official');
select pg_temp.refused($$update public.profiles set display_name = 'UFCEmbedded' where id = '00000000-0000-0000-0000-000000000ee1'$$, 'calling yourself UFCEmbedded');
update public.profiles set display_name = 'ufc_fan_99' where id = '00000000-0000-0000-0000-000000000ee1';
select pg_temp.expect_count($$select 1 from public.profiles where display_name = 'ufc_fan_99'$$, 1, 'an ordinary name with "ufc" in it');
-- Leagues and friends only through their functions.
select pg_temp.refused($$insert into public.leagues (name, owner_id) values ('Fake', '00000000-0000-0000-0000-000000000ee2')$$, 'a league in someone else''s name');
select pg_temp.refused($$insert into public.friendships (requester, addressee, status) values ('00000000-0000-0000-0000-000000000ee2', '00000000-0000-0000-0000-000000000ee1', 'accepted')$$, 'faking a friendship');
select pg_temp.refused($$insert into public.friend_request_notices (requester, addressee) values ('00000000-0000-0000-0000-000000000ee1', '00000000-0000-0000-0000-000000000ee2')$$, 'writing email notices');
select pg_temp.refused($$select 1 from auth.users$$, 'a player reading accounts and emails');
reset role;

-- ---- Nothing above changed anything that matters ---------------------------------------------------
select pg_temp.expect_count($$select 1 from public.events where id like 'atk%'$$, 2, 'the events, after all that');
select pg_temp.expect_count($$select 1 from public.events where id = 'atk-done' and locks_at < now()$$, 1, 'the lock time, after all that');
select pg_temp.expect_count($$select 1 from public.bouts where event_id like 'atk%' and outcome is null$$, 2, 'the bouts and results, after all that');
select pg_temp.expect_count($$select 1 from public.scores where points = 999$$, 0, 'scores, after all that');
select pg_temp.expect_count($$select 1 from public.picks where user_id = '00000000-0000-0000-0000-000000000ee2' and winner = 'x'$$, 1, 'Vic''s pick, after all that');
select pg_temp.expect_count($$select 1 from public.profiles where display_name = 'vic' and avatar is null$$, 1, 'Vic''s profile, after all that');

-- ---- The model's picks: public after the lock, not before; a player's never ----------------------------
insert into auth.users (id) values ('00000000-0000-0000-0000-000000000ee3');
insert into public.profiles (id, display_name) values ('00000000-0000-0000-0000-000000000ee3', 'the_model');
insert into public.picks (user_id, bout_id, winner) values ('00000000-0000-0000-0000-000000000ee3', 'atk:x:y', 'x');
update public.events set locks_at = now() - interval '1 minute' where id = 'atk';
insert into public.picks (user_id, bout_id, winner, updated_at) select '00000000-0000-0000-0000-000000000ee3', 'atk-done:x:y', 'y', now();
set role anon;
select pg_temp.expect_count($$select 1 from public.picks where user_id = '00000000-0000-0000-0000-000000000ee3'$$, 2, 'a visitor seeing the model''s picks after the lock');
select pg_temp.expect_count($$select 1 from public.picks where user_id = '00000000-0000-0000-0000-000000000ee2'$$, 0, 'a visitor seeing a player''s picks after the lock');
reset role;
update public.events set locks_at = now() + interval '1 day' where id = 'atk';
set role anon;
select pg_temp.expect_count($$select 1 from public.picks where user_id = '00000000-0000-0000-0000-000000000ee3'$$, 1, 'a visitor seeing the model''s pick before the lock');
reset role;
-- The model leaves no picks behind for the other test files' counts.
delete from auth.users where id = '00000000-0000-0000-0000-000000000ee3';

\echo 'All attack tests passed.'
