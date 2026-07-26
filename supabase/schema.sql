-- ============================================================================
-- BONJOUR CRUISE, database schema (Supabase / Postgres)
-- Paste this whole file into Supabase, SQL Editor, Run.
--
-- Privacy model: GRANULAR, PER-FIELD, OPT-IN.
--   Each guest chooses exactly what their co-passengers can see: first name,
--   age, languages, photo, independently. If they tick nothing, they share
--   nothing. The roster function only ever returns data to a guest who is
--   themselves booked on that cruise, and never returns email, phone, last
--   name or exact birth date.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. PROFILES (every guest, and/or crew applicant, has one)
-- ----------------------------------------------------------------------------
create table if not exists public.profiles (
  id                uuid primary key references auth.users(id) on delete cascade,
  full_name         text not null,
  nickname          text,                 -- how they want to be addressed
  email             text not null,
  whatsapp          text,
  city              text,
  nationality       text,
  date_of_birth     date,
  tshirt_size       text,                 -- for the little gifts (t-shirts with their nickname)
  languages         text[] default '{}',
  avatar_url        text,                 -- optional photo (added with Storage later)
  marketing_consent boolean not null default true,

  -- granular sharing: each guest decides what co-passengers may see
  share_name        boolean not null default true,
  share_age         boolean not null default true,
  share_languages   boolean not null default true,
  share_photo       boolean not null default false,

  -- crew application (a profile may also apply to join the crew)
  is_crew_applicant boolean not null default false,
  crew_role         text,                 -- captain | hostess | spa-therapist | photographer | other
  crew_license      text,                 -- licence / certification number (mandatory if applying)
  crew_experience   text,

  is_admin          boolean not null default false,  -- set true manually for Issam (see bottom)
  created_at        timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles_select_own"
  on public.profiles for select using (auth.uid() = id);
create policy "profiles_insert_own"
  on public.profiles for insert with check (auth.uid() = id);
create policy "profiles_update_own"
  on public.profiles for update using (auth.uid() = id);

-- ----------------------------------------------------------------------------
-- 2. CRUISES (created by an admin)
-- ----------------------------------------------------------------------------
create table if not exists public.cruises (
  id              uuid primary key default gen_random_uuid(),
  title           text not null,
  experience      text,
  starts_at       timestamptz not null,
  ends_at         timestamptz,
  port_name       text not null,
  port_address    text not null,
  contact_number  text not null,
  what_to_bring   text,
  age_band        text not null default 'All ages',
  capacity        int not null default 15,
  min_guests      int not null default 8,  -- a cruise only sails once this many seats are booked
  price_per_seat  int,
  status          text not null default 'open',
  created_at      timestamptz not null default now()
);

alter table public.cruises enable row level security;

create policy "cruises_select_authenticated"
  on public.cruises for select to authenticated
  using (status in ('open', 'confirmed'));

create policy "cruises_admin_write"
  on public.cruises for all to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin));

-- ----------------------------------------------------------------------------
-- 3. REGISTRATIONS
-- ----------------------------------------------------------------------------
create table if not exists public.registrations (
  id          uuid primary key default gen_random_uuid(),
  cruise_id   uuid not null references public.cruises(id) on delete cascade,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  seats       int not null default 1 check (seats between 1 and 6),
  status      text not null default 'registered',
  created_at  timestamptz not null default now(),
  unique (cruise_id, user_id)
);

alter table public.registrations enable row level security;

create policy "registrations_select_own"
  on public.registrations for select using (auth.uid() = user_id);
create policy "registrations_insert_own"
  on public.registrations for insert with check (auth.uid() = user_id);
create policy "registrations_update_own"
  on public.registrations for update using (auth.uid() = user_id);

create index if not exists registrations_cruise_idx on public.registrations (cruise_id);
create index if not exists registrations_user_idx   on public.registrations (user_id);

-- ----------------------------------------------------------------------------
-- 4. GUEST COUNT — aggregate number for a cruise (no identities)
-- ----------------------------------------------------------------------------
create or replace function public.cruise_guest_summary(p_cruise_id uuid)
returns table (guest_count bigint, seat_count bigint)
language sql security definer set search_path = public
as $$
  select count(distinct r.user_id), coalesce(sum(r.seats), 0)
  from public.registrations r
  where r.cruise_id = p_cruise_id and r.status = 'registered';
