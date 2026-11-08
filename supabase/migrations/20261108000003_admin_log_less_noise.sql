-- The admin panel's log: the sync now runs every few minutes and leaves a line each time, which
-- would push results and data refreshes out of view. Keep only the latest sync line in the view
-- (enough to see it's alive); the table itself still has them all.

create or replace function public.admin_log(max_rows int default 100)
returns table (at timestamptz, kind text, event_id text, detail text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.require_admin();
  return query
    select l.at, l.kind, l.event_id, l.detail
    from public.pickem_log l
    where l.kind <> 'sync' or l.id = (select max(s.id) from public.pickem_log s where s.kind = 'sync')
    order by l.at desc
    limit least(max_rows, 500);
end;
$$;
