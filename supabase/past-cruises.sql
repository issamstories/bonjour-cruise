-- Past cruises — editorial history shown in the app ("where we've sailed").
-- Readable by anyone; only admins write. Lets the brand show departures from
-- Dubai, Abu Dhabi, Jeddah, Bali, Jakarta… even when the current season is
-- single-city, building trust and showing the multi-destination story.
create table if not exists public.past_cruises (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  location text not null,          -- "Dubai, UAE" / "Bali, Indonesia"
  sailed_on date,                  -- when it happened (optional for older ones)
  image_url text,
  blurb text,                      -- one-line story ("Sunset over the Corniche")
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  constraint past_cruises_sort_key unique (sort_order)
);

alter table public.past_cruises enable row level security;

-- Anyone (including logged-out guests) can read the history wall.
drop policy if exists "past_cruises_select_public" on public.past_cruises;
create policy "past_cruises_select_public"
  on public.past_cruises for select to anon, authenticated
  using (true);

-- Only admins can write the history wall.
drop policy if exists "past_cruises_admin_write" on public.past_cruises;
create policy "past_cruises_admin_write"
  on public.past_cruises for all to authenticated
  using (public.has_admin_permission(auth.uid(), 'cruises'))
  with check (public.has_admin_permission(auth.uid(), 'cruises'));

-- Sample entries so the app shows a real wall immediately (edit/delete freely).
insert into public.past_cruises (title, location, sailed_on, blurb, sort_order) values
  ('Ladies Sunset Sail', 'Dubai, UAE', '2026-03-14', 'Golden hour over the Marina skyline.', 10),
  ('Private Brunch Charter', 'Abu Dhabi, UAE', '2026-02-21', 'A slow morning off the Corniche.', 20),
  ('Red Sea Ladies Weekend', 'Jeddah, Saudi Arabia', '2026-01-17', 'Turquoise water, all-female crew.', 30),
  ('Bali Island Hop', 'Bali, Indonesia', '2025-11-08', 'Three islands, one unforgettable week.', 40),
  ('Langkawi Escape', 'Langkawi, Malaysia', '2025-10-02', 'Mangroves, sunsets and open sea.', 50)
on conflict (sort_order) do nothing;
