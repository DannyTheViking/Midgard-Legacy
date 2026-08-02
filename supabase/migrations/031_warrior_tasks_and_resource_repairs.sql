-- Midgard Legacy Update 031
-- Large rotating task catalogue, new task rewards and resource-based tool repairs.

begin;

-- ============================================================
-- TASK CATALOGUE
-- 16 task families x 63 variants = 1,008 task possibilities
-- for each period (daily, weekly and monthly).
-- ============================================================

create table if not exists public.warrior_task_catalog (
    id bigserial primary key,
    period text not null check (period in ('daily','weekly','monthly')),
    family_key text not null,
    event_key text not null,
    label text not null,
    target bigint not null check (target > 0),
    difficulty_tier integer not null default 1 check (difficulty_tier between 1 and 10),
    requirement_key text,
    is_active boolean not null default true
);

create index if not exists warrior_task_catalog_period_idx
    on public.warrior_task_catalog(period, is_active, difficulty_tier);

create table if not exists public.player_task_history (
    player_id uuid not null references public.players(id) on delete cascade,
    catalog_id bigint not null references public.warrior_task_catalog(id) on delete cascade,
    assigned_at timestamptz not null default now(),
    primary key(player_id, catalog_id, assigned_at)
);

create index if not exists player_task_history_recent_idx
    on public.player_task_history(player_id, assigned_at desc);

-- Add a catalogue reference without breaking existing task rows.
alter table public.player_tasks
    add column if not exists catalog_id bigint references public.warrior_task_catalog(id) on delete set null;

-- Rebuild the catalogue so this migration remains repeatable.
delete from public.warrior_task_catalog;

with families as (
    select * from (values
        ('supplies','gather_any','Gather %s resources',null),
        ('stockpile','gather_any','Add %s materials to your stores',null),
        ('worker','gather_actions','Complete %s gathering actions',null),
        ('timber','gather_logs','Gather %s logs',null),
        ('firewood','gather_logs','Collect %s logs for the village',null),
        ('kindling','gather_sticks','Gather %s sticks',null),
        ('woodcutter','gather_woodcutting','Gather %s woodcutting resources',null),
        ('miner','gather_mining','Gather %s mining resources',null),
        ('forager','gather_foraging','Gather %s foraging resources',null),
        ('village_jobs','complete_job','Complete %s local jobs',null),
        ('help_village','complete_job','Help villagers by completing %s jobs',null),
        ('craftsman','craft_any','Craft %s items','workbench'),
        ('cordage_maker','craft_cordage','Craft %s Nettle Cordage','cordage'),
        ('fletcher','craft_arrows','Craft %s arrows','arrows'),
        ('smith','craft_arrowheads','Craft %s Iron Arrowheads','arrowheads'),
        ('repairer','repair','Repair %s profession tools','repair')
    ) as f(family_key,event_key,label_template,requirement_key)
), periods as (
    select * from (values
        ('daily',1),('weekly',2),('monthly',3)
    ) as p(period,period_rank)
), variants as (
    select p.period,p.period_rank,f.*,g.n,
           least(10, greatest(1, ceil(g.n / 7.0)::int)) as difficulty_tier
    from periods p
    cross join families f
    cross join generate_series(1,63) g(n)
), targets as (
    select *,
        case period
            when 'daily' then case event_key
                when 'gather_any' then 40 + n * 6
                when 'gather_actions' then 10 + n * 2
                when 'gather_logs' then 25 + n * 4
                when 'gather_sticks' then 40 + n * 7
                when 'gather_woodcutting' then 30 + n * 5
                when 'gather_mining' then 20 + n * 4
                when 'gather_foraging' then 20 + n * 4
                when 'complete_job' then 1 + ((n - 1) % 5)
                when 'craft_any' then 5 + n * 2
                when 'craft_cordage' then 2 + n
                when 'craft_arrows' then 5 + n * 2
                when 'craft_arrowheads' then 25 + n * 25
                when 'repair' then 1 + ((n - 1) % 3)
                else 10 + n
            end
            when 'weekly' then case event_key
                when 'gather_any' then 500 + n * 45
                when 'gather_actions' then 100 + n * 12
                when 'gather_logs' then 350 + n * 35
                when 'gather_sticks' then 500 + n * 55
                when 'gather_woodcutting' then 400 + n * 40
                when 'gather_mining' then 250 + n * 30
                when 'gather_foraging' then 250 + n * 30
                when 'complete_job' then 5 + ((n - 1) % 21)
                when 'craft_any' then 100 + n * 15
                when 'craft_cordage' then 30 + n * 4
                when 'craft_arrows' then 75 + n * 10
                when 'craft_arrowheads' then 500 + n * 100
                when 'repair' then 2 + ((n - 1) % 9)
                else 100 + n * 10
            end
            else case event_key
                when 'gather_any' then 5000 + n * 300
                when 'gather_actions' then 800 + n * 45
                when 'gather_logs' then 3000 + n * 220
                when 'gather_sticks' then 5000 + n * 300
                when 'gather_woodcutting' then 3500 + n * 250
                when 'gather_mining' then 2500 + n * 180
                when 'gather_foraging' then 2500 + n * 180
                when 'complete_job' then 25 + ((n - 1) % 76)
                when 'craft_any' then 1000 + n * 120
                when 'craft_cordage' then 300 + n * 25
                when 'craft_arrows' then 750 + n * 75
                when 'craft_arrowheads' then 5000 + n * 500
                when 'repair' then 5 + ((n - 1) % 21)
                else 1000 + n * 100
            end
        end::bigint as target
    from variants
)
insert into public.warrior_task_catalog(period,family_key,event_key,label,target,difficulty_tier,requirement_key)
select period,family_key,event_key,
       replace(label_template,'%s',target::text) || case ((n-1) % 13)
         when 0 then ''
         when 1 then ' for the village'
         when 2 then ' before resting'
         when 3 then ' to strengthen the settlement'
         when 4 then ' for the King'
         when 5 then ' to prepare for winter'
         when 6 then ' to aid the workers'
         when 7 then ' for your homestead'
         when 8 then ' to prove your skill'
         when 9 then ' for the next expedition'
         when 10 then ' to fill the stores'
         when 11 then ' as a warrior challenge'
         else ' to help your people'
       end,
       target,difficulty_tier,requirement_key