$$;
grant execute on function public.cruise_guest_summary(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- 5. ROSTER — per-field opt-in, visible ONLY to a booked co-passenger
-- ----------------------------------------------------------------------------
create or replace function public.cruise_roster(p_cruise_id uuid)
returns table (display_name text, age int, languages text[], photo_url text)
language plpgsql security definer set search_path = public
as $$
begin
  if not exists (
    select 1 from public.registrations r
    where r.cruise_id = p_cruise_id and r.user_id = auth.uid() and r.status = 'registered'
  ) then
    return;
  end if;

  return query
    select
      case when p.share_name
           then coalesce(nullif(p.nickname, ''), split_part(p.full_name, ' ', 1))
           else 'A guest' end as display_name,
      case when p.share_age and p.date_of_birth is not null
           then date_part('year', age(p.date_of_birth))::int end as age,
      case when p.share_languages then p.languages end as languages,
      case when p.share_photo then p.avatar_url end as photo_url
    from public.registrations r
    join public.profiles p on p.id = r.user_id
    where r.cruise_id = p_cruise_id
      and r.status = 'registered'
      and p.id <> auth.uid()                       -- others, not themselves
      and (p.share_name or p.share_age or p.share_languages or p.share_photo);
end;
$$;
grant execute on function public.cruise_roster(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- 6. AUTO-CREATE PROFILE ON SIGNUP (reads signup metadata)
-- ----------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles (
    id, full_name, nickname, email, whatsapp, city, nationality, date_of_birth, tshirt_size,
    languages, marketing_consent, share_name, share_age, share_languages, share_photo,
    is_crew_applicant, crew_role, crew_license, crew_experience
  )
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    new.raw_user_meta_data->>'nickname',
    new.email,
    new.raw_user_meta_data->>'whatsapp',
    new.raw_user_meta_data->>'city',
    new.raw_user_meta_data->>'nationality',
    nullif(new.raw_user_meta_data->>'date_of_birth', '')::date,
    new.raw_user_meta_data->>'tshirt_size',
    case when new.raw_user_meta_data ? 'languages'
         then array(select jsonb_array_elements_text(new.raw_user_meta_data->'languages'))
         else '{}' end,
    coalesce((new.raw_user_meta_data->>'marketing_consent')::boolean, true),
    coalesce((new.raw_user_meta_data->>'share_name')::boolean, false),
    coalesce((new.raw_user_meta_data->>'share_age')::boolean, false),
    coalesce((new.raw_user_meta_data->>'share_languages')::boolean, false),
    coalesce((new.raw_user_meta_data->>'share_photo')::boolean, false),
    coalesce((new.raw_user_meta_data->>'is_crew_applicant')::boolean, false),
    new.raw_user_meta_data->>'crew_role',
    new.raw_user_meta_data->>'crew_license',
    new.raw_user_meta_data->>'crew_experience'
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ----------------------------------------------------------------------------
-- 7. ADMIN VIEWS — mailing list + crew applicants to contact
--    SECURITY: views in the `public` schema are exposed by the PostgREST API
--    and, by default, BYPASS the underlying tables' RLS (they run as the view
--    owner). Without the guards below, any anon/authenticated caller could read
--    every member's email, phone and city. We therefore:
--      (a) create them with security_invoker = on, so they respect the caller's
--          own RLS, and
--      (b) revoke all access from the anon + authenticated API roles.
--    Query them only from the Supabase SQL editor or with the service_role key
--    (both bypass RLS), never from the browser.
-- ----------------------------------------------------------------------------
create or replace view public.mailing_list
  with (security_invoker = on) as
  select full_name, nickname, email, whatsapp, city, nationality, languages, created_at
  from public.profiles
  where marketing_consent = true;

create or replace view public.crew_applicants
  with (security_invoker = on) as
  select full_name, nickname, email, whatsapp, city, nationality,
         crew_role, crew_license, crew_experience, created_at
  from public.profiles
  where is_crew_applicant = true
  order by created_at desc;

revoke all on public.mailing_list from anon, authenticated;
revoke all on public.crew_applicants from anon, authenticated;

-- ----------------------------------------------------------------------------
-- 8. FEEDBACK (one quick post-cruise form per guest per cruise)
--    Collected by the auto pop-up after a cruise has ended.
-- ----------------------------------------------------------------------------
create table if not exists public.feedback (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  cruise_id   uuid references public.cruises(id) on delete set null,
  rating      int check (rating between 1 and 5),
  loved       text[] default '{}',
  improve     text,
  recommend   text,                 -- yes | maybe | no
  created_at  timestamptz not null default now()
);

-- one feedback per guest per cruise
create unique index if not exists feedback_user_cruise_idx
  on public.feedback (user_id, cruise_id) where cruise_id is not null;

alter table public.feedback enable row level security;

create policy "feedback_insert_own"
  on public.feedback for insert to authenticated with check (auth.uid() = user_id);
create policy "feedback_select_own"
  on public.feedback for select using (auth.uid() = user_id);
create policy "feedback_admin_select"
  on public.feedback for select to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin));

