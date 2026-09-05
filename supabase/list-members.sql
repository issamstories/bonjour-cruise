-- Function SQL: list_member_emails() — security definer, admin only.
-- Returns non-admin member emails so the announce tool can email everyone.
-- Only members who gave marketing consent (RGPD) are returned.
create or replace function public.list_member_emails()
returns table (id uuid, full_name text, email text)
language sql stable security definer set search_path = public
as $$
  select p.id, p.full_name, p.email
  from public.profiles p
  where p.is_admin is not true
    and p.email is not null
    and (p.marketing_consent is null or p.marketing_consent = true)
  order by p.created_at asc;
$$;

revoke all on function public.list_member_emails() from public, anon, authenticated;
grant execute on function public.list_member_emails() to authenticated;
