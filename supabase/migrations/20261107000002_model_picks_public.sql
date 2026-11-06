-- The model's picks are public once a card locks: anyone can check how it did, fight by fight
-- (players' picks stay private to themselves, friends and league-mates).

create function public.is_model(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.profiles where id = uid and display_name = 'the_model');
$$;

create policy "the model's picks are public after the lock" on public.picks
  for select to anon, authenticated
  using (not public.bout_is_open(bout_id) and public.is_model(user_id));