from targets;

alter table public.warrior_task_catalog enable row level security;
drop policy if exists "Task catalogue readable" on public.warrior_task_catalog;
create policy "Task catalogue readable" on public.warrior_task_catalog
for select to authenticated using (is_active=true);

-- Determine whether a catalogue requirement is currently sensible for a player.
create or replace function public.player_meets_task_requirement(p_player uuid,p_requirement text)
returns boolean
language plpgsql
stable
security definer
set search_path=public
as $$
declare
    v_property_level integer:=0;
    v_blacksmith_jobs integer:=0;
begin
    if p_requirement is null then return true; end if;

    select coalesce(property_level,0) into v_property_level
    from public.players where id=p_player;

    if p_requirement='workbench' then return true; end if;
    if p_requirement='cordage' then
        return exists(select 1 from public.workstation_recipes where recipe_key ilike '%cordage%' and is_active=true);
    end if;
    if p_requirement='arrows' then
        return exists(select 1 from public.workstation_recipes where recipe_key ilike '%arrow%' and recipe_key not ilike '%arrowhead%' and is_active=true);
    end if;
    if p_requirement='arrowheads' then
        return v_property_level >= 2 and exists(select 1 from public.workstation_recipes where recipe_key ilike '%arrowhead%' and is_active=true);
    end if;
    if p_requirement='repair' then
        select coalesce(pp.jobs_completed,0) into v_blacksmith_jobs
        from public.job_npcs n
        left join public.profession_progress pp on pp.npc_id=n.id and pp.player_id=p_player
        where lower(n.code)='blacksmith'
        limit 1;
        return coalesce(v_blacksmith_jobs,0)>=1
          and exists(
              select 1
              from public.player_profession_equipment pe
              join public.profession_equipment_definitions d on d.equipment_key=pe.equipment_key
              where pe.player_id=p_player and pe.current_durability<d.maximum_durability
          );
    end if;
    return true;
end;
$$;

-- Replace task generation with a rotating catalogue and level-aware difficulty.
create or replace function public.ensure_player_task_set(p_player uuid,p_period text)
returns bigint
language plpgsql
security definer
set search_path=public
as $$
declare
    v_key text:=public.task_period_key(p_period);
    v_set_id bigint;
    v_reward integer;
    v_player_tier integer:=1;
    v_inserted integer:=0;
    v_row record;
