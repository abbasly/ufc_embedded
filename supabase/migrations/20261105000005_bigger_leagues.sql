-- Bigger leagues: up to 1000 members (100 was fine for friends, not for a subreddit's league).
-- Everything else about joining is unchanged.

create or replace function public.join_league(code text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  league uuid;
begin
  if auth.uid() is null then
    raise exception 'sign in first' using errcode = '42501';
  end if;
  select id into league from public.leagues where invite_code = upper(btrim(code));
  if league is null then
    raise exception 'no league with that invite code' using errcode = 'P0002';
  end if;
  if (select count(*) from public.league_members where league_id = league) >= 1000 then
    raise exception 'this league is full (1000 members)' using errcode = '23514';
  end if;
  insert into public.league_members (league_id, user_id) values (league, auth.uid())
    on conflict do nothing;
  return league;
end;
$$;
