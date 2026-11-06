-- What changed on Pick'em lately (written by the database itself, see the pickem_log migration).

select at at time zone 'Europe/Berlin' as at_berlin, kind, event_id, detail
from public.pickem_log
order by at desc
limit 100;

-- Only results and corrections:
-- select at at time zone 'Europe/Berlin', detail from public.pickem_log where kind in ('result', 'result changed') order by at desc;
