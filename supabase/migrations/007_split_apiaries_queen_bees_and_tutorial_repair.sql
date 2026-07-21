-- Midgard Legacy: split the tutorial Village Apiary from the player's Bee Yard.
begin;

alter table public.players
  add column if not exists tutorial_honey_started_at timestamptz,
  add column if not exists tutorial_honey_collected boolean not null default false;

create table if not exists public.player_beekeeping_equipment (
  player_id uuid primary key references public.players(id) on delete cascade,
  bee_suit_equipped boolean not null default false,
  smoker_equipped boolean not null default false,
  updated_at timestamptz not null default now()
);
alter table public.player_beekeeping_equipment enable row level security;
drop policy if exists "Players manage own beekeeping equipment" on public.player_beekeeping_equipment;
create policy "Players manage own beekeeping equipment" on public.player_beekeeping_equipment
for all to authenticated using (auth.uid() = player_id) with check (auth.uid() = player_id);

-- Add the tradeable/storable beekeeping items when absent.
insert into public.items (name, description)
select 'Queen Bee', 'A living wild Queen Bee. Store, trade or install her in an empty personal hive.'
where not exists (select 1 from public.items where lower(name)=lower('Queen Bee'));
insert into public.items (name, description)
select 'Bee Suit', 'Protective clothing that greatly reduces damage from angry bees.'
where not exists (select 1 from public.items where lower(name)=lower('Bee Suit'));
insert into public.items (name, description)
select 'Bee Smoker', 'A smoke-producing tool that calms a wild bee colony.'
where not exists (select 1 from public.items where lower(name)=lower('Bee Smoker'));

alter table public.statistics
  add column if not exists queen_bees_found bigint not null default 0,
  add column if not exists bee_stings_taken bigint not null default 0;

-- Replace the statistics RPC so the new counters are approved as well.
create or replace function public.increment_player_statistics_json(p_player_id uuid,p_changes jsonb)
returns public.statistics language plpgsql security definer set search_path=public as $$
declare v_key text; v_value bigint; v_result public.statistics;
v_allowed constant text[] := array[
 'trees_chopped','logs_collected','trees_planted','ore_mined','fish_caught','animals_hunted','silver_earned','silver_spent','damage_done','damage_taken','times_jailed','resources_gathered','mining_actions','items_crafted','carpentry_items_crafted','blacksmith_items_crafted','planks_sawn','bars_forged','nails_forged','hoops_forged','buckets_crafted','barrels_crafted','beehives_built','honey_collected','mead_brewed','drinks_brewed','food_cooked','food_burnt','arrows_shot','arrows_hit','arrows_missed','critical_hits','attacks_missed','tool_uses','tool_durability_lost','tools_broken','tools_repaired','trades_completed','messages_sent','quests_completed','queen_bees_found','bee_stings_taken'
];
begin
 if auth.uid() is not null and auth.uid()<>p_player_id then raise exception 'Players may update only their own statistics'; end if;
 insert into public.statistics(player_id,username) select id,username from public.players where id=p_player_id on conflict(player_id) do update set username=excluded.username;
 for v_key,v_value in select key,greatest(0,floor(value::text::numeric))::bigint from jsonb_each(p_changes) loop
  if not(v_key=any(v_allowed)) then raise exception 'Unsupported statistic: %',v_key; end if;
  execute format('update public.statistics set %I=coalesce(%I,0)+$1 where player_id=$2',v_key,v_key) using v_value,p_player_id;
 end loop;
 select * into v_result from public.statistics where player_id=p_player_id; return v_result;
end;$$;
grant execute on function public.increment_player_statistics_json(uuid,jsonb) to authenticated;

-- Repair players stranded on the retired nail-for-hive step.
update public.players set tutorial_step=7 where tutorial_complete=false and tutorial_step=6;
-- Step 10 remains step 10, but now means visiting Ragnhild's already-built village hives.
update public.players
set tutorial_progress = coalesce(tutorial_progress,'{}'::jsonb) - 'beehives'
where tutorial_complete=false;

commit;
