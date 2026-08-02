-- Saga completion dates and corrected Small House materials.

alter table public.players
  add column if not exists tutorial_completed_at timestamptz;

create or replace function public.set_tutorial_completed_at()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.tutorial_complete is true
     and coalesce(old.tutorial_complete, false) is false
     and new.tutorial_completed_at is null then
    new.tutorial_completed_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists players_set_tutorial_completed_at on public.players;
create trigger players_set_tutorial_completed_at
before update of tutorial_complete on public.players
for each row
execute function public.set_tutorial_completed_at();

-- Existing completed players pre-date this timestamp field. Their profile will
-- honestly say they completed the tutorial before Saga records began.

-- The Small House upgrade uses Oak rather than Birch structural timber.
delete from public.property_upgrade_requirements
where target_level = 2
  and item_name in ('Birch Beam', 'Birch Plank', 'Oak Beam', 'Oak Plank');

insert into public.property_upgrade_requirements(target_level, item_name, quantity)
values
  (2, 'Oak Beam', 50),
  (2, 'Oak Plank', 250)
on conflict (target_level, item_name) do update
set quantity = excluded.quantity;
