-- Midgard Legacy: Mission Points, expandable Job Yard rewards,
-- profession items, property upgrades, hospital accidents and avatars.
begin;

alter table public.players
    add column if not exists mission_points integer not null default 0,
    add column if not exists avatar_url text;

alter table public.job_templates
    add column if not exists reward_mission_points integer not null default 1;

alter table public.job_npcs
    add column if not exists avatar_url text;

alter table public.village_npcs
    add column if not exists avatar_url text;

create table if not exists public.mission_rewards (
    code text primary key,
    name text not null,
    icon text not null default '📜',
    description text not null,
    mission_point_cost integer not null check (mission_point_cost > 0),
    category text not null default 'general',
    sort_order integer not null default 0,
    is_active boolean not null default true
);

create table if not exists public.player_mission_unlocks (
    player_id uuid not null references public.players(id) on delete cascade,
    reward_code text not null references public.mission_rewards(code) on delete cascade,
    unlocked_at timestamptz not null default now(),
    primary key (player_id, reward_code)
);

alter table public.mission_rewards enable row level security;
alter table public.player_mission_unlocks enable row level security;

drop policy if exists "Mission rewards are readable" on public.mission_rewards;
create policy "Mission rewards are readable"
on public.mission_rewards for select
to authenticated
using (is_active = true);

drop policy if exists "Players read own mission unlocks" on public.player_mission_unlocks;
create policy "Players read own mission unlocks"
on public.player_mission_unlocks for select
to authenticated
using (player_id = auth.uid());

insert into public.mission_rewards
(code, name, icon, description, mission_point_cost, category, sort_order)
values
('basic_anvil', 'Basic Anvil', '⚒️', 'Unlocks basic iron tools, nails and metal fittings.', 20, 'forge', 10),
('forge_bellows', 'Forge Bellows', '🔥', 'Improves the forge and unlocks better crafting.', 40, 'forge', 20),
('reinforced_anvil', 'Reinforced Anvil', '🔨', 'Unlocks stronger tools, weapons and armour.', 60, 'forge', 30),
('basic_smoker', 'Basic Smoker', '💨', 'Reduces the chance of wild bee attacks.', 15, 'beekeeping', 40),
('bee_veil', 'Bee Veil', '🥽', 'Provides basic protection from bee stings.', 20, 'beekeeping', 50),
('bee_suit', 'Bee Suit', '🥼', 'Provides strong protection while working with bees.', 50, 'beekeeping', 60),
('improved_smoker', 'Improved Smoker', '🌫️', 'Greatly reduces bee aggression and swarm accidents.', 60, 'beekeeping', 70),
('queen_kit', 'Queen Catching Kit', '👑', 'Improves the chance of safely collecting Queen Bees.', 100, 'beekeeping', 80)
on conflict (code) do update set
name = excluded.name,
icon = excluded.icon,
description = excluded.description,
mission_point_cost = excluded.mission_point_cost,
category = excluded.category,
sort_order = excluded.sort_order;

