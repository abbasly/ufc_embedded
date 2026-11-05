-- Accounts: one profile per signed-in user (Supabase Auth owns the user itself, in auth.users).
-- We keep only a public display name: no real names, emails or birthdays live in our tables.

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null unique
    check (char_length(display_name) between 3 and 24 and display_name ~ '^[A-Za-z0-9_.-]+$'),
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- Display names are public (they appear on the leaderboard); only the owner can change theirs.
create policy "profiles are public" on public.profiles
  for select using (true);
create policy "users create their own profile" on public.profiles
  for insert to authenticated with check (id = auth.uid());
create policy "users rename only themselves" on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- Account deletion (GDPR "right to erasure"): removes the auth user, and with it, through the
-- cascades, the profile, picks and scores. Runs as the table owner so it may touch auth.users,
-- but only ever for the caller.
create function public.delete_my_account()
returns void
language sql
security definer
set search_path = ''
as $$
  delete from auth.users where id = auth.uid();
$$;

revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