begin
    if p_period not in ('daily','weekly','monthly') then raise exception 'Invalid task period.'; end if;

    select id into v_set_id
    from public.player_task_sets
    where player_id=p_player and period=p_period and period_key=v_key;
    if v_set_id is not null then return v_set_id; end if;

    v_reward:=case p_period when 'daily' then 1000 when 'weekly' then 10000 else 100000 end;

    select least(10,greatest(1,
        greatest(
            coalesce(woodcutting_level,1),coalesce(mining_level,1),coalesce(foraging_level,1),
            coalesce(fishing_level,1),coalesce(hunting_level,1),coalesce(carpentry_level,1),
            coalesce(blacksmithing_level,1),coalesce(cooking_level,1)
        )
    )) into v_player_tier
    from public.skills where player_id=p_player;
    v_player_tier:=coalesce(v_player_tier,1);

    insert into public.player_task_sets(player_id,period,period_key,reward_silver)
    values(p_player,p_period,v_key,v_reward)
    returning id into v_set_id;

    for v_row in
        with eligible as (
            select c.*,
                   row_number() over(partition by c.family_key order by random()) as family_pick
            from public.warrior_task_catalog c
            where c.period=p_period
              and c.is_active=true
              and c.difficulty_tier between greatest(1,v_player_tier-2) and least(10,v_player_tier+2)
              and public.player_meets_task_requirement(p_player,c.requirement_key)
              and not exists(
                  select 1 from public.player_task_history h
                  where h.player_id=p_player and h.catalog_id=c.id
                    and h.assigned_at>now()-interval '90 days'
              )
        ), one_per_family as (
            select * from eligible where family_pick=1 order by random() limit 10
        )
        select * from one_per_family
    loop
        v_inserted:=v_inserted+1;
        insert into public.player_tasks(task_set_id,task_key,label,event_key,target,sort_order,catalog_id)
        values(v_set_id,v_row.family_key||'-'||v_row.id,v_row.label,v_row.event_key,v_row.target,v_inserted,v_row.id);
        insert into public.player_task_history(player_id,catalog_id) values(p_player,v_row.id);
    end loop;

    -- Fallback if recent-history filtering left fewer than ten choices.
    if v_inserted<10 then
        for v_row in
            select c.* from public.warrior_task_catalog c
            where c.period=p_period and c.is_active=true
              and public.player_meets_task_requirement(p_player,c.requirement_key)
              and not exists(select 1 from public.player_tasks t where t.task_set_id=v_set_id and t.catalog_id=c.id)
            order by random()
            limit (10-v_inserted)
        loop
            v_inserted:=v_inserted+1;
            insert into public.player_tasks(task_set_id,task_key,label,event_key,target,sort_order,catalog_id)
            values(v_set_id,v_row.family_key||'-'||v_row.id,v_row.label,v_row.event_key,v_row.target,v_inserted,v_row.id);
            insert into public.player_task_history(player_id,catalog_id) values(p_player,v_row.id);
        end loop;
    end if;

    return v_set_id;
end;
$$;

-- Track more broad activity categories while retaining all gathering behaviour.
create or replace function public.gather_resource(p_node_key text,p_actions integer default 1)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
    v jsonb;
    v_quantity bigint;
    v_item_name text;
    v_profession text;
begin
    select profession into v_profession
    from public.gathering_resource_nodes
    where node_key=p_node_key and is_active=true;

    v:=public.gather_resource_025_core(p_node_key,p_actions);
    v_quantity:=coalesce((v->>'primary_quantity')::bigint,0);
    v_item_name:=lower(coalesce(v->>'primary_item',''));

    perform public.record_task_event(auth.uid(),'gather_actions',greatest(1,p_actions));
    perform public.record_task_event(auth.uid(),'gather_any',v_quantity);
    if v_item_name like '%log%' then perform public.record_task_event(auth.uid(),'gather_logs',v_quantity); end if;
    if v_item_name like '%stick%' then perform public.record_task_event(auth.uid(),'gather_sticks',v_quantity); end if;
    if v_profession='woodcutting' then perform public.record_task_event(auth.uid(),'gather_woodcutting',v_quantity); end if;
    if v_profession='mining' then perform public.record_task_event(auth.uid(),'gather_mining',v_quantity); end if;
    if v_profession='foraging' then perform public.record_task_event(auth.uid(),'gather_foraging',v_quantity); end if;
    return v;
end;
$$;

