-- Card packs: who earns what, that the draw can't be repeated or done for someone else, and that
-- the tables stay closed. Run with supabase/tests/run.sh.

\set ON_ERROR_STOP 1
\set QUIET 1
\o /dev/null
\ir helpers.sql

insert into auth.users (id) values
  ('00000000-0000-0000-0000-00000000cc01'),
  ('00000000-0000-0000-0000-00000000cc02'),
  ('00000000-0000-0000-0000-00000000cc03'),
  ('00000000-0000-0000-0000-00000000cc04'),
  ('00000000-0000-0000-0000-00000000cc05'),
  ('00000000-0000-0000-0000-00000000cc11'),
  ('00000000-0000-0000-0000-00000000cc12'),
  ('00000000-0000-0000-0000-00000000cc13');
insert into public.profiles (id, display_name) values
  ('00000000-0000-0000-0000-00000000cc01', 'pk_win'),
  ('00000000-0000-0000-0000-00000000cc02', 'pk_b'),
  ('00000000-0000-0000-0000-00000000cc03', 'pk_c'),
  ('00000000-0000-0000-0000-00000000cc04', 'pk_d'),
  ('00000000-0000-0000-0000-00000000cc05', 'pk_none'),
  ('00000000-0000-0000-0000-00000000cc11', 'pk_x'),
  ('00000000-0000-0000-0000-00000000cc12', 'pk_y'),
  ('00000000-0000-0000-0000-00000000cc13', 'pk_z');
insert into public.events (id, name, starts_on, locks_at, scored_at) values
  ('pk-done', 'Finished card', current_date - 7, now() - interval '7 days', now()),
  ('pk-part', 'Only partly picked', current_date - 3, now() - interval '3 days', now()),
  ('pk-lg', 'Won the league only', current_date - 2, now() - interval '2 days', now()),
  ('pk-live', 'Still being fought', current_date, now() - interval '1 hour', null);
insert into public.bouts (id, event_id, position, fighter_a, fighter_b, a_name, b_name, segment, outcome, winner) values
  ('pk-part:a:b', 'pk-part', 1, 'a', 'b', 'A', 'B', 'main', 'win', 'a'),
  ('pk-part:c:d', 'pk-part', 2, 'c', 'd', 'C', 'D', 'main', 'win', 'c');
insert into public.leagues (id, name, owner_id) values
  ('00000000-0000-0000-0000-00000000cc09', 'Packers', '00000000-0000-0000-0000-00000000cc01'),
  ('00000000-0000-0000-0000-00000000cc08', 'Too small', '00000000-0000-0000-0000-00000000cc03'),
  ('00000000-0000-0000-0000-00000000cc07', 'Started after the results', '00000000-0000-0000-0000-00000000cc02');
-- Packers: a real league, pk_win tops it. Too small: pk_c tops it, but only 2 played. Started
-- after the results: pk_b tops it, but nobody was in it before the card locked.
insert into public.league_members (league_id, user_id, joined_at) values
  ('00000000-0000-0000-0000-00000000cc09', '00000000-0000-0000-0000-00000000cc01', now() - interval '30 days'),
  ('00000000-0000-0000-0000-00000000cc09', '00000000-0000-0000-0000-00000000cc03', now() - interval '30 days'),
  ('00000000-0000-0000-0000-00000000cc09', '00000000-0000-0000-0000-00000000cc04', now() - interval '30 days'),
  ('00000000-0000-0000-0000-00000000cc08', '00000000-0000-0000-0000-00000000cc03', now() - interval '30 days'),
  ('00000000-0000-0000-0000-00000000cc08', '00000000-0000-0000-0000-00000000cc04', now() - interval '30 days'),
  ('00000000-0000-0000-0000-00000000cc07', '00000000-0000-0000-0000-00000000cc02', now()),
  ('00000000-0000-0000-0000-00000000cc07', '00000000-0000-0000-0000-00000000cc03', now()),
  ('00000000-0000-0000-0000-00000000cc07', '00000000-0000-0000-0000-00000000cc04', now());
-- pk_win: top of the card and of the league. pk_d: 4th, so only the pack for playing.
insert into public.scores (user_id, event_id, correct, picked, points) values
  ('00000000-0000-0000-0000-00000000cc01', 'pk-done', 3, 3, 40),
  ('00000000-0000-0000-0000-00000000cc02', 'pk-done', 2, 3, 30),
  ('00000000-0000-0000-0000-00000000cc03', 'pk-done', 2, 3, 20),
  ('00000000-0000-0000-0000-00000000cc04', 'pk-done', 1, 3, 10),
  -- Three outsiders fill the top 3, so pk_c's only prize here is winning Packers.
  ('00000000-0000-0000-0000-00000000cc11', 'pk-lg', 5, 5, 90),
  ('00000000-0000-0000-0000-00000000cc12', 'pk-lg', 5, 5, 80),
  ('00000000-0000-0000-0000-00000000cc13', 'pk-lg', 5, 5, 70),
  ('00000000-0000-0000-0000-00000000cc03', 'pk-lg', 3, 5, 30),
  ('00000000-0000-0000-0000-00000000cc04', 'pk-lg', 2, 5, 20),
  ('00000000-0000-0000-0000-00000000cc01', 'pk-lg', 1, 5, 10),
  -- Picked, but nowhere near a prize.
  ('00000000-0000-0000-0000-00000000cc05', 'pk-part', 0, 1, 0),
  ('00000000-0000-0000-0000-00000000cc01', 'pk-live', 1, 1, 10);
