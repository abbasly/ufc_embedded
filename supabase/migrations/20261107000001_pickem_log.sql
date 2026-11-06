-- A record of what changes on Pick'em cards and when: events and bouts added or removed,
-- results coming in (and being corrected), events scored, and each sync run. Written by the
-- database itself (triggers), so it's complete whichever tool made the change. Private: only
-- the owner reads it (SQL editor, or supabase/queries/log.sql).

create table public.pickem_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  kind text not null,      -- 'sync', 'event added', 'scored', 'bout added', 'bout removed', 'result', 'result changed'
  event_id text,
  bout_id text,
  detail text
);
create index pickem_log_at on public.pickem_log (at desc);
alter table public.pickem_log enable row level security;
revoke all on public.pickem_log from anon, authenticated;

create function public.log_bout_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  rec public.bouts := coalesce(new, old);
  matchup text := rec.a_name || ' vs ' || rec.b_name;
  result text;
begin
  if tg_op = 'INSERT' then
    insert into public.pickem_log (kind, event_id, bout_id, detail) values ('bout added', rec.event_id, rec.id, matchup);
  elsif tg_op = 'DELETE' then
    insert into public.pickem_log (kind, event_id, bout_id, detail) values ('bout removed', rec.event_id, rec.id, matchup);
  elsif (old.outcome, old.winner, old.method) is distinct from (new.outcome, new.winner, new.method) then
    result := case
      when new.outcome is null then 'no result'
      when new.outcome = 'draw' then 'draw'
      when new.outcome = 'nc' then 'no contest'
      else (case when new.winner = new.fighter_a then new.a_name else new.b_name end) || ' by ' || coalesce(new.method, 'other')
    end;
    insert into public.pickem_log (kind, event_id, bout_id, detail)
    values (case when old.outcome is null then 'result' else 'result changed' end, new.event_id, new.id,
            matchup || ': ' || result);
  end if;
  return null;
end;
$$;

create trigger bouts_log after insert or update or delete on public.bouts
  for each row execute function public.log_bout_change();

create function public.log_event_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.pickem_log (kind, event_id, detail) values ('event added', new.id, new.name);
  elsif old.scored_at is distinct from new.scored_at and new.scored_at is not null then
    insert into public.pickem_log (kind, event_id, detail)
    values ('scored', new.id, (select count(*) || ' players scored' from public.scores where event_id = new.id));
  end if;
  return null;
end;
$$;

create trigger events_log after insert or update on public.events
  for each row execute function public.log_event_change();

revoke all on function public.log_bout_change(), public.log_event_change() from public, anon, authenticated;