-- Track all completed crafting output as well as specialist outputs.
create or replace function public.claim_workstation_job(p_job_id bigint)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare v jsonb; v_name text; v_quantity bigint;
begin
    v:=public.claim_workstation_job_025_core(p_job_id);
    v_name:=lower(coalesce(v->>'name',''));
    v_quantity:=coalesce((v->>'quantity')::bigint,0);
    perform public.record_task_event(auth.uid(),'craft_any',v_quantity);
    if v_name like '%arrowhead%' then perform public.record_task_event(auth.uid(),'craft_arrowheads',v_quantity); end if;
    if v_name='arrow' or v_name like '% arrows' then perform public.record_task_event(auth.uid(),'craft_arrows',v_quantity); end if;
    if v_name like '%bow%' then perform public.record_task_event(auth.uid(),'craft_bows',v_quantity); end if;
    if v_name like '%spear%' then perform public.record_task_event(auth.uid(),'craft_spears',v_quantity); end if;
    if v_name like '%cordage%' then perform public.record_task_event(auth.uid(),'craft_cordage',v_quantity); end if;
    return v;
end;
$$;

-- ============================================================
-- RESOURCE-BASED PROFESSION TOOL REPAIRS
-- Repairs unlock after the player's first Blacksmith job.
-- ============================================================

create table if not exists public.profession_repair_options (
    equipment_key text not null references public.profession_equipment_definitions(equipment_key) on delete cascade,
    option_key text not null,
    option_label text not null,
    material_name text not null,
    material_quantity integer not null check(material_quantity>0),
    sort_order integer not null default 1,
    primary key(equipment_key,option_key)
);

delete from public.profession_repair_options;
insert into public.profession_repair_options(equipment_key,option_key,option_label,material_name,material_quantity,sort_order)
values
 ('iron_axe','iron_ore','10 Iron Ore','Iron Ore',10,1),
 ('iron_axe','logs','10 Logs','Birch Log',10,2),
 ('iron_pickaxe','iron_ore','10 Iron Ore','Iron Ore',10,1),
 ('iron_pickaxe','logs','10 Logs','Birch Log',10,2),
 ('hunting_knife','iron_ore','5 Iron Ore','Iron Ore',5,1),
 ('hunting_knife','logs','10 Logs','Birch Log',10,2),
 ('fishing_net','cordage','10 Nettle Cordage','Nettle Cordage',10,1),
 ('fishing_rod','sticks','10 Sticks','Stick',10,1),
 ('fishing_rod','cordage','5 Nettle Cordage','Nettle Cordage',5,2),
 ('hunting_bow','sticks','10 Sticks','Stick',10,1),
 ('hunting_bow','cordage','5 Nettle Cordage','Nettle Cordage',5,2),
 ('hunting_spear','logs','10 Logs','Birch Log',10,1),
 ('hunting_spear','iron_ore','10 Iron Ore','Iron Ore',10,2);

alter table public.profession_repair_options enable row level security;
drop policy if exists "Repair options readable" on public.profession_repair_options;
create policy "Repair options readable" on public.profession_repair_options
for select to authenticated using(true);

create or replace function public.get_repairable_profession_tools()
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
    v_player uuid:=auth.uid();
    v_jobs integer:=0;
    v_tools jsonb;
begin
    if v_player is null then raise exception 'Sign in required.'; end if;

    select coalesce(pp.jobs_completed,0) into v_jobs
    from public.job_npcs n
    left join public.profession_progress pp on pp.npc_id=n.id and pp.player_id=v_player
    where lower(n.code)='blacksmith'
    limit 1;

    select coalesce(jsonb_agg(jsonb_build_object(
        'equipment_key',d.equipment_key,
        'display_name',d.display_name,
        'icon',d.icon,
        'current_durability',pe.current_durability,
        'maximum_durability',d.maximum_durability,
        'damaged',pe.current_durability<d.maximum_durability,
        'options',coalesce((
            select jsonb_agg(jsonb_build_object(
                'option_key',o.option_key,
                'label',o.option_label,
                'material_name',o.material_name,
                'required',o.material_quantity,
                'owned',coalesce(public.shared_item_quantity(v_player,i.id),0),
                'can_afford',coalesce(public.shared_item_quantity(v_player,i.id),0)>=o.material_quantity
            ) order by o.sort_order)
            from public.profession_repair_options o
            left join public.items i on lower(i.name)=lower(o.material_name)
            where o.equipment_key=d.equipment_key
        ),'[]'::jsonb)
    ) order by d.sort_order),'[]'::jsonb)
    into v_tools
    from public.player_profession_equipment pe
    join public.profession_equipment_definitions d on d.equipment_key=pe.equipment_key and d.is_active=true
    where pe.player_id=v_player;

    return jsonb_build_object(
        'repairs_unlocked',coalesce(v_jobs,0)>=1,
        'blacksmith_jobs_completed',coalesce(v_jobs,0),
        'tools',v_tools
    );
