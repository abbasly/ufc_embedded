-- Test helpers shared by the *_test.sql files (included with \ir). They live in pg_temp, so
-- each test file's session gets its own copy.

-- Expect the statement to be refused by row level security (or a check), else fail the run.
create function pg_temp.refused(statement text, what text) returns void language plpgsql as $$
begin
  execute statement;
  raise exception 'TEST FAILED: % was allowed', what;
exception
  when insufficient_privilege or check_violation or foreign_key_violation or unique_violation or no_data_found then null;
end $$;
-- Expect a query's row count.
create function pg_temp.expect_count(query text, expected int, what text) returns void language plpgsql as $$
declare n int;
begin
  execute format('select count(*) from (%s) q', query) into n;
  if n <> expected then raise exception 'TEST FAILED: % (got %, expected %)', what, n, expected; end if;
end $$;
grant execute on all functions in schema pg_temp to anon, authenticated;
