-- Midgard Legacy: replace crafting profession skills with property stations.
-- Run after migration 012.
begin;

alter table public.players
    add column if not exists workbench_level integer not null default 0,
    add column if not exists forge_level integer not null default 0;

alter table public.players
    drop constraint if exists players_workbench_level_check,
    add constraint players_workbench_level_check check (workbench_level between 0 and 100),
    drop constraint if exists players_forge_level_check,
    add constraint players_forge_level_check check (forge_level between 0 and 100);

-- The first repaired property unlocks Workbench Level 1.
-- Property Level 2 unlocks Forge Level 1.
-- Further property upgrades improve both stations automatically.
update public.players
set workbench_level = greatest(workbench_level, property_level),
    forge_level = greatest(forge_level, greatest(property_level - 1, 0));

create or replace function public.sync_property_station_levels()
returns trigger
language plpgsql
set search_path = public
as $$
begin
    new.workbench_level := greatest(coalesce(new.workbench_level, 0), coalesce(new.property_level, 0));
    new.forge_level := greatest(coalesce(new.forge_level, 0), greatest(coalesce(new.property_level, 0) - 1, 0));
    return new;
end;
$$;

drop trigger if exists sync_property_station_levels_trigger on public.players;
create trigger sync_property_station_levels_trigger
before insert or update of property_level on public.players
for each row execute function public.sync_property_station_levels();

-- Keep old columns temporarily for migration safety, but reset them so they
-- no longer affect Total Skill or future gameplay progression.
update public.skills
set blacksmithing_xp = 0,
    blacksmithing_level = 1,
    carpentry_xp = 0,
    carpentry_level = 1;

commit;
