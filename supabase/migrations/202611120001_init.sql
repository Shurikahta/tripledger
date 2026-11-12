-- Tripledger MVP schema. Apply this migration in the Supabase SQL editor.
create extension if not exists pgcrypto;

create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  password_set_at timestamptz,
  created_at timestamptz not null default now()
);

-- One-time allowlist entry used to bootstrap the first manager in a new project.
create table if not exists public.bootstrap_invites (
  email text primary key check (email = lower(email)),
  status text not null default 'pending' check (status in ('pending', 'used')),
  created_at timestamptz not null default now(),
  used_at timestamptz
);
alter table public.bootstrap_invites enable row level security;
revoke all on public.bootstrap_invites from public, anon, authenticated;
grant select, insert, update on public.bootstrap_invites to service_role;

create table if not exists public.trips (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 100),
  start_date date,
  end_date date,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  check (end_date is null or start_date is null or end_date >= start_date)
);

create table if not exists public.trip_members (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  email text not null,
  user_id uuid references auth.users(id) on delete set null,
  role text not null default 'participant' check (role in ('manager', 'participant')),
  status text not null default 'pending' check (status in ('pending', 'active', 'revoked')),
  invited_by uuid references auth.users(id),
  invited_at timestamptz not null default now(),
  joined_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index if not exists trip_members_trip_email_unique on public.trip_members (trip_id, lower(email));
create index if not exists trip_members_user_trip_idx on public.trip_members (user_id, trip_id) where status = 'active';

create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  description text not null check (length(trim(description)) between 1 and 140),
  amount_cents integer not null check (amount_cents > 0),
  attachment_required boolean not null default false,
  attachment_path text,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

create table if not exists public.expense_shares (
  id uuid primary key default gen_random_uuid(),
  expense_id uuid not null references public.expenses(id) on delete cascade,
  trip_member_id uuid not null references public.trip_members(id) on delete cascade,
  amount_cents integer not null check (amount_cents >= 0),
  created_at timestamptz not null default now(),
  unique (expense_id, trip_member_id)
);

create table if not exists public.payment_schedule (
  id uuid primary key default gen_random_uuid(),
  trip_member_id uuid not null references public.trip_members(id) on delete cascade,
  due_date date not null,
  planned_cents integer not null check (planned_cents > 0),
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  unique (trip_member_id, due_date)
);

create table if not exists public.repayments (
  id uuid primary key default gen_random_uuid(),
  trip_member_id uuid not null references public.trip_members(id) on delete cascade,
  amount_cents integer not null check (amount_cents > 0),
  paid_at date not null,
  note text check (note is null or length(note) <= 240),
  recorded_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now()
);

create or replace function private.is_trip_manager(p_trip_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.trip_members m where m.trip_id = p_trip_id and m.user_id = (select auth.uid()) and m.role = 'manager' and m.status = 'active');
$$;

create or replace function private.is_trip_member(p_trip_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.trip_members m where m.trip_id = p_trip_id and m.user_id = (select auth.uid()) and m.status = 'active');
$$;

create or replace function private.can_view_member(p_member_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.trip_members m
    where m.id = p_member_id
      and ((m.user_id = (select auth.uid()) and m.status = 'active') or private.is_trip_manager(m.trip_id))
  );
$$;

create or replace function private.can_view_expense(p_expense_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.expenses e
    where e.id = p_expense_id and (
      private.is_trip_manager(e.trip_id) or exists (
        select 1 from public.expense_shares s join public.trip_members m on m.id = s.trip_member_id
        where s.expense_id = e.id and m.user_id = (select auth.uid()) and m.status = 'active'
      )
    )
  );
$$;

create or replace function private.can_manage_expense(p_expense_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.expenses e where e.id = p_expense_id and private.is_trip_manager(e.trip_id));
$$;

grant execute on function private.is_trip_manager(uuid), private.is_trip_member(uuid), private.can_view_member(uuid), private.can_view_expense(uuid), private.can_manage_expense(uuid) to authenticated;
revoke all on function private.is_trip_manager(uuid), private.is_trip_member(uuid), private.can_view_member(uuid), private.can_view_expense(uuid), private.can_manage_expense(uuid) from public, anon;

create or replace function private.create_profile_for_auth_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, email) values (new.id, lower(new.email)) on conflict (id) do update set email = excluded.email;
  return new;
