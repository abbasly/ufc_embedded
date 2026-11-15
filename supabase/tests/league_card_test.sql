-- A league's latest card: its members' points on it and the model's, members who didn't play
-- it last, and only members can see it. Run with supabase/tests/run.sh.

\set ON_ERROR_STOP 1
\set QUIET 1
\o /dev/null
\ir helpers.sql

insert into auth.users (id) values
  ('00000000-0000-0000-0000-000000000071'),
  ('00000000-0000-0000-0000-000000000072'),
  ('00000000-0000-0000-0000-000000000073'),
  ('00000000-0000-0000-0000-000000000074'),
  ('00000000-0000-0000-0000-000000000075');
-- The model's account, unless another test file already made it (display names are unique).
insert into public.profiles (id, display_name)
select '00000000-0000-0000-0000-000000000075', 'the_model'
where not exists (select 1 from public.profiles where display_name = 'the_model');
insert into public.profiles (id, display_name) values
  ('00000000-0000-0000-0000-000000000071', 'lc_ann'),
  ('00000000-0000-0000-0000-000000000072', 'lc_bob'),
  ('00000000-0000-0000-0000-000000000073', 'lc_cat'),
  ('00000000-0000-0000-0000-000000000074', 'lc_out');
insert into public.events (id, name, starts_on, locks_at, scored_at) values
  ('lc-old', 'Older card', current_date - 14, now() - interval '14 days', now()),
  ('lc-new', 'Newest card', current_date - 1, now() - interval '1 day', null),
  ('lc-none', 'Only an outsider played', current_date, now() - interval '1 hour', null);
insert into public.leagues (id, name, owner_id) values
  ('00000000-0000-0000-0000-000000000079', 'Card league', '00000000-0000-0000-0000-000000000071');
insert into public.league_members (league_id, user_id) values
  ('00000000-0000-0000-0000-000000000079', '00000000-0000-0000-0000-000000000071'),
  ('00000000-0000-0000-0000-000000000079', '00000000-0000-0000-0000-000000000072'),
  ('00000000-0000-0000-0000-000000000079', '00000000-0000-0000-0000-000000000073');
insert into public.scores (user_id, event_id, correct, picked, points) values
  ('00000000-0000-0000-0000-000000000071', 'lc-old', 3, 3, 50),
  ('00000000-0000-0000-0000-000000000071', 'lc-new', 1, 2, 11),
  ('00000000-0000-0000-0000-000000000072', 'lc-new', 2, 2, 25),
  ((select id from public.profiles where display_name = 'the_model'), 'lc-new', 1, 2, 15),
  ('00000000-0000-0000-0000-000000000074', 'lc-none', 4, 4, 80);

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000071';
select pg_temp.expect_count($$select 1 from public.league_card_standings('00000000-0000-0000-0000-000000000079')
  where event_id = 'lc-new' and event_name = 'Newest card' and not scored$$, 4,
  'the newest card a member played (not one only an outsider played), live: 3 members and the model');
select pg_temp.expect_count($$select 1 from (select display_name, row_number() over () as n
  from public.league_card_standings('00000000-0000-0000-0000-000000000079')) t
  where (display_name, n) in (('lc_bob', 1), ('the_model', 2), ('lc_ann', 3), ('lc_cat', 4))$$, 4,
  'best first, the model among them, a member who didn''t play last');
select pg_temp.expect_count($$select 1 from public.league_card_standings('00000000-0000-0000-0000-000000000079')
  where display_name = 'lc_cat' and not played and points = 0$$, 1, 'a member who didn''t play: listed, not played');
select pg_temp.expect_count($$select 1 from public.league_card_standings('00000000-0000-0000-0000-000000000079')
  where display_name = 'lc_out'$$, 0, 'outsiders are not on it');
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000074';
select pg_temp.expect_count($$select 1 from public.league_card_standings('00000000-0000-0000-0000-000000000079')$$, 0,
  'someone outside the league sees nothing');
reset role;

\echo 'All league card tests passed.'
