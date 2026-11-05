-- Leagues: only members see a league, its members and standings; joining needs the invite
-- code; league-mates see each other's picks only once the card has locked.
-- Run with supabase/tests/run.sh.

\set ON_ERROR_STOP 1
\set QUIET 1
\o /dev/null
\ir helpers.sql

-- Fixtures, as the database owner: Olga creates a league, Fred joins it, Xena stays outside.
insert into auth.users (id) values
  ('00000000-0000-0000-0000-00000000000a'),  -- Olga
  ('00000000-0000-0000-0000-00000000000b'),  -- Fred
  ('00000000-0000-0000-0000-00000000000c');  -- Xena
insert into public.profiles (id, display_name) values
  ('00000000-0000-0000-0000-00000000000a', 'olga'),
  ('00000000-0000-0000-0000-00000000000b', 'fred'),
  ('00000000-0000-0000-0000-00000000000c', 'xena');
insert into public.events (id, name, starts_on, locks_at) values
  ('lg-open', 'Open card', current_date + 7, now() + interval '7 days');
insert into public.bouts (id, event_id, position, fighter_a, fighter_b, a_name, b_name) values
  ('lg-open:x:y', 'lg-open', 1, 'x', 'y', 'X', 'Y');

-- ---- Olga creates a league and picks ------------------------------------------------------
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
select public.create_league('Gym boys');
select pg_temp.expect_count($$select 1 from public.leagues where name = 'Gym boys'$$, 1, 'Olga seeing her league');
select pg_temp.expect_count($$select 1 from public.league_members$$, 1, 'Olga as her league''s first member');
select pg_temp.refused($$select public.create_league('ab')$$, 'a league name under 3 characters');
insert into public.picks (user_id, bout_id, winner) values ('00000000-0000-0000-0000-00000000000a', 'lg-open:x:y', 'x');

-- The invite code, read as the owner (who is a member), for Fred to use.
reset role;
select invite_code as code, id as league from public.leagues where name = 'Gym boys' \gset

-- ---- Xena, outside the league: sees nothing of it --------------------------------------------
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000c';
select pg_temp.expect_count($$select 1 from public.leagues$$, 0, 'an outsider seeing the league');
select pg_temp.expect_count($$select 1 from public.league_members$$, 0, 'an outsider seeing its members');
select pg_temp.expect_count(format($$select 1 from public.league_standings((select id from public.leagues limit 1))$$), 0,
  'an outsider reading its standings');
select pg_temp.refused($$select public.join_league('WRONG123')$$, 'joining with a wrong code');
-- Even knowing the league's id, adding yourself straight to the members table is refused.
select pg_temp.refused(format($$insert into public.league_members (league_id, user_id) values (%L, '00000000-0000-0000-0000-00000000000c')$$, :'league'),
  'joining by writing the membership table directly');

-- ---- Fred joins with the code (any case, twice is fine) ----------------------------------------
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
select public.join_league(lower(:'code'));
select public.join_league(:'code');
select pg_temp.expect_count($$select 1 from public.league_members$$, 2, 'Fred seeing both members');
insert into public.picks (user_id, bout_id, winner) values ('00000000-0000-0000-0000-00000000000b', 'lg-open:x:y', 'y');
-- Before the lock, league-mates can't see each other's picks (no copying).
select pg_temp.expect_count($$select 1 from public.picks$$, 1, 'Fred seeing only his own pick before the lock');
update public.leagues set name = 'Fred''s now' where name = 'Gym boys';
select pg_temp.expect_count($$select 1 from public.leagues where name = 'Gym boys'$$, 1, 'the league name after Fred''s rename attempt');
-- Only the owner can delete a league: Fred's delete (directly, or by "leaving" as if he owned it)
-- removes nothing but his own membership.
delete from public.leagues where name = 'Gym boys';
select pg_temp.expect_count($$select 1 from public.leagues where name = 'Gym boys'$$, 1, 'the league after Fred tried to delete it');

-- ---- After the lock: league-mates see each other's picks; outsiders still don't -----------------
reset role;
update public.events set locks_at = now() - interval '1 minute' where id = 'lg-open';
insert into public.scores (user_id, event_id, correct, picked, points) values
  ('00000000-0000-0000-0000-00000000000a', 'lg-open', 1, 1, 1);
set role authenticated;
select pg_temp.expect_count($$select 1 from public.picks$$, 2, 'Fred seeing Olga''s pick after the lock');
select pg_temp.expect_count(format($$select 1 from public.league_standings(%L) where display_name = 'olga' and points = 1$$,
  (select id from public.leagues limit 1)), 1, 'the league standings');
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000c';
select pg_temp.expect_count($$select 1 from public.picks$$, 0, 'an outsider seeing league picks after the lock');

-- ---- Fred leaves; Olga (the owner) leaving deletes the league --------------------------------------
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
select public.leave_league(id) from public.leagues;
select pg_temp.expect_count($$select 1 from public.leagues$$, 0, 'Fred seeing the league after leaving');
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
select public.leave_league(id) from public.leagues;
reset role;
select pg_temp.expect_count($$select 1 from public.leagues where name = 'Gym boys'$$, 0, 'the league after its owner left');

\echo 'All league tests passed.'
