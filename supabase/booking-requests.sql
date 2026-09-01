-- ============================================================================
-- BOOKING REQUESTS (shared by Bonjour Cruise and Madame Cruise)
-- New flow: guest picks a date on a calendar -> sends a request (no payment).
-- Admin validates -> Stripe Payment Link generated -> email with link + T&Cs.
-- ============================================================================

create table if not exists public.booking_requests (
  id               uuid primary key default gen_random_uuid(),
  cruise_id        uuid references public.cruises(id) on delete set null,
  requested_date   date not null,               -- date chosen on the calendar
  seats            int not null default 1 check (seats between 1 and 30),
  first_name       text not null,
  last_name        text,
  email            text not null,
  whatsapp         text,
  guests_note      text,                        -- optional: occasion, preferences
  status           text not null default 'pending'
                     check (status in ('pending', 'approved', 'rejected', 'expired', 'paid')),
  payment_link     text,                        -- Stripe Payment Link (after approval)
  payment_link_id  text,                        -- Stripe payment link object id
  approved_at      timestamptz,
  rejected_at      timestamptz,
  created_at       timestamptz not null default now()
);

alter table public.booking_requests enable row level security;

-- Anyone (anon) can submit a request. This is the public booking form.
drop policy if exists "booking_requests_insert_public" on public.booking_requests;
create policy "booking_requests_insert_public"
  on public.booking_requests for insert to anon, authenticated
  with check (true);

-- Only admins can read/update requests (privacy: names, emails, phones).
drop policy if exists "booking_requests_admin_all" on public.booking_requests;
create policy "booking_requests_admin_all"
  on public.booking_requests for all to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin));

-- The requester themselves may check the status of their own request by email
-- (used by the app "track my request" screen, no account required).
drop policy if exists "booking_requests_select_own_by_email" on public.booking_requests;
create policy "booking_requests_select_own_by_email"
  on public.booking_requests for select to anon, authenticated
  using (lower(email) = lower(auth.jwt() ->> 'email'));

-- Index for the admin queue + the app's "my requests" lookup.
create index if not exists booking_requests_status_idx on public.booking_requests (status, created_at desc);
create index if not exists booking_requests_email_idx  on public.booking_requests (lower(email));
