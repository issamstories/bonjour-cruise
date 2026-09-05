-- Adds a human "location" (city, country) to cruises so the app can show
-- where a departure happens: Dubai, Abu Dhabi, Jeddah, Bali, etc.
-- port_name stays the marina/dock detail; location is the marketing label.
alter table public.cruises
  add column if not exists location text;

-- Seed the existing open cruises with a default location.
update public.cruises set location = 'Dubai, UAE' where location is null and port_name is not null;
