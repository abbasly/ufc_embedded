-- Card packs: free packs of 3 random fighters, earned by playing and never sold. One pack per
-- card played, plus a bonus for finishing in the top 3 and for winning a league title.
--
-- The draw happens here, so a browser can't choose what it gets. Everything goes through these
-- functions: the tables themselves are closed to the API roles.
--
-- Odds per card: Legendary 1.5%, Epic 6.5%, Rare 22%, Common 70%, and the third card of a pack
-- is always Rare or better. The site shows the same odds (src/features/collection/packs.ts).

-- Every fighter who can be drawn. Kept up to date by the sync (pickem_sync.py).
create table public.card_pool (
  fighter_id text primary key,
  name text not null,
  rarity text not null check (rarity in ('common', 'rare', 'epic', 'legendary'))
);
create index card_pool_rarity on public.card_pool (rarity);

-- No foreign key to events: a player keeps their cards if a card is ever removed.
create table public.packs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  event_id text not null,
  reason text not null check (reason in ('played', 'podium', 'league')),
  created_at timestamptz not null default now(),
  opened_at timestamptz,
  unique (user_id, event_id, reason)
);

-- Name and rarity as they were when drawn: a champion pulled today stays Legendary.
create table public.pack_cards (
  pack_id uuid not null references public.packs (id) on delete cascade,
  slot smallint not null,
  fighter_id text not null,
  name text not null,
  rarity text not null check (rarity in ('common', 'rare', 'epic', 'legendary')),
  primary key (pack_id, slot)
);

alter table public.card_pool enable row level security;
alter table public.packs enable row level security;
alter table public.pack_cards enable row level security;
revoke all on public.card_pool, public.packs, public.pack_cards from anon, authenticated;

-- Hands out the packs the caller has earned so far, and lists the ones still to open.
create function public.claim_packs()
returns table (id uuid, event_id text, event_name text, reason text)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  me uuid := auth.uid();
begin
  if me is null then
    raise exception 'sign in first' using errcode = '42501';
  end if;

  insert into public.packs (user_id, event_id, reason)
  select me, s.event_id, 'played'
  from public.scores s
  join public.events e on e.id = s.event_id and e.scored_at is not null
  where s.user_id = me and s.picked > 0
  on conflict (user_id, event_id, reason) do nothing;

  insert into public.packs (user_id, event_id, reason)
  select me, r.event_id, 'podium'
  from (
    select s.event_id, s.user_id, s.points,
           rank() over (partition by s.event_id order by s.points desc) as place
    from public.scores s
    join public.events e on e.id = s.event_id and e.scored_at is not null
  ) r
  where r.user_id = me and r.place <= 3 and r.points > 0
  on conflict (user_id, event_id, reason) do nothing;

  -- One bonus per card, however many leagues were won on it.
  insert into public.packs (user_id, event_id, reason)
  select distinct me, t.event_id, 'league'
  from public.league_titles(me) t
  on conflict (user_id, event_id, reason) do nothing;

  return query
    select p.id, p.event_id, coalesce(e.name, 'A past card'), p.reason
    from public.packs p
    left join public.events e on e.id = p.event_id
    where p.user_id = me and p.opened_at is null
    order by p.created_at, p.reason;
end;
$$;

-- Opens one of the caller's packs and returns its cards. Opening it again returns the same cards.
create function public.open_pack(pack uuid)
returns table (slot smallint, fighter_id text, name text, rarity text)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  me uuid := auth.uid();
  owned public.packs;
  drawn public.card_pool;
  roll double precision;
  tier text;
begin
  select * into owned from public.packs p where p.id = open_pack.pack and p.user_id = me for update;
  if not found then
    raise exception 'no such pack' using errcode = 'P0002';
  end if;

  if owned.opened_at is null then
    if not exists (select 1 from public.card_pool) then
      raise exception 'the cards are not ready yet' using errcode = '55000';
    end if;
    for n in 1..3 loop
      roll := random();
      tier := case
        when roll < 0.015 then 'legendary'
        when roll < 0.08 then 'epic'
        when roll < 0.30 then 'rare'
        else 'common'
      end;
      if n = 3 and tier = 'common' then
        tier := 'rare';
      end if;

      select * into drawn from public.card_pool c
      where c.rarity = tier
        and c.fighter_id not in (select pc.fighter_id from public.pack_cards pc where pc.pack_id = owned.id)
      order by random() limit 1;
      if not found then
        select * into drawn from public.card_pool c
        where c.fighter_id not in (select pc.fighter_id from public.pack_cards pc where pc.pack_id = owned.id)
        order by random() limit 1;
      end if;
      if found then
        insert into public.pack_cards (pack_id, slot, fighter_id, name, rarity)
        values (owned.id, n, drawn.fighter_id, drawn.name, drawn.rarity);
      end if;
    end loop;
    update public.packs p set opened_at = now() where p.id = owned.id;
  end if;

  return query
    select c.slot, c.fighter_id, c.name, c.rarity
    from public.pack_cards c
    where c.pack_id = owned.id
    order by c.slot;
end;
$$;

-- The cards a player has pulled. Public, like the rest of a profile: they're random, so they say
-- nothing about the player's picks.
create function public.pack_cards_of(player uuid)
returns table (fighter_id text, name text, rarity text, copies bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select c.fighter_id, max(c.name), c.rarity, count(*)
  from public.pack_cards c
  join public.packs p on p.id = c.pack_id
  where p.user_id = pack_cards_of.player
  group by c.fighter_id, c.rarity;
$$;

revoke all on function public.claim_packs(), public.open_pack(uuid), public.pack_cards_of(uuid) from public, anon;
grant execute on function public.claim_packs(), public.open_pack(uuid) to authenticated;
grant execute on function public.pack_cards_of(uuid) to anon, authenticated;
