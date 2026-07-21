-- Midgard Legacy: one personal Apiary, unlocked by homestead progression.
begin;

alter table public.players
    add column if not exists property_level integer not null default 0;

alter table public.players
    drop constraint if exists players_property_level_range;

alter table public.players
    add constraint players_property_level_range
    check (property_level between 0 and 4);

-- Existing accounts remain at Old Shack unless deliberately upgraded.
update public.players
set property_level = greatest(0, least(4, coalesce(property_level, 0)));

commit;
