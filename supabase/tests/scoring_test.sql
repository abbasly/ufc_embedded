-- Scoring tests: results and score_event(). Run with supabase/tests/run.sh.
--
-- Sam and Pia pick three main-card bouts: a favourite's KO win, an underdog's submission win
-- and a draw. Sam gets both winners (one method right, one underdog), Pia neither. Sam's right
-- pick on a prelim doesn't count: only the main card scores.

\set ON_ERROR_STOP 1
\set QUIET 1
\o /dev/null

insert into auth.users (id) values
  ('00000000-0000-0000-0000-0000000000f1'),
  ('00000000-0000-0000-0000-0000000000f2');
insert into public.profiles (id, display_name, avatar) values
  ('00000000-0000-0000-0000-0000000000f1', 'sam', 'ciryl-gane'),
  ('00000000-0000-0000-0000-0000000000f2', 'pia', null);
insert into public.events (id, name, starts_on, locks_at) values
  ('sc', 'Scored card', current_date - 1, now() - interval '1 day');
insert into public.bouts (id, event_id, position, fighter_a, fighter_b, a_name, b_name, market_p_a, segment) values
  ('sc:fav:dog', 'sc', 1, 'fav', 'dog', 'Fav', 'Dog', 0.7, 'main'),
  ('sc:big:small', 'sc', 2, 'big', 'small', 'Big', 'Small', 0.8, 'main'),
  ('sc:even:steven', 'sc', 3, 'even', 'steven', 'Even', 'Steven', 0.5, 'main'),
  ('sc:pre:lim', 'sc', 4, 'pre', 'lim', 'Pre', 'Lim', 0.5, 'prelims');
insert into public.picks (user_id, bout_id, winner, method) values
  ('00000000-0000-0000-0000-0000000000f1', 'sc:fav:dog', 'fav', 'KO/TKO'),     -- 10 + 5 method
  ('00000000-0000-0000-0000-0000000000f1', 'sc:big:small', 'small', 'DEC'),    -- 10 + 5 underdog
  ('00000000-0000-0000-0000-0000000000f1', 'sc:even:steven', 'even', null),    -- a draw: not counted
  ('00000000-0000-0000-0000-0000000000f1', 'sc:pre:lim', 'pre', null),         -- a prelim: not counted
  ('00000000-0000-0000-0000-0000000000f2', 'sc:fav:dog', 'dog', 'SUB'),
  ('00000000-0000-0000-0000-0000000000f2', 'sc:big:small', 'big', null);

\ir helpers.sql

-- ---- Results must hang together ----------------------------------------------------------------
select pg_temp.refused($$update public.bouts set outcome = 'draw', winner = 'fav' where id = 'sc:fav:dog'$$,
  'a draw with a winner');
select pg_temp.refused($$update public.bouts set outcome = 'win' where id = 'sc:fav:dog'$$,
  'a win without a winner');
select pg_temp.refused($$update public.bouts set outcome = 'win', winner = 'nobody' where id = 'sc:fav:dog'$$,
  'a winner who is not in the bout');
update public.bouts set outcome = 'win', winner = 'fav', method = 'KO/TKO' where id = 'sc:fav:dog';
update public.bouts set outcome = 'win', winner = 'small', method = 'SUB' where id = 'sc:big:small';
update public.bouts set outcome = 'draw' where id = 'sc:even:steven';
update public.bouts set outcome = 'win', winner = 'pre' where id = 'sc:pre:lim';

-- ---- Only the pipeline (service role or the owner) scores ----------------------------------------
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000f2';
select pg_temp.refused($$select public.score_event('sc')$$, 'a user scoring an event');
select pg_temp.refused($$update public.profiles set avatar = 'Not An Id!' where id = '00000000-0000-0000-0000-0000000000f2'$$,
  'an avatar that is not a fighter id');
update public.profiles set avatar = 'josh-hokit' where id = '00000000-0000-0000-0000-0000000000f2';
reset role;

set role service_role;
select public.score_event('sc');
select public.score_event('sc'); -- twice: same result
reset role;

select pg_temp.expect_count($$select 1 from public.scores where event_id = 'sc'$$, 2, 'one score per player');
select pg_temp.expect_count($$select 1 from public.scores where event_id = 'sc' and user_id = '00000000-0000-0000-0000-0000000000f1'
  and correct = 2 and picked = 2 and points = 30$$, 1, 'Sam: both winners, the method bonus and the underdog bonus');
select pg_temp.expect_count($$select 1 from public.scores where event_id = 'sc' and user_id = '00000000-0000-0000-0000-0000000000f2'
  and correct = 0 and picked = 2 and points = 0$$, 1, 'Pia: no winners, no points');
select pg_temp.expect_count($$select 1 from public.events where id = 'sc' and scored_at is not null$$, 1, 'the event marked as scored');
select pg_temp.expect_count($$select 1 from public.leaderboard where display_name = 'sam' and points = 30 and avatar = 'ciryl-gane'$$, 1,
  'the leaderboard with avatars');
select pg_temp.expect_count($$select 1 from public.leaderboard where display_name = 'pia' and avatar = 'josh-hokit'$$, 1,
  'a user changing their own avatar');

-- ---- The change log saw all of it, and only the owner can read it -------------------------------------
select pg_temp.expect_count($$select 1 from public.pickem_log where event_id = 'sc' and kind = 'event added'$$, 1, 'the log: event added');
select pg_temp.expect_count($$select 1 from public.pickem_log where event_id = 'sc' and kind = 'bout added'$$, 4, 'the log: bouts added');
select pg_temp.expect_count($$select 1 from public.pickem_log where bout_id = 'sc:fav:dog' and kind = 'result' and detail = 'Fav vs Dog: Fav by KO/TKO'$$, 1, 'the log: a result');
select pg_temp.expect_count($$select 1 from public.pickem_log where bout_id = 'sc:even:steven' and detail like '%: draw'$$, 1, 'the log: a draw');
update public.bouts set winner = 'dog', method = 'DEC' where id = 'sc:fav:dog';
select pg_temp.expect_count($$select 1 from public.pickem_log where bout_id = 'sc:fav:dog' and kind = 'result changed' and detail like '%Dog by DEC'$$, 1, 'the log: a corrected result');
select pg_temp.expect_count($$select 1 from public.pickem_log where event_id = 'sc' and kind = 'scored'$$, 2, 'the log: scored (twice)');
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000f1';
select pg_temp.refused($$select 1 from public.pickem_log$$, 'a player reading the change log');
reset role;

\echo 'All scoring tests passed.'
