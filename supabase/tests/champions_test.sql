-- League champions: top of the league on a finished card, ties share it, and a league's name
-- and its list of champions stay with its members. Run with supabase/tests/run.sh.

\set ON_ERROR_STOP 1
\set QUIET 1
\o /dev/null
\ir helpers.sql

insert into auth.users (id) values
  ('00000000-0000-0000-0000-0000000000e1'),
  ('00000000-0000-0000-0000-0000000000e2'),
  ('00000000-0000-0000-0000-0000000000e3'),
  ('00000000-0000-0000-0000-0000000000e4');
insert into public.profiles (id, display_name) values
  ('00000000-0000-0000-0000-0000000000e1', 'ch_ann'),
  ('00000000-0000-0000-0000-0000000000e2', 'ch_bob'),
  ('00000000-0000-0000-0000-0000000000e3', 'ch_cat'),
  ('00000000-0000-0000-0000-0000000000e4', 'ch_out');
insert into public.events (id, name, starts_on, locks_at, scored_at) values
  ('ch-won', 'Ann wins', current_date - 30, now() - interval '30 days', now()),
  ('ch-tie', 'Ann and Bob tie', current_date - 20, now() - interval '20 days', now()),
  ('ch-solo', 'Only Ann played', current_date - 10, now() - interval '10 days', now()),
  ('ch-zero', 'Nobody scored', current_date - 5, now() - interval '5 days', now()),
  ('ch-live', 'Still being fought', current_date, now() - interval '1 hour', null);
insert into public.leagues (id, name, owner_id) values
  ('00000000-0000-0000-0000-0000000000e9', 'Secret gym', '00000000-0000-0000-0000-0000000000e1');
-- Ch_out plays the cards with the most points of anyone, but isn't in the league.
insert into public.league_members (league_id, user_id) values
  ('00000000-0000-0000-0000-0000000000e9', '00000000-0000-0000-0000-0000000000e1'),
  ('00000000-0000-0000-0000-0000000000e9', '00000000-0000-0000-0000-0000000000e2'),
  ('00000000-0000-0000-0000-0000000000e9', '00000000-0000-0000-0000-0000000000e3');
insert into public.scores (user_id, event_id, correct, picked, points) values
  ('00000000-0000-0000-0000-0000000000e1', 'ch-won', 3, 3, 40),
  ('00000000-0000-0000-0000-0000000000e2', 'ch-won', 2, 3, 20),
  ('00000000-0000-0000-0000-0000000000e4', 'ch-won', 3, 3, 90),
  ('00000000-0000-0000-0000-0000000000e1', 'ch-tie', 2, 3, 30),
  ('00000000-0000-0000-0000-0000000000e2', 'ch-tie', 2, 3, 30),
  ('00000000-0000-0000-0000-0000000000e3', 'ch-tie', 1, 3, 10),
  ('00000000-0000-0000-0000-0000000000e1', 'ch-solo', 2, 3, 30),
  ('00000000-0000-0000-0000-0000000000e1', 'ch-zero', 0, 3, 0),
  ('00000000-0000-0000-0000-0000000000e2', 'ch-zero', 0, 3, 0),
  ('00000000-0000-0000-0000-0000000000e1', 'ch-live', 2, 2, 25),
  ('00000000-0000-0000-0000-0000000000e2', 'ch-live', 1, 2, 10);

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000e1';
select pg_temp.expect_count($$select 1 from public.league_champions('00000000-0000-0000-0000-0000000000e9')$$, 3, 'three titles (a win and a shared one)');
select pg_temp.expect_count($$select 1 from public.league_champions('00000000-0000-0000-0000-0000000000e9') where event_id = 'ch-won' and display_name = 'ch_ann'$$, 1, 'the top member winning, though an outsider scored more');
select pg_temp.expect_count($$select 1 from public.league_champions('00000000-0000-0000-0000-0000000000e9') where event_id = 'ch-tie'$$, 2, 'a tie shared');
select pg_temp.expect_count($$select 1 from public.league_champions('00000000-0000-0000-0000-0000000000e9') where event_id in ('ch-solo', 'ch-zero', 'ch-live')$$, 0, 'no title alone, at 0 points or before the card is done');
select pg_temp.expect_count($$select 1 from public.league_titles('00000000-0000-0000-0000-0000000000e1')$$, 2, 'Ann having two titles');
select pg_temp.expect_count($$select 1 from public.league_titles('00000000-0000-0000-0000-0000000000e1') where league_name = 'Secret gym'$$, 2, 'a member seeing the league name');
select pg_temp.expect_count($$select 1 from public.league_titles('00000000-0000-0000-0000-0000000000e3')$$, 0, 'Cat having no titles');

-- An outsider: sees that the titles exist, but not the league or its champions.
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000e4';
select pg_temp.expect_count($$select 1 from public.league_champions('00000000-0000-0000-0000-0000000000e9')$$, 0, 'an outsider seeing a league''s champions');
select pg_temp.expect_count($$select 1 from public.league_titles('00000000-0000-0000-0000-0000000000e1') where league_name is null$$, 2, 'an outsider seeing titles without the league''s name');
reset role;

set role anon;
set request.jwt.claim.sub = '';
select pg_temp.expect_count($$select 1 from public.league_titles('00000000-0000-0000-0000-0000000000e1') where league_name is null$$, 2, 'a visitor seeing titles without the league''s name');
select pg_temp.refused($$select 1 from public.league_champions('00000000-0000-0000-0000-0000000000e9')$$, 'a visitor listing a league''s champions');
reset role;

\o
\echo All league champion tests passed.
