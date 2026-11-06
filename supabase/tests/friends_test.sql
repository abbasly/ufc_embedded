-- Friends tests: requests, accepting, what friends (and strangers) can see. Run with
-- supabase/tests/run.sh.
--
-- Ana asks Ben; Ben accepts; Cid is a stranger throughout.

\set ON_ERROR_STOP 1
\set QUIET 1
\o /dev/null

insert into auth.users (id) values
  ('00000000-0000-0000-0000-0000000000a1'),
  ('00000000-0000-0000-0000-0000000000b2'),
  ('00000000-0000-0000-0000-0000000000c3');
insert into public.profiles (id, display_name) values
  ('00000000-0000-0000-0000-0000000000a1', 'ana'),
  ('00000000-0000-0000-0000-0000000000b2', 'ben'),
  ('00000000-0000-0000-0000-0000000000c3', 'cid');
insert into public.events (id, name, starts_on, locks_at) values
  ('fr', 'Friends card', current_date + 7, now() + interval '7 days');
insert into public.bouts (id, event_id, position, fighter_a, fighter_b, a_name, b_name) values
  ('fr:x:y', 'fr', 1, 'x', 'y', 'X', 'Y');
insert into public.picks (user_id, bout_id, winner) values
  ('00000000-0000-0000-0000-0000000000a1', 'fr:x:y', 'x'),
  ('00000000-0000-0000-0000-0000000000b2', 'fr:x:y', 'y');

\ir helpers.sql

set role authenticated;

-- ---- Ana asks Ben ---------------------------------------------------------------------------
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
select pg_temp.refused($$select public.friend_request('00000000-0000-0000-0000-0000000000a1')$$, 'friending yourself');
select public.friend_request('00000000-0000-0000-0000-0000000000b2');
select public.friend_request('00000000-0000-0000-0000-0000000000b2'); -- asking twice is fine
select pg_temp.expect_count($$select 1 from public.my_friends() where display_name = 'ben' and status = 'outgoing'$$, 1, 'Ana''s outgoing request');
select public.friend_accept('00000000-0000-0000-0000-0000000000b2'); -- can't accept her own request
select pg_temp.expect_count($$select 1 from public.friendships where status = 'accepted'$$, 0, 'Ana accepting her own request');
select pg_temp.refused($$insert into public.friendships (requester, addressee, status) values ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000c3', 'accepted')$$,
  'writing a friendship directly');
select pg_temp.expect_count($$select 1 from public.mates_who_picked('fr')$$, 0, 'Ana seeing who picked before Ben accepts');

-- ---- Cid, a stranger, sees nothing of it ------------------------------------------------------
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c3';
select pg_temp.expect_count($$select 1 from public.friendships$$, 0, 'a stranger seeing the request');
select pg_temp.expect_count($$select 1 from public.my_friends()$$, 0, 'a stranger''s friends');

-- ---- Ben accepts ------------------------------------------------------------------------------
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b2';
select pg_temp.expect_count($$select 1 from public.my_friends() where display_name = 'ana' and status = 'incoming'$$, 1, 'Ben''s incoming request');
select public.friend_accept('00000000-0000-0000-0000-0000000000a1');
select pg_temp.expect_count($$select 1 from public.my_friends() where display_name = 'ana' and status = 'friends'$$, 1, 'Ben and Ana as friends');
select pg_temp.expect_count($$select 1 from public.friends_standings()$$, 2, 'Ben''s friends board (him and Ana)');
-- Before the lock: Ben sees that Ana picked, not whom.
select pg_temp.expect_count($$select 1 from public.mates_who_picked('fr') where display_name = 'ana'$$, 1, 'Ben seeing that Ana picked');
select pg_temp.expect_count($$select 1 from public.picks where user_id = '00000000-0000-0000-0000-0000000000a1'$$, 0, 'Ben seeing Ana''s pick before the lock');

-- ---- After the lock: friends see each other's picks; strangers don't ---------------------------
reset role;
update public.events set locks_at = now() - interval '1 minute' where id = 'fr';
set role authenticated;
select pg_temp.expect_count($$select 1 from public.picks where user_id = '00000000-0000-0000-0000-0000000000a1'$$, 1, 'Ben seeing Ana''s pick after the lock');
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c3';
select pg_temp.expect_count($$select 1 from public.picks$$, 0, 'a stranger seeing picks after the lock');

-- ---- Unfriending removes it for both -------------------------------------------------------------
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
select public.friend_remove('00000000-0000-0000-0000-0000000000b2');
select pg_temp.expect_count($$select 1 from public.picks where user_id = '00000000-0000-0000-0000-0000000000b2'$$, 0, 'Ana seeing Ben''s pick after unfriending');
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b2';
select pg_temp.expect_count($$select 1 from public.my_friends()$$, 0, 'Ben''s friends after Ana unfriended him');

-- ---- Asking someone who already asked you accepts their request -----------------------------------
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c3';
select public.friend_request('00000000-0000-0000-0000-0000000000a1');
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
select public.friend_request('00000000-0000-0000-0000-0000000000c3');
select pg_temp.expect_count($$select 1 from public.friendships where status = 'accepted'$$, 1, 'a request back accepting the first');
reset role;

-- ---- Friend-request emails: your own switch, and the notices only the server sees -----------------
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
update public.profiles set notify_friend_requests = false where id = '00000000-0000-0000-0000-0000000000a1';
update public.profiles set notify_friend_requests = false where id = '00000000-0000-0000-0000-0000000000b2';
reset role;
select pg_temp.expect_count($$select 1 from public.profiles where notify_friend_requests = false$$, 1, 'turning off only your own emails');
insert into public.friend_request_notices (requester, addressee) values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b2');
set role authenticated;
select pg_temp.refused($$select 1 from public.friend_request_notices$$, 'a player reading who was emailed');
select pg_temp.refused($$insert into public.friend_request_notices (requester, addressee) values ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000c3')$$,
  'a player writing email notices');
reset role;

\echo 'All friends tests passed.'
