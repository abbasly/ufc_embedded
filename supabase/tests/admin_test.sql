-- Admin panel tests: only listed admins get the stats and the list of players; everyone else
-- (players, visitors) is refused. Run with supabase/tests/run.sh.

\set ON_ERROR_STOP 1
\set QUIET 1
\o /dev/null

insert into auth.users (id, email, raw_app_meta_data) values
  ('00000000-0000-0000-0000-00000000ad01', 'boss@example.com', '{"provider": "google"}'),
  ('00000000-0000-0000-0000-00000000ad02', 'player@example.com', '{"provider": "email"}');
insert into public.profiles (id, display_name) values
  ('00000000-0000-0000-0000-00000000ad01', 'boss'),
  ('00000000-0000-0000-0000-00000000ad02', 'player');
insert into public.admins (user_id) values ('00000000-0000-0000-0000-00000000ad01');

\ir helpers.sql

-- ---- A player: no admin data, can't make themselves admin ------------------------------------------
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000ad02';
select pg_temp.refused($$select * from public.admin_users()$$, 'a player listing all accounts');
select pg_temp.refused($$select * from public.admin_overview()$$, 'a player reading the admin stats');
select pg_temp.refused($$select * from public.admin_log()$$, 'a player reading the admin log');
select pg_temp.refused($$insert into public.admins (user_id) values ('00000000-0000-0000-0000-00000000ad02')$$, 'a player making themselves admin');
select pg_temp.refused($$select 1 from public.admins$$, 'a player reading who the admins are');
select pg_temp.expect_count($$select 1 where not public.is_admin()$$, 1, 'a player not being admin');

-- ---- A visitor: not even the check ------------------------------------------------------------------
set role anon;
reset request.jwt.claim.sub;
select pg_temp.refused($$select * from public.admin_users()$$, 'a visitor listing all accounts');
select pg_temp.refused($$select public.is_admin()$$, 'a visitor asking whether they''re admin');

-- ---- The admin: everything ----------------------------------------------------------------------------
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000ad01';
select pg_temp.expect_count($$select 1 where public.is_admin()$$, 1, 'the admin being admin');
select pg_temp.expect_count($$select 1 from public.admin_users() where email = 'player@example.com' and provider = 'email' and display_name = 'player'$$, 1,
  'the admin seeing a player''s account');
select pg_temp.expect_count($$select 1 from public.admin_overview() where metric = 'accounts' and value >= 2$$, 1, 'the admin stats');
select pg_temp.expect_count($$select 1 where (select count(*) from public.admin_log(5)) <= 5$$, 1, 'the admin log (at most 5 rows)');
reset role;

\echo 'All admin tests passed.'