end;
$$;
drop trigger if exists on_auth_user_created_profile on auth.users;
create trigger on_auth_user_created_profile after insert on auth.users for each row execute function private.create_profile_for_auth_user();
insert into public.profiles (id, email)
select id, lower(email) from auth.users where email is not null
on conflict (id) do update set email = excluded.email;

create or replace function private.sync_profile_email()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.email is distinct from old.email then
    update public.profiles set email = lower(new.email) where id = new.id;
  end if;
  if old.email_confirmed_at is null and new.email_confirmed_at is not null then
    update public.trip_members set user_id = new.id, status = 'active', joined_at = now()
    where lower(email) = lower(new.email) and status = 'pending';
  end if;
  return new;
end;
$$;
drop trigger if exists on_auth_user_updated_profile_and_invites on auth.users;
create trigger on_auth_user_updated_profile_and_invites after update of email, email_confirmed_at on auth.users for each row execute function private.sync_profile_email();

create or replace function private.add_trip_manager()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.trip_members (trip_id, email, user_id, role, status, invited_by, joined_at)
  select new.id, lower(u.email), new.created_by, 'manager', 'active', new.created_by, now()
  from auth.users u where u.id = new.created_by;
  return new;
end;
$$;
drop trigger if exists on_trip_created_add_manager on public.trips;
create trigger on_trip_created_add_manager after insert on public.trips for each row execute function private.add_trip_manager();