-- admin convenience view: every response with the guest + cruise it belongs to.
-- Same RLS-bypass guard as the section-7 views (see note there).
create or replace view public.feedback_summary
  with (security_invoker = on) as
  select f.created_at, f.rating, f.recommend, f.loved, f.improve,
         c.title as cruise, c.starts_at,
         p.full_name, p.email
  from public.feedback f
  left join public.cruises c on c.id = f.cruise_id
  left join public.profiles p on p.id = f.user_id
  order by f.created_at desc;

revoke all on public.feedback_summary from anon, authenticated;

-- ----------------------------------------------------------------------------
-- 9. AVATARS — optional member photo, stored in Supabase Storage
--    Bucket is public-read (so a co-passenger can load the image) but a guest
--    can only write/replace files inside their own folder (named after their uid).
--    The photo is only ever surfaced through cruise_roster when share_photo is on.
-- ----------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
  values ('avatars', 'avatars', true)
  on conflict (id) do nothing;

drop policy if exists "avatars_public_read"  on storage.objects;
drop policy if exists "avatars_insert_own"   on storage.objects;
drop policy if exists "avatars_update_own"   on storage.objects;
drop policy if exists "avatars_delete_own"   on storage.objects;

create policy "avatars_public_read"
  on storage.objects for select
  using (bucket_id = 'avatars');

create policy "avatars_insert_own"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "avatars_update_own"
  on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "avatars_delete_own"
  on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

-- ----------------------------------------------------------------------------
-- 10. PUBLIC CRUISES PAGE — let anyone see OPEN departures + booked count
--     so the marketing /cruises.html page works before sign-in. Only open
--     cruises are exposed, and the count is an aggregate number (no identities).
-- ----------------------------------------------------------------------------
drop policy if exists "cruises_select_public" on public.cruises;
create policy "cruises_select_public"
  on public.cruises for select to anon, authenticated
  using (status = 'open');

grant execute on function public.cruise_guest_summary(uuid) to anon;

-- ----------------------------------------------------------------------------
-- 11. STRIPE PAYMENT — registrations are created by the webhook AFTER payment
-- ----------------------------------------------------------------------------
alter table public.registrations add column if not exists stripe_session_id text;
alter table public.registrations add column if not exists amount_total int;

-- ============================================================================
-- AFTER RUNNING: make yourself admin (replace with your signup email)
--   update public.profiles set is_admin = true where email = 'issam@…';
--
-- TO POST A CRUISE (so it shows on /cruises.html), insert a row, e.g.:
--   insert into public.cruises (title, experience, starts_at, port_name,
--     port_address, contact_number, age_band, capacity, min_guests, price_per_seat)
--   values ('Sunset Brunch Cruise', 'sunset-brunch',
--     '2026-07-18 17:00:00+04', 'Dubai Marina',
--     'Marina Yacht Club, Berth 12, Dubai', '+971585986118',
--     '25 to 35', 15, 8, 380);
--   -- capacity 15, min_guests 8 (sails once 8 seats are booked), 380 AED launch price
--
-- If the cruises table already exists, also raise the default:
--   alter table public.cruises alter column min_guests set default 8;
-- ============================================================================
