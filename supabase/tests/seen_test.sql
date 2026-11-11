-- What a player has seen: their own to read and add to, nobody else's. Run with
-- supabase/tests/run.sh.

\set ON_ERROR_STOP 1
\set QUIET 1
\o /dev/null
\ir helpers.sql

insert into auth.users (id) values
  ('00000000-0000-0000-0000-00000000dd01'),
  ('00000000-0000-0000-0000-00000000dd02');
insert into public.profiles (id, display_name) values
  ('00000000-0000-0000-0000-00000000dd01', 'seen_a'),
  ('00000000-0000-0000-0000-00000000dd02', 'seen_b');

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000dd01';
insert into public.seen (user_id, item) values ('00000000-0000-0000-0000-00000000dd01', 'card:petr-yan');
insert into public.seen (user_id, item) values ('00000000-0000-0000-0000-00000000dd01', 'card:petr-yan') on conflict do nothing;
select pg_temp.expect_count($$select 1 from public.seen$$, 1, 'your own, once');
select pg_temp.refused($$insert into public.seen (user_id, item) values ('00000000-0000-0000-0000-00000000dd02', 'card:x')$$, 'marking something seen for someone else');
select pg_temp.refused($$delete from public.seen$$, 'deleting');

set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000dd02';
select pg_temp.expect_count($$select 1 from public.seen$$, 0, 'someone else''s');
reset role;

set role anon;
set request.jwt.claim.sub = '';
select pg_temp.refused($$select 1 from public.seen$$, 'a visitor reading it');
reset role;

\o
\echo All seen tests passed.
