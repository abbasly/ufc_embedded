-- Friends: mutual, like a friend request. One player asks, the other accepts. Friends get the
-- same view of each other as league-mates: who has picked a bout before the lock, whom after it,
-- and a leaderboard of just them.
--
-- Rows are only read and written through the functions below, so the rules (no friending
-- yourself, accepting only requests made to you, one row per pair) live in one place.

create table public.friendships (
  requester uuid not null references public.profiles (id) on delete cascade,
  addressee uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  primary key (requester, addressee),
  check (requester <> addressee)
);
-- One row per pair, whichever way round it was asked.
create unique index friendships_pair on public.friendships (least(requester, addressee), greatest(requester, addressee));
create index friendships_addressee on public.friendships (addressee);

alter table public.friendships enable row level security;

-- Each side of a friendship (or request) can see it; nobody writes it directly.
create policy "both sides see their friendships" on public.friendships
  for select to authenticated using (auth.uid() in (requester, addressee));

-- Whether the caller and ``other`` are friends (accepted).
create function public.are_friends(other uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.friendships
    where status = 'accepted'
      and ((requester = auth.uid() and addressee = other) or (requester = other and addressee = auth.uid()))
  );
$$;

-- Ask ``other`` to be friends. If they already asked you, this accepts their request instead.
create function public.friend_request(other uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'sign in first' using errcode = '42501';
  end if;
  if other = auth.uid() then
    raise exception 'that''s you' using errcode = '23514';
  end if;
  update public.friendships set status = 'accepted'
    where requester = other and addressee = auth.uid() and status = 'pending';
  if found then
    return 'accepted';
  end if;
  if (select count(*) from public.friendships where requester = auth.uid() and status = 'pending') >= 100 then
    raise exception 'too many open friend requests' using errcode = '23514';
  end if;
  insert into public.friendships (requester, addressee) values (auth.uid(), other)
    on conflict do nothing;
  return 'requested';
end;
$$;

-- Accept a request someone made to you.
create function public.friend_accept(other uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.friendships set status = 'accepted'
  where requester = other and addressee = auth.uid() and status = 'pending';
$$;

-- Unfriend, decline a request, or take back your own: whatever is between you and ``other``.
create function public.friend_remove(other uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.friendships
  where (requester = auth.uid() and addressee = other) or (requester = other and addressee = auth.uid());
$$;

-- Your friends and open requests, with names and pictures. ``status``: 'friends', 'incoming'
-- (they asked you) or 'outgoing' (you asked them).
create function public.my_friends()
returns table (user_id uuid, display_name text, avatar text, status text)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.display_name, p.avatar,
         case when f.status = 'accepted' then 'friends'
              when f.addressee = auth.uid() then 'incoming'
              else 'outgoing' end
  from public.friendships f
  join public.profiles p on p.id = case when f.requester = auth.uid() then f.addressee else f.requester end
  where auth.uid() in (f.requester, f.addressee)
  order by 4, p.display_name;
$$;

-- You and your friends, with points over all scored events (0 if none yet).
create function public.friends_standings()
returns table (display_name text, points bigint, correct bigint, picked bigint, events bigint, avatar text)
language sql
stable
security definer
set search_path = ''
as $$
  with circle as (
    select auth.uid() as id where auth.uid() is not null
    union
    select case when requester = auth.uid() then addressee else requester end
    from public.friendships
    where status = 'accepted' and auth.uid() in (requester, addressee)
  )
  select p.display_name,
         coalesce(sum(s.points), 0), coalesce(sum(s.correct), 0), coalesce(sum(s.picked), 0),
         count(s.event_id), p.avatar
  from circle c
  join public.profiles p on p.id = c.id
  left join public.scores s on s.user_id = c.id
  group by p.id, p.display_name, p.avatar
  order by 2 desc, 3 desc, p.display_name;
$$;

-- Friends see each other's picks once a card has locked, like league-mates.
create policy "friends see picks after the lock" on public.picks
  for select to authenticated
  using (not public.bout_is_open(bout_id) and public.are_friends(user_id));

-- Who has picked a bout (not whom), now for friends as well as league-mates.
create or replace function public.mates_who_picked(event text)
returns table (bout_id text, display_name text, avatar text)
language sql
stable
security definer
set search_path = ''
as $$
  select p.bout_id, pr.display_name, pr.avatar
  from public.picks p
  join public.bouts b on b.id = p.bout_id
  join public.profiles pr on pr.id = p.user_id
  where b.event_id = event and p.user_id <> auth.uid()
    and (public.shares_league_with(p.user_id) or public.are_friends(p.user_id));
$$;

revoke all on function public.are_friends(uuid), public.friend_request(uuid), public.friend_accept(uuid),
  public.friend_remove(uuid), public.my_friends(), public.friends_standings() from public, anon;
grant execute on function public.are_friends(uuid), public.friend_request(uuid), public.friend_accept(uuid),
  public.friend_remove(uuid), public.my_friends(), public.friends_standings() to authenticated;
