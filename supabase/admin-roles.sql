-- ============================================================================
-- ADMIN ROLES & PERMISSIONS (Bonjour Cruise / Madame Cruise)
-- Granular access control: the master admin chooses what each team member
-- can do. Master = everything (set manually for Issam, one row).
--
--   admin_permissions text[] on profiles:
--     'cruises'  -> manage departures (create, price, capacity, status)
--     'requests' -> view booking requests (names, emails, phones)
--     'approve'  -> approve/reject requests (generate Stripe Payment Links)
--   is_master boolean: true = full access, bypasses permission checks.
-- ============================================================================

-- 1. New columns on profiles
alter table public.profiles
  add column if not exists admin_permissions text[] not null default '{}',
  add column if not exists is_master boolean not null default false;

-- 2. Helper: is this user a master admin?
create or replace function public.is_master_admin(uid uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = uid and (p.is_master or p.is_admin and 'master' = any(p.admin_permissions))
  );
$$;

-- 3. Helper: does this user have a permission?
create or replace function public.has_admin_permission(uid uuid, perm text)
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = uid and p.is_admin
      and (p.is_master or 'master' = any(p.admin_permissions) or perm = any(p.admin_permissions))
  );
$$;

-- 4. RLS: cruises write requires 'cruises' permission
drop policy if exists "cruises_admin_write" on public.cruises;
create policy "cruises_admin_write"
  on public.cruises for all to authenticated
  using (public.has_admin_permission(auth.uid(), 'cruises'))
  with check (public.has_admin_permission(auth.uid(), 'cruises'));

-- 5. RLS: booking_requests admin access requires 'requests' permission
drop policy if exists "booking_requests_admin_all" on public.booking_requests;
create policy "booking_requests_admin_all"
  on public.booking_requests for all to authenticated
  using (public.has_admin_permission(auth.uid(), 'requests'))
  with check (public.has_admin_permission(auth.uid(), 'requests'));

-- 6. RLS: feedback admin select requires 'requests' (same team audience)
drop policy if exists "feedback_admin_select" on public.feedback;
create policy "feedback_admin_select"
  on public.feedback for select to authenticated
  using (public.has_admin_permission(auth.uid(), 'requests'));

-- 7. RLS: profiles - admins can read other profiles ONLY if they have the
--    'team' permission (to manage the team). Master always can.
drop policy if exists "profiles_admin_select_team" on public.profiles;
create policy "profiles_admin_select_team"
  on public.profiles for select to authenticated
  using (
    public.is_master_admin(auth.uid())
    or public.has_admin_permission(auth.uid(), 'team')
  );

-- 8. Only masters can EDIT admin flags/permissions on other profiles
drop policy if exists "profiles_admin_update_perms" on public.profiles;
create policy "profiles_admin_update_perms"
  on public.profiles for update to authenticated
  using (public.is_master_admin(auth.uid()))
  with check (public.is_master_admin(auth.uid()));

-- 9. Grant helper execution to authenticated (needed by RLS evaluation)
grant execute on function public.is_master_admin(uuid) to authenticated;
grant execute on function public.has_admin_permission(uuid, text) to authenticated;

-- ============================================================================
-- AFTER RUNNING: make Issam master (replace email if needed)
--   update public.profiles set is_master = true where email = 'issam.messaoudi.hub@gmail.com';
-- ============================================================================
