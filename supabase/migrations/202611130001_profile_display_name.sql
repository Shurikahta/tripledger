alter table public.profiles
  add column if not exists display_name text
  check (display_name is null or length(trim(display_name)) between 1 and 30);

grant update (display_name) on public.profiles to authenticated;
