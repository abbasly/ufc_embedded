-- Display names that could pass for the site itself ("admin", "ufc_official", "support"...) are
-- off limits, so nobody can speak for UFC Embedded on the leaderboards. Checked case-insensitively.
-- (NOT VALID: names taken before this rule stay; every new or changed name is checked.)

alter table public.profiles
  add constraint profiles_display_name_not_reserved check (
    lower(display_name) !~ '(admin|moderator|^mods?$|support|official|staff|ufc_?embedded|anarli|^ufc$|^system$|^root$)'
  ) not valid;
