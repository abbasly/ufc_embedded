-- Up to 5 leagues of your own (was 10). Anyone already over keeps theirs; they just can't make more.
-- Everything else about creating a league is unchanged.

create or replace function public.create_league(league_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_id uuid;
begin
  if auth.uid() is null then
    raise exception 'sign in first' using errcode = '42501';
  end if;
  if (select count(*) from public.leagues where owner_id = auth.uid()) >= 5 then
    raise exception 'you can own up to 5 leagues' using errcode = '23514';
  end if;
  insert into public.leagues (name, owner_id) values (btrim(league_name), auth.uid()) returning id into new_id;
  insert into public.league_members (league_id, user_id) values (new_id, auth.uid());
  return new_id;
end;
$$;