create or replace function public.create_expense_with_shares(
  p_expense_id uuid,
  p_trip_id uuid,
  p_description text,
  p_amount_cents integer,
  p_attachment_required boolean,
  p_attachment_path text,
  p_shares jsonb
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_expense_id uuid;
  v_sum bigint;
  v_count integer;
begin
  if not private.is_trip_manager(p_trip_id) then raise exception 'Only this trip manager can add an expense'; end if;
  if p_expense_id is null or p_amount_cents <= 0 or jsonb_typeof(p_shares) <> 'array' then raise exception 'Invalid expense or allocation'; end if;
  if p_attachment_required and p_attachment_path is null then raise exception 'Required attachment is missing'; end if;
  if p_attachment_path is not null and p_attachment_path not like p_trip_id::text || '/' || p_expense_id::text || '/%' then raise exception 'Attachment path does not match the expense'; end if;
  select coalesce(sum((item->>'amount_cents')::integer), 0), count(*) into v_sum, v_count from jsonb_array_elements(p_shares) item;
  if v_count = 0 or v_sum <> p_amount_cents then raise exception 'Allocated shares must equal the expense total'; end if;
  if exists (
    select 1 from jsonb_array_elements(p_shares) item
    left join public.trip_members m on m.id = (item->>'trip_member_id')::uuid
    where m.id is null or m.trip_id <> p_trip_id or m.status = 'revoked'
  ) then raise exception 'Every allocation must belong to a current trip participant'; end if;
  if exists (
    select 1 from public.trip_members m
    where m.trip_id = p_trip_id and m.status <> 'revoked'
      and not exists (select 1 from jsonb_array_elements(p_shares) item where (item->>'trip_member_id')::uuid = m.id)
  ) then raise exception 'Every current trip participant must be included in the expense split'; end if;
  insert into public.expenses (id, trip_id, description, amount_cents, attachment_required, attachment_path, created_by)
  values (p_expense_id, p_trip_id, trim(p_description), p_amount_cents, p_attachment_required, p_attachment_path, (select auth.uid())) returning id into v_expense_id;
  insert into public.expense_shares (expense_id, trip_member_id, amount_cents)
  select v_expense_id, (item->>'trip_member_id')::uuid, (item->>'amount_cents')::integer from jsonb_array_elements(p_shares) item;
  return v_expense_id;
end;
$$;
grant execute on function public.create_expense_with_shares(uuid, uuid, text, integer, boolean, text, jsonb) to authenticated;
revoke all on function public.create_expense_with_shares(uuid, uuid, text, integer, boolean, text, jsonb) from public, anon;

create or replace function public.list_trip_expenses(p_trip_id uuid)
returns table (
  id uuid, trip_id uuid, description text, amount_cents integer, own_share_cents bigint,
  attachment_path text, attachment_required boolean, created_at timestamptz
)
language sql stable security definer set search_path = '' as $$
  select e.id, e.trip_id, e.description,
    case when private.is_trip_manager(e.trip_id) then e.amount_cents else null end,
    coalesce((select sum(s.amount_cents)::bigint from public.expense_shares s join public.trip_members m on m.id = s.trip_member_id where s.expense_id = e.id and m.user_id = (select auth.uid()) and m.status = 'active'), 0),
    e.attachment_path, e.attachment_required, e.created_at
  from public.expenses e
  where e.trip_id = p_trip_id and private.is_trip_member(e.trip_id)
  order by e.created_at desc;
$$;
grant execute on function public.list_trip_expenses(uuid) to authenticated;
revoke all on function public.list_trip_expenses(uuid) from public, anon;

create or replace function public.replace_payment_schedule(p_member_id uuid, p_rows jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_trip_id uuid;
  v_balance bigint;
  v_scheduled bigint;
begin
  select m.trip_id into v_trip_id from public.trip_members m where m.id = p_member_id;
  if v_trip_id is null or not private.is_trip_manager(v_trip_id) then
    raise exception 'Only this trip manager can change the payment plan';
  end if;
  if jsonb_typeof(p_rows) <> 'array' then raise exception 'Invalid schedule'; end if;
  select coalesce(sum(s.amount_cents), 0) - coalesce((select sum(r.amount_cents) from public.repayments r where r.trip_member_id = p_member_id), 0)
    into v_balance from public.expense_shares s join public.expenses e on e.id = s.expense_id
    where s.trip_member_id = p_member_id and e.trip_id = v_trip_id;
  select coalesce(sum((item->>'planned_cents')::integer), 0) into v_scheduled from jsonb_array_elements(p_rows) item;
  if v_scheduled <> greatest(v_balance, 0) then raise exception 'The schedule must match the outstanding balance'; end if;
  delete from public.payment_schedule where trip_member_id = p_member_id;
  insert into public.payment_schedule (trip_member_id, due_date, planned_cents, created_by)
  select p_member_id, (item->>'due_date')::date, (item->>'planned_cents')::integer, (select auth.uid())
  from jsonb_array_elements(p_rows) item;
end;
$$;
grant execute on function public.replace_payment_schedule(uuid, jsonb) to authenticated;
revoke all on function public.replace_payment_schedule(uuid, jsonb) from public, anon;

create or replace function public.record_trip_repayment(p_member_id uuid, p_amount_cents integer, p_paid_at date, p_note text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_trip_id uuid;
  v_balance bigint;
  v_repayment_id uuid;
begin
  select m.trip_id into v_trip_id from public.trip_members m where m.id = p_member_id and m.status <> 'revoked';
  if v_trip_id is null or not private.is_trip_manager(v_trip_id) then raise exception 'Only this trip manager can record a repayment'; end if;
  if p_amount_cents <= 0 or length(coalesce(p_note, '')) > 240 then raise exception 'Invalid repayment'; end if;
  select coalesce(sum(s.amount_cents), 0) - coalesce((select sum(r.amount_cents) from public.repayments r where r.trip_member_id = p_member_id), 0)
    into v_balance from public.expense_shares s join public.expenses e on e.id = s.expense_id
    where s.trip_member_id = p_member_id and e.trip_id = v_trip_id;
  if p_amount_cents > greatest(v_balance, 0) then raise exception 'Repayment exceeds the outstanding balance'; end if;
  insert into public.repayments (trip_member_id, amount_cents, paid_at, note, recorded_by)
  values (p_member_id, p_amount_cents, p_paid_at, nullif(trim(p_note), ''), (select auth.uid()))
  returning id into v_repayment_id;
  return v_repayment_id;
end;
$$;
grant execute on function public.record_trip_repayment(uuid, integer, date, text) to authenticated;
revoke all on function public.record_trip_repayment(uuid, integer, date, text) from public, anon;

create or replace function public.activate_my_invites()
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from auth.users u where u.id = (select auth.uid()) and u.email_confirmed_at is not null) then
    raise exception 'Confirm the invited email before accepting trip invitations';
  end if;
  update public.trip_members m set user_id = (select auth.uid()), status = 'active', joined_at = coalesce(joined_at, now())
  where lower(m.email) = (select lower(u.email) from auth.users u where u.id = (select auth.uid()))
    and m.status = 'pending';
  update public.bootstrap_invites b set status = 'used', used_at = now()
  where b.email = (select lower(u.email) from auth.users u where u.id = (select auth.uid())) and b.status = 'pending';
end;
$$;
grant execute on function public.activate_my_invites() to authenticated;
revoke all on function public.activate_my_invites() from public, anon;

alter table public.profiles enable row level security;
alter table public.trips enable row level security;
alter table public.trip_members enable row level security;
alter table public.expenses enable row level security;
alter table public.expense_shares enable row level security;
alter table public.payment_schedule enable row level security;
alter table public.repayments enable row level security;

revoke all on public.profiles, public.trips, public.trip_members, public.expenses, public.expense_shares, public.payment_schedule, public.repayments from anon, authenticated;
grant select on public.profiles to authenticated;
grant update (password_set_at) on public.profiles to authenticated;
grant select, insert on public.trips to authenticated;
grant select, insert on public.trip_members to authenticated;
grant update (attachment_path) on public.expenses to authenticated;
grant select on public.expense_shares to authenticated;
grant select on public.payment_schedule, public.repayments to authenticated;

create policy profiles_read_self on public.profiles for select to authenticated using (id = (select auth.uid()));
create policy profiles_update_self on public.profiles for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy trips_read_member on public.trips for select to authenticated using (private.is_trip_member(id));
create policy trips_create_self on public.trips for insert to authenticated with check (created_by = (select auth.uid()));
create policy trips_update_manager on public.trips for update to authenticated using (private.is_trip_manager(id)) with check (private.is_trip_manager(id));

create policy trip_members_read_trip on public.trip_members for select to authenticated using (private.is_trip_member(trip_id));
create policy trip_members_invite_manager on public.trip_members for insert to authenticated with check (private.is_trip_manager(trip_id) and role = 'participant' and status = 'pending' and user_id is null and invited_by = (select auth.uid()));
create policy trip_members_update_manager on public.trip_members for update to authenticated using (private.is_trip_manager(trip_id)) with check (private.is_trip_manager(trip_id));

create policy expenses_read_associated on public.expenses for select to authenticated using (private.can_view_expense(id));
create policy expenses_create_manager on public.expenses for insert to authenticated with check (private.is_trip_manager(trip_id) and created_by = (select auth.uid()));
create policy expenses_update_manager on public.expenses for update to authenticated using (private.is_trip_manager(trip_id)) with check (private.is_trip_manager(trip_id));
create policy expenses_delete_manager on public.expenses for delete to authenticated using (private.is_trip_manager(trip_id));

create policy shares_read_associated on public.expense_shares for select to authenticated using (private.can_view_member(trip_member_id));
create policy shares_manage_manager on public.expense_shares for all to authenticated using (private.can_manage_expense(expense_id)) with check (private.can_manage_expense(expense_id));

create policy schedule_read_associated on public.payment_schedule for select to authenticated using (private.can_view_member(trip_member_id));
create policy schedule_manage_manager on public.payment_schedule for all to authenticated using (exists (select 1 from public.trip_members m where m.id = trip_member_id and private.is_trip_manager(m.trip_id))) with check (exists (select 1 from public.trip_members m where m.id = trip_member_id and private.is_trip_manager(m.trip_id)) and created_by = (select auth.uid()));

create policy repayments_read_associated on public.repayments for select to authenticated using (private.can_view_member(trip_member_id));
create policy repayments_record_manager on public.repayments for insert to authenticated with check (exists (select 1 from public.trip_members m where m.id = trip_member_id and private.is_trip_manager(m.trip_id)) and recorded_by = (select auth.uid()));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('expense-attachments', 'expense-attachments', false, 10485760, array['application/pdf','image/jpeg','image/png'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create policy expense_files_read_associated on storage.objects for select to authenticated using (
  bucket_id = 'expense-attachments' and private.can_view_expense((storage.foldername(name))[2]::uuid)
);
create policy expense_files_add_manager on storage.objects for insert to authenticated with check (
  bucket_id = 'expense-attachments' and private.is_trip_manager(((storage.foldername(name))[1])::uuid)
);
create policy expense_files_update_manager on storage.objects for update to authenticated using (
  bucket_id = 'expense-attachments' and private.is_trip_manager(((storage.foldername(name))[1])::uuid)
) with check (bucket_id = 'expense-attachments' and private.is_trip_manager(((storage.foldername(name))[1])::uuid));
create policy expense_files_delete_manager on storage.objects for delete to authenticated using (
  bucket_id = 'expense-attachments' and private.is_trip_manager(((storage.foldername(name))[1])::uuid)
);