end;
$$;

create or replace function public.repair_profession_equipment(p_equipment_key text,p_option_key text)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
    v_player uuid:=auth.uid();
    v_jobs integer:=0;
    v_owned public.player_profession_equipment%rowtype;
    v_definition public.profession_equipment_definitions%rowtype;
    v_option public.profession_repair_options%rowtype;
    v_item_id bigint;
begin
    if v_player is null then raise exception 'Sign in required.'; end if;

    select coalesce(pp.jobs_completed,0) into v_jobs
    from public.job_npcs n
    left join public.profession_progress pp on pp.npc_id=n.id and pp.player_id=v_player
    where lower(n.code)='blacksmith'
    limit 1;
    if coalesce(v_jobs,0)<1 then raise exception 'Complete your first job for Bjørn the Blacksmith to unlock tool repairs.'; end if;

    select * into v_definition from public.profession_equipment_definitions
    where equipment_key=p_equipment_key and is_active=true;
    if not found then raise exception 'Tool not found.'; end if;

    select * into v_owned from public.player_profession_equipment
    where player_id=v_player and equipment_key=p_equipment_key for update;
    if not found then raise exception 'You do not own this tool.'; end if;
    if v_owned.current_durability>=v_definition.maximum_durability then raise exception 'This tool is already fully repaired.'; end if;

    select * into v_option from public.profession_repair_options
    where equipment_key=p_equipment_key and option_key=p_option_key;
    if not found then raise exception 'Choose a valid repair material.'; end if;

    select id into v_item_id from public.items where lower(name)=lower(v_option.material_name) limit 1;
    if v_item_id is null then raise exception 'Repair material % is missing.',v_option.material_name; end if;
    if public.shared_item_quantity(v_player,v_item_id)<v_option.material_quantity then
        raise exception 'You need % x% to repair this tool.',v_option.material_name,v_option.material_quantity;
    end if;

    perform public.consume_shared_item(v_player,v_item_id,v_option.material_quantity);

    update public.player_profession_equipment
    set current_durability=v_definition.maximum_durability,updated_at=now()
    where player_id=v_player and equipment_key=p_equipment_key;

    if p_equipment_key in ('iron_axe','iron_pickaxe') and to_regclass('public.equipment') is not null then
        update public.equipment set durability=100,max_durability=100
        where player_id=v_player and slot=case when p_equipment_key='iron_pickaxe' then 'pickaxe' else 'axe' end;
    end if;

    perform public.record_task_event(v_player,'repair',1);

    insert into public.player_notifications(player_id,notification_type,title,message,icon,link)
    values(v_player,'equipment','Tool Repaired',v_definition.display_name||' was repaired using '||v_option.option_label||'.',v_definition.icon,'blacksmith.html');

    return jsonb_build_object(
        'equipment_key',p_equipment_key,
        'display_name',v_definition.display_name,
        'material_used',v_option.material_name,
        'material_quantity',v_option.material_quantity,
        'current_durability',v_definition.maximum_durability,
        'maximum_durability',v_definition.maximum_durability
    );
end;
$$;

-- Keep the old one-argument RPC working by choosing the first affordable option.
create or replace function public.repair_profession_equipment(p_equipment_key text)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
    v_player uuid:=auth.uid();
    v_option text;
begin
    select o.option_key into v_option
    from public.profession_repair_options o
    left join public.items i on lower(i.name)=lower(o.material_name)
    where o.equipment_key=p_equipment_key
      and coalesce(public.shared_item_quantity(v_player,i.id),0)>=o.material_quantity
    order by o.sort_order
    limit 1;
    if v_option is null then raise exception 'You do not have enough repair materials.'; end if;
    return public.repair_profession_equipment(p_equipment_key,v_option);
end;
$$;

grant execute on function public.get_repairable_profession_tools() to authenticated;
grant execute on function public.repair_profession_equipment(text,text) to authenticated;
grant execute on function public.repair_profession_equipment(text) to authenticated;

-- Update rewards on any current unclaimed task sets and regenerate empty tester sets.
update public.player_task_sets
set reward_silver=case period when 'daily' then 1000 when 'weekly' then 10000 else 100000 end
where reward_claimed=false;

delete from public.player_task_sets s
where s.reward_claimed=false
  and not exists(select 1 from public.player_tasks t where t.task_set_id=s.id and t.progress>0);

commit;
