-- An admin panel for the site's owner: stats, the list of players, the change log. Admins are
-- listed in public.admins, which only the database owner writes (SQL editor or CLI):
--
--   insert into public.admins (user_id) select id from auth.users where email = 'you@example.com';
--
-- Every admin function checks is_admin() first and refuses anyone else, so opening /admin
-- without being an admin shows nothing: the database won't hand the data over.

create table public.admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  added_at timestamptz not null default now()
);
alter table public.admins enable row level security;
revoke all on public.admins from anon, authenticated;

create function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;

create function public.require_admin()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'admins only' using errcode = '42501';
  end if;
end;
$$;

-- Numbers for the top of the panel.
create function public.admin_overview()
returns table (metric text, value bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.require_admin();
  return query
    select 'accounts', count(*) from auth.users
    union all select 'with a display name', count(*) from public.profiles
    union all select 'new today', count(*) from auth.users where created_at > now() - interval '1 day'
    union all select 'new this week', count(*) from auth.users where created_at > now() - interval '7 days'
    union all select 'signed in this week', count(*) from auth.users where last_sign_in_at > now() - interval '7 days'
    union all select 'players with a pick', count(distinct user_id) from public.picks
    union all select 'picks', count(*) from public.picks
    union all select 'leagues', count(*) from public.leagues
    union all select 'friendships', count(*) from public.friendships where status = 'accepted'
    union all select 'cards scored', count(*) from public.events where scored_at is not null
    union all select 'results emails sent', count(*) from public.results_email_notices
    union all select 'friend-request emails sent', count(*) from public.friend_request_notices;
end;
$$;

-- Every account, with what they've done.
create function public.admin_users()
returns table (
  user_id uuid, display_name text, email text, provider text, created_at timestamptz,
  last_sign_in_at timestamptz, picks bigint, points bigint, leagues bigint, friends bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.require_admin();
  return query
    select u.id, p.display_name, u.email::text,
           coalesce(u.raw_app_meta_data ->> 'provider', 'email'),
           u.created_at, u.last_sign_in_at,
           (select count(*) from public.picks k where k.user_id = u.id),
           (select coalesce(sum(s.points), 0)::bigint from public.scores s where s.user_id = u.id),
           (select count(*) from public.league_members m where m.user_id = u.id),
           (select count(*) from public.friendships f where f.status = 'accepted' and u.id in (f.requester, f.addressee))
    from auth.users u
    left join public.profiles p on p.id = u.id
    order by u.created_at desc;
end;
$$;

-- The latest changes to cards and results (pickem_log).
create function public.admin_log(max_rows int default 100)
returns table (at timestamptz, kind text, event_id text, detail text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.require_admin();
  return query
    select l.at, l.kind, l.event_id, l.detail from public.pickem_log l order by l.at desc limit least(max_rows, 500);
end;
$$;

revoke all on function public.is_admin(), public.require_admin(), public.admin_overview(), public.admin_users(),
  public.admin_log(int) from public, anon;
grant execute on function public.is_admin(), public.admin_overview(), public.admin_users(), public.admin_log(int)
  to authenticated;