create or replace function public.unlock_mission_reward(target_reward_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    reward_row public.mission_rewards%rowtype;
    current_points integer;
begin
    select * into reward_row
    from public.mission_rewards
    where code = target_reward_code and is_active = true;

    if not found then raise exception 'That reward does not exist.'; end if;

    if exists (
        select 1 from public.player_mission_unlocks
        where player_id = auth.uid() and reward_code = target_reward_code
    ) then raise exception 'You have already unlocked this reward.'; end if;

    select mission_points into current_points
    from public.players where id = auth.uid() for update;

    if coalesce(current_points, 0) < reward_row.mission_point_cost then
        raise exception 'You do not have enough Mission Points.';
    end if;

    update public.players
    set mission_points = mission_points - reward_row.mission_point_cost
    where id = auth.uid();

    insert into public.player_mission_unlocks(player_id, reward_code)
    values (auth.uid(), target_reward_code);

    return jsonb_build_object(
        'reward_code', reward_row.code,
        'reward_name', reward_row.name,
        'remaining_points', current_points - reward_row.mission_point_cost
    );
end;
$$;

grant execute on function public.unlock_mission_reward(text) to authenticated;

-- Add Mission Points to the existing hand-in result without changing its arguments.
-- Run this migration after the original Job Yard SQL has created hand_in_village_job.
create or replace function public.hand_in_village_job(target_job_id bigint)
returns jsonb
language plpgsql security definer set search_path=public as $$
declare
    job_record record;
    requirement record;
    item_record record;
    owned integer;
    total_completed integer;
    new_training integer;
    training_message text := null;
begin
    if auth.uid() is null then raise exception 'You must be logged in.'; end if;

    select pj.id,pj.npc_id,pj.template_id,jt.title,jt.requirements,jt.reward_silver,
           jt.reward_reputation,jt.reward_mission_points,n.code,n.name
    into job_record
    from public.player_jobs pj
    join public.job_templates jt on jt.id=pj.template_id
    join public.job_npcs n on n.id=pj.npc_id
    where pj.id=target_job_id and pj.player_id=auth.uid() and pj.status='active'
    for update of pj;
    if not found then raise exception 'Active job not found.'; end if;

    for requirement in select key, value::text::integer amount from jsonb_each(job_record.requirements)
    loop
      select id,name into item_record from public.items where lower(name)=lower(requirement.key) limit 1;
      if not found then raise exception 'Item "%" is missing from the items table.', requirement.key; end if;
      select coalesce(quantity,0) into owned from public.inventory
      where player_id=auth.uid() and item_id=item_record.id;
      if coalesce(owned,0) < requirement.amount then
        raise exception 'You still need % x %.', requirement.amount-coalesce(owned,0), requirement.key;
      end if;
    end loop;

    for requirement in select key, value::text::integer amount from jsonb_each(job_record.requirements)
    loop
      select id into item_record from public.items where lower(name)=lower(requirement.key) limit 1;
      update public.inventory set quantity=quantity-requirement.amount
      where player_id=auth.uid() and item_id=item_record.id;
      delete from public.inventory where player_id=auth.uid() and item_id=item_record.id and quantity<=0;
    end loop;

    update public.players
    set silver=coalesce(silver,0)+job_record.reward_silver,
        reputation=coalesce(reputation,0)+job_record.reward_reputation,
        mission_points=coalesce(mission_points,0)+coalesce(job_record.reward_mission_points,0)
    where id=auth.uid();

    update public.player_jobs set status='completed',completed_at=now() where id=target_job_id;

    insert into public.profession_progress(player_id,npc_id,jobs_completed,training_level)
    values(auth.uid(),job_record.npc_id,1,0)
    on conflict(player_id,npc_id) do update
      set jobs_completed=profession_progress.jobs_completed+1, updated_at=now()
    returning jobs_completed into total_completed;

    new_training := floor(total_completed/10);
    update public.profession_progress
    set training_level=new_training,updated_at=now()
    where player_id=auth.uid() and npc_id=job_record.npc_id;

    if total_completed % 10 = 0 then
      if job_record.code='healer' then
        training_message := job_record.name || ' trains you. You may now restore up to ' || least(100,10+new_training*10) || '% health.';
      else
        training_message := job_record.name || ' trains you. Your ' || job_record.code || ' training is now level ' || new_training || '.';
      end if;
    end if;

    return jsonb_build_object(
      'title',job_record.title,
      'jobs_completed',total_completed,
      'training_level',new_training,
      'healing_percent',case when job_record.code='healer' and total_completed>=10 then least(100,10+new_training*10) else 0 end,
      'reward_silver',job_record.reward_silver,
      'reward_reputation',job_record.reward_reputation,
      'reward_mission_points',coalesce(job_record.reward_mission_points,0),
      'training_message',training_message
    );
end; $$;

grant execute on function public.hand_in_village_job(bigint) to authenticated;

-- Crafting/property materials. IDs remain database-generated and are looked up by name.
insert into public.items(name, description)
values
('Stick', 'A simple stick gathered while chopping trees.'),
('Rock', 'A rough building stone gathered while mining.'),
('Birch Beam', 'A sturdy structural beam cut from a Birch Log.'),
('Oak Beam', 'A strong structural beam cut from an Oak Log.'),
('Birch Shaft', 'A carved Birch handle for basic tools.'),
('Oak Shaft', 'A stronger Oak handle for advanced tools.')
on conflict (name) do nothing;

create table if not exists public.property_upgrade_requirements (
    target_level integer not null,
    item_name text not null,
    quantity integer not null check (quantity > 0),
    primary key (target_level, item_name)
);

insert into public.property_upgrade_requirements(target_level, item_name, quantity)
values
(1, 'Stick', 1000), (1, 'Birch Plank', 100), (1, 'Birch Beam', 20), (1, 'Rock', 100), (1, 'Iron Nails', 40),
(2, 'Stick', 2500), (2, 'Birch Plank', 250), (2, 'Birch Beam', 50), (2, 'Rock', 250), (2, 'Iron Nails', 100),
(3, 'Oak Plank', 500), (3, 'Oak Beam', 100), (3, 'Rock', 500), (3, 'Iron Nails', 200),
(4, 'Oak Plank', 1000), (4, 'Oak Beam', 250), (4, 'Rock', 1000), (4, 'Iron Nails', 400)
on conflict (target_level, item_name) do update set quantity = excluded.quantity;

alter table public.property_upgrade_requirements enable row level security;
drop policy if exists "Property requirements readable" on public.property_upgrade_requirements;
create policy "Property requirements readable"
on public.property_upgrade_requirements for select to authenticated using (true);

create or replace function public.upgrade_my_property()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    current_level integer;
    next_level integer;
    req record;
    inv record;
begin
    select property_level into current_level from public.players
    where id = auth.uid() for update;
    next_level := current_level + 1;
    if next_level > 4 then raise exception 'Your property is already fully upgraded.'; end if;

    for req in select * from public.property_upgrade_requirements where target_level = next_level loop
        select inventory.id, inventory.quantity into inv
        from public.inventory
        join public.items on items.id = inventory.item_id
        where inventory.player_id = auth.uid() and lower(items.name) = lower(req.item_name)
        for update;
        if not found or inv.quantity < req.quantity then
            raise exception 'You still need more %.', req.item_name;
        end if;
    end loop;

    for req in select * from public.property_upgrade_requirements where target_level = next_level loop
        update public.inventory set quantity = quantity - req.quantity
        where id = (
            select inventory.id from public.inventory
            join public.items on items.id = inventory.item_id
            where inventory.player_id = auth.uid() and lower(items.name) = lower(req.item_name)
            limit 1
        );
    end loop;

    update public.players set property_level = next_level where id = auth.uid();
    return jsonb_build_object('property_level', next_level);
end;
$$;
grant execute on function public.upgrade_my_property() to authenticated;

-- Shared hospital admission used by serious profession accidents.
create or replace function public.admit_myself_to_hospital(
    short_reason text,
    damage_amount integer,
    hospital_minutes integer,
    long_message text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    player_row public.players%rowtype;
    new_health integer;
    release_at timestamptz;
begin
    select * into player_row from public.players where id = auth.uid() for update;
    new_health := greatest(1, coalesce(player_row.health, 1) - greatest(1, damage_amount));
    release_at := now() + make_interval(mins => greatest(1, hospital_minutes));

    update public.players
    set health = new_health,
        hospital_started_at = now(),
        hospital_until = release_at,
        hospital_reason = left(short_reason, 160),
        hospital_start_health = new_health,
        hospital_regen_per_minute = greatest(1, ceil((coalesce(max_health, 500) - new_health)::numeric / greatest(1, hospital_minutes)))
    where id = auth.uid();

    return jsonb_build_object(
        'health', new_health,
        'hospital_until', release_at,
        'hospital_reason', short_reason,
        'event_message', long_message
    );
end;
$$;
grant execute on function public.admit_myself_to_hospital(text, integer, integer, text) to authenticated;

-- Avatar storage. The bucket is public so avatar URLs work on public profiles.
insert into storage.buckets(id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do update set public = true;

drop policy if exists "Avatar images are publicly readable" on storage.objects;
create policy "Avatar images are publicly readable"
on storage.objects for select
using (bucket_id = 'avatars');

drop policy if exists "Players upload own avatar" on storage.objects;
create policy "Players upload own avatar"
on storage.objects for insert to authenticated
with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "Players update own avatar" on storage.objects;
create policy "Players update own avatar"
on storage.objects for update to authenticated
using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text)
with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "Players delete own avatar" on storage.objects;
create policy "Players delete own avatar"
on storage.objects for delete to authenticated
using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

commit;
