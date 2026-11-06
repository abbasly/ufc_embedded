-- Emails about friend requests: "ko_king wants to be friends on UFC Embedded". A database webhook
-- on new friendships calls the friend-request-email Edge Function (supabase/functions), which
-- sends the email through Resend.
--
-- Players can turn these emails off on their profile. And to keep "add, undo, add" from becoming
-- spam, the function sends at most one email per pair a week, noted in friend_request_notices.

alter table public.profiles
  add column notify_friend_requests boolean not null default true;

-- When someone was last emailed about a request from someone else. Only the Edge Function
-- (service role) touches it: row level security on, and no policies for anyone else.
create table public.friend_request_notices (
  requester uuid not null references public.profiles (id) on delete cascade,
  addressee uuid not null references public.profiles (id) on delete cascade,
  sent_at timestamptz not null default now(),
  primary key (requester, addressee)
);
alter table public.friend_request_notices enable row level security;
revoke all on public.friend_request_notices from anon, authenticated;
