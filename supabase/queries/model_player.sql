-- The model's Pick'em account (display name "the_model"; see src/ufc_embedded/pickem_model.py).
--
-- 1. Authentication -> Users -> Add user -> Create new user: email model@anarli.com, any long
--    random password (nobody signs in with it), "Auto Confirm User" ticked.
-- 2. Run this. The sync then makes its picks on every open bout, like a player.

insert into public.profiles (id, display_name, notify_friend_requests)
select id, 'the_model', false from auth.users where email = 'model@anarli.com'
on conflict (id) do nothing;

-- To take it off the boards again (its picks and scores go with it):
-- delete from auth.users where email = 'model@anarli.com';
