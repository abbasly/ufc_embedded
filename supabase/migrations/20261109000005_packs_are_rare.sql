-- Packs become a prize, so collections fill up slowly. Calling winners already earns cards; a pack
-- now takes a top 3 finish or winning a real league, at most one per card. Everyone gets one
-- welcome pack: a single card, Rare or better. Packs already handed out stay.

alter table public.packs
  drop constraint packs_reason_check,
  add constraint packs_reason_check check (reason in ('played', 'podium', 'league', 'welcome'));

create or replace function public.claim_packs()
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
  select me, 'welcome', 'welcome'
  from public.profiles p
  where p.id = me
  on conflict (user_id, event_id, reason) do nothing;

  insert into public.packs (user_id, event_id, reason)
  select me, r.event_id, 'podium'
  from (
    select s.event_id, s.user_id, s.points,
           rank() over (partition by s.event_id order by s.points desc) as place
    from public.scores s
    join public.events e on e.id = s.event_id and e.scored_at is not null
  ) r
  where r.user_id = me
    and r.place <= 3
    and r.points > 0
    and not exists (select 1 from public.packs p where p.user_id = me and p.event_id = r.event_id)
  on conflict (user_id, event_id, reason) do nothing;

  -- A real league: at least 3 members played, and only those in it before the card locked count.
  insert into public.packs (user_id, event_id, reason)
  select distinct me, s.event_id, 'league'
  from public.league_members mine
  join public.scores s on s.user_id = me
  join public.events e on e.id = s.event_id and e.scored_at is not null
  where mine.user_id = me
    and s.points > 0
    and mine.joined_at < e.locks_at
    and not exists (select 1 from public.packs p where p.user_id = me and p.event_id = s.event_id)
    and (
      select count(*)
      from public.league_members other
      join public.scores theirs on theirs.user_id = other.user_id and theirs.event_id = s.event_id
      where other.league_id = mine.league_id and other.joined_at < e.locks_at
    ) >= 3
    and not exists (
      select 1
      from public.league_members other
      join public.scores theirs on theirs.user_id = other.user_id and theirs.event_id = s.event_id
      where other.league_id = mine.league_id and other.joined_at < e.locks_at and theirs.points > s.points
    )
  on conflict (user_id, event_id, reason) do nothing;

  return query
    select p.id, p.event_id,
           coalesce(e.name, case when p.reason = 'welcome' then 'Welcome' else 'A past card' end),
           p.reason
    from public.packs p
    left join public.events e on e.id = p.event_id
    where p.user_id = me and p.opened_at is null
    order by p.created_at, p.reason;
end;
$$;

-- As before, except that a welcome pack holds one card. The last card of any pack is Rare or better.
create or replace function public.open_pack(pack uuid)
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
  size int;
begin
  select * into owned from public.packs p where p.id = open_pack.pack and p.user_id = me for update;
  if not found then
    raise exception 'no such pack' using errcode = 'P0002';
  end if;

  if owned.opened_at is null then
    if not exists (select 1 from public.card_pool) then
      raise exception 'the cards are not ready yet' using errcode = '55000';
    end if;
    size := case when owned.reason = 'welcome' then 1 else 3 end;
    for n in 1..size loop
      roll := random();
      tier := case
        when roll < 0.015 then 'legendary'
        when roll < 0.08 then 'epic'
        when roll < 0.30 then 'rare'
        else 'common'
      end;
      if n = size and tier = 'common' then
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