insert into public.card_pool (fighter_id, name, rarity)
select 'pk-' || r || '-' || n, r || ' ' || n, r
from unnest(array['common', 'rare', 'epic', 'legendary']) r, generate_series(1, 6) n;

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000cc01';
select pg_temp.expect_count($$select 1 from public.claim_packs()$$, 2, 'a welcome pack, and one pack for a card with both a podium and a league win');
select pg_temp.expect_count($$select 1 from public.claim_packs()$$, 2, 'claiming again handing out nothing new');
select pg_temp.expect_count($$select 1 from public.claim_packs() where event_id = 'pk-done'$$, 1, 'at most one pack per card');
select pg_temp.expect_count($$select 1 from public.claim_packs() where event_id = 'pk-live'$$, 0, 'a pack for a card still being fought');
select id as first_pack from public.claim_packs() where reason = 'podium' \gset
select pg_temp.expect_count(format($$select 1 from public.open_pack(%L)$$, :'first_pack'), 3, 'three cards in a pack');
reset role;
select string_agg(fighter_id, ',' order by slot) as drawn from public.pack_cards where pack_id = :'first_pack' \gset
set role authenticated;
select pg_temp.expect_count(format($$select 1 from (select string_agg(fighter_id, ',' order by slot) d from public.open_pack(%L)) q where d = %L$$, :'first_pack', :'drawn'), 1, 'opening a pack twice giving the same cards');
select pg_temp.expect_count($$select 1 from public.claim_packs()$$, 1, 'an opened pack leaving the list');
select pg_temp.expect_count($$select 1 from public.pack_cards_of('00000000-0000-0000-0000-00000000cc01')$$, 3, 'seeing your cards');

-- ---- Nobody else's packs, and no way around the functions ------------------------------------
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000cc04';
select pg_temp.expect_count($$select 1 from public.claim_packs()$$, 1, 'only the welcome pack for 4th place');
select id as welcome from public.claim_packs() where reason = 'welcome' \gset
select pg_temp.expect_count(format($$select 1 from public.open_pack(%L) where rarity <> 'common'$$, :'welcome'), 1, 'one welcome card, Rare or better');
select pg_temp.refused(format($$select public.open_pack(%L)$$, :'first_pack'), 'opening someone else''s pack');
select pg_temp.refused($$select 1 from public.packs$$, 'reading the packs table');
select pg_temp.refused($$select 1 from public.pack_cards$$, 'reading the cards table');
select pg_temp.refused($$select 1 from public.card_pool$$, 'reading the pool');
select pg_temp.refused($$insert into public.packs (user_id, event_id, reason) values ('00000000-0000-0000-0000-00000000cc04', 'pk-done', 'podium')$$, 'giving yourself a pack');
select pg_temp.refused(format($$update public.packs set opened_at = null where id = %L$$, :'first_pack'), 're-rolling a pack');

set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000cc02';
select pg_temp.expect_count($$select 1 from public.claim_packs() where reason = 'league'$$, 0, 'a league bonus from a league started after the results');
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000cc03';
select pg_temp.expect_count($$select 1 from public.claim_packs() where reason = 'league' and event_id = 'pk-done'$$, 0, 'a league bonus with only 2 players');
select pg_temp.expect_count($$select 1 from public.claim_packs() where reason = 'league' and event_id = 'pk-lg'$$, 1, 'a pack for winning a real league');

set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000cc05';
select pg_temp.expect_count($$select 1 from public.claim_packs() where reason <> 'welcome'$$, 0, 'no prize packs without a prize');
select pg_temp.expect_count($$select 1 from public.claim_packs() where reason = 'welcome'$$, 1, 'a welcome pack for someone new');
reset role;

set role anon;
set request.jwt.claim.sub = '';
select pg_temp.expect_count($$select 1 from public.pack_cards_of('00000000-0000-0000-0000-00000000cc01')$$, 3, 'a visitor seeing a player''s cards');
select pg_temp.refused($$select 1 from public.claim_packs()$$, 'a visitor claiming packs');
reset role;

-- ---- The guarantee: many packs, and the third card is never Common ------------------------------
insert into public.packs (user_id, event_id, reason)
select '00000000-0000-0000-0000-00000000cc05', 'bulk-' || n, 'played' from generate_series(1, 60) n;
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000cc05';
select public.claim_packs();
reset role;
create temporary table to_open as select id from public.packs where user_id = '00000000-0000-0000-0000-00000000cc05' and reason = 'played';
grant select on to_open to authenticated;
set role authenticated;
select count(*) from to_open t, lateral public.open_pack(t.id);
reset role;
select pg_temp.expect_count($$select 1 from public.pack_cards c join public.packs p on p.id = c.pack_id where p.user_id = '00000000-0000-0000-0000-00000000cc05'$$, 180, 'every pack holding three cards');
select pg_temp.expect_count($$select 1 from public.pack_cards c join public.packs p on p.id = c.pack_id where p.user_id = '00000000-0000-0000-0000-00000000cc05' and c.slot = 3 and c.rarity = 'common'$$, 0, 'a Common as the third card');
select pg_temp.expect_count($$select 1 from public.pack_cards c group by c.pack_id, c.fighter_id having count(*) > 1$$, 0, 'the same fighter twice in a pack');

\o
\echo All card pack tests passed.
