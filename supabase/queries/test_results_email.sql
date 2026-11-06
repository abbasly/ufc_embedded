-- Try the results email on yourself: a test card dated a month ago (so it never shows on the
-- Pick'em page), one fight with your pick on it, then scored. Scoring sets events.scored_at, the
-- webhook fires, and your results email should arrive within a minute.
--
-- 1. Put your display name in the line below, run this whole file in the SQL editor.
-- 2. Check your inbox (and Edge Functions -> results-email -> Logs: "sent 1 of 1").
-- 3. Run the clean-up at the bottom.

begin;
insert into public.events (id, name, starts_on, locks_at)
values ('test-results-email', 'UFC Test Night: Email vs. Inbox', current_date - 30, now() - interval '1 day');
insert into public.bouts (id, event_id, position, fighter_a, fighter_b, a_name, b_name, market_p_a, segment)
values ('test-results-email:ilia-topuria:islam-makhachev', 'test-results-email', 1,
        'ilia-topuria', 'islam-makhachev', 'Ilia Topuria', 'Islam Makhachev', 0.4, 'main');
insert into public.picks (user_id, bout_id, winner, method)
select id, 'test-results-email:ilia-topuria:islam-makhachev', 'ilia-topuria', 'KO/TKO'
from public.profiles where display_name = 'YOUR_DISPLAY_NAME';
update public.bouts set outcome = 'win', winner = 'ilia-topuria', method = 'KO/TKO'
where id = 'test-results-email:ilia-topuria:islam-makhachev';
select public.score_event('test-results-email');
commit;

-- Clean-up (removes the card, the pick, the score and the "already emailed" note):
-- delete from public.events where id = 'test-results-email';
