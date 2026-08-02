-- ============================================================
-- MIDGARD LEGACY
-- Migration 025: Hunting knife market, wood bows, bird nests,
-- random woodcutting finds and the timed cooking fire.
-- Run once after migration 024.
-- ============================================================

begin;

-- ------------------------------------------------------------
-- New resources and bow items
-- ------------------------------------------------------------
insert into public.items(name, description, type, weight_kg)
select v.name, v.description, v.type, v.weight_kg
from (values
    ('Bird Nest', 'Dry nesting material used as tinder to start a cooking fire.', 'tinder', 0.10::numeric),
    ('Egg', 'A fresh bird egg used in cooking.', 'food', 0.08::numeric),
    ('Birch Large Stick', 'A long piece of birch suitable for a basic bow or spear.', 'component', 0.70::numeric),
    ('Pine Large Stick', 'A long piece of pine suitable for a bow or spear.', 'component', 0.75::numeric),
    ('Willow Large Stick', 'A flexible length of willow suitable for a bow or spear.', 'component', 0.65::numeric),
    ('Oak Large Stick', 'A strong length of oak suitable for a bow or spear.', 'component', 0.95::numeric),
    ('Ash Large Stick', 'A resilient length of ash suitable for a bow or spear.', 'component', 0.85::numeric),
    ('Maple Large Stick', 'A smooth length of maple suitable for a bow or spear.', 'component', 0.80::numeric),
    ('Yew Large Stick', 'A rare, naturally springy length of yew ideal for bows.', 'component', 0.75::numeric),
    ('Ancient Large Stick', 'An exceptional length of ancient timber.', 'component', 1.00::numeric),
    ('Birch Bow', 'A basic bow made from birch and nettle cordage.', 'weapon', 1.20::numeric),
    ('Pine Bow', 'A light bow made from pine and nettle cordage.', 'weapon', 1.25::numeric),
    ('Willow Bow', 'A flexible bow made from willow and nettle cordage.', 'weapon', 1.10::numeric),
    ('Oak Bow', 'A sturdy bow made from oak and nettle cordage.', 'weapon', 1.45::numeric),
    ('Ash Bow', 'A resilient bow made from ash and nettle cordage.', 'weapon', 1.30::numeric),
    ('Maple Bow', 'A balanced bow made from maple and nettle cordage.', 'weapon', 1.25::numeric),
    ('Yew Bow', 'A powerful bow made from rare yew.', 'weapon', 1.15::numeric),
    ('Ancient Bow', 'A legendary bow made from ancient timber.', 'weapon', 1.50::numeric)
) as v(name, description, type, weight_kg)
where not exists (
    select 1 from public.items i where lower(i.name) = lower(v.name)
);

create table if not exists public.bow_definitions (
    item_id bigint primary key references public.items(id) on delete cascade,
    wood_type text not null unique,
    damage integer not null check (damage > 0),
    maximum_durability integer not null check (maximum_durability > 0),
    sort_order integer not null default 0
);

insert into public.bow_definitions(item_id, wood_type, damage, maximum_durability, sort_order)
select i.id, v.wood_type, v.damage, v.maximum_durability, v.sort_order
from (values
    ('Birch Bow','Birch',5,40,10),
    ('Pine Bow','Pine',7,50,20),
    ('Willow Bow','Willow',9,60,30),
    ('Oak Bow','Oak',12,75,40),
    ('Ash Bow','Ash',15,90,50),
    ('Maple Bow','Maple',18,105,60),
    ('Yew Bow','Yew',23,130,70),
    ('Ancient Bow','Ancient',30,165,80)
) as v(item_name, wood_type, damage, maximum_durability, sort_order)
join public.items i on lower(i.name)=lower(v.item_name)
on conflict(item_id) do update set
    wood_type=excluded.wood_type,
    damage=excluded.damage,
    maximum_durability=excluded.maximum_durability,
    sort_order=excluded.sort_order;

alter table public.bow_definitions enable row level security;
drop policy if exists "Bow definitions readable" on public.bow_definitions;
create policy "Bow definitions readable" on public.bow_definitions
for select to authenticated using (true);

-- ------------------------------------------------------------
-- Hunting Knife: one Job Point from the Hunter
-- ------------------------------------------------------------
insert into public.profession_shop_items(npc_id, item_id, job_point_cost, minimum_jobs_completed, is_active, sort_order)
select n.id, i.id, 1, 0, true, 10
from public.job_npcs n
join public.items i on lower(i.name)='hunting knife'
where lower(n.code)='hunter'
on conflict(npc_id,item_id) do update set
    job_point_cost=1,
    minimum_jobs_completed=0,
    is_active=true,
    sort_order=10;

-- Bows and spears are crafted, not bought as Job Point equipment.
delete from public.profession_shop_items psi
using public.items i
where psi.item_id=i.id and lower(i.name) in ('hunting bow','hunting spear','bow');

-- ------------------------------------------------------------
-- Workbench recipes: one typed Large Stick + one Nettle Cordage
-- ------------------------------------------------------------
do $$
declare
    v_output bigint;
    v_stick bigint;
    v_cord bigint;
    v_recipe bigint;
    v_row record;
begin
    select id into v_cord from public.items where lower(name)='nettle cordage' limit 1;

    -- Retire the old generic bow recipe to avoid confusing testers.
    update public.workstation_recipes
    set is_active=false
    where recipe_key='workbench_bow';

    for v_row in
        select * from (values
            ('workbench_birch_bow','Birch Bow','Birch Large Stick',1,35,160),
            ('workbench_pine_bow','Pine Bow','Pine Large Stick',1,38,161),
            ('workbench_willow_bow','Willow Bow','Willow Large Stick',1,40,162),
            ('workbench_oak_bow','Oak Bow','Oak Large Stick',2,45,163),
            ('workbench_ash_bow','Ash Bow','Ash Large Stick',2,48,164),
            ('workbench_maple_bow','Maple Bow','Maple Large Stick',3,52,165),
            ('workbench_yew_bow','Yew Bow','Yew Large Stick',3,58,166),
            ('workbench_ancient_bow','Ancient Bow','Ancient Large Stick',4,70,167)
        ) as x(recipe_key, output_name, stick_name, station_level, seconds, sort_order)
    loop
        select id into v_output from public.items where lower(name)=lower(v_row.output_name) limit 1;
        select id into v_stick from public.items where lower(name)=lower(v_row.stick_name) limit 1;

        insert into public.workstation_recipes(
            recipe_key, station_type, recipe_type, name, description,
            output_item_id, output_quantity, required_station_level,
            duration_seconds, fuel_seconds_required, sort_order, is_active
        ) values (
            v_row.recipe_key, 'workbench', 'craft', v_row.output_name,
            'Craft with 1 '||v_row.stick_name||' and 1 Nettle Cordage. Better wood gives more damage and durability.',
            v_output, 1, v_row.station_level, v_row.seconds, 0, v_row.sort_order, true
        )
        on conflict(recipe_key) do update set
            name=excluded.name,
            description=excluded.description,
            output_item_id=excluded.output_item_id,
            output_quantity=1,
            required_station_level=excluded.required_station_level,
            duration_seconds=excluded.duration_seconds,
            sort_order=excluded.sort_order,
            is_active=true
        returning id into v_recipe;

        delete from public.workstation_recipe_ingredients where recipe_id=v_recipe;
        insert into public.workstation_recipe_ingredients(recipe_id,item_id,quantity)
        values(v_recipe,v_stick,1),(v_recipe,v_cord,1);
    end loop;
end $$;

-- Arrows are made one at a time from ordinary sticks throughout the game.
do $$
declare v_recipe bigint; v_output bigint; v_stick bigint; v_head bigint; v_feather bigint;
begin
    select id into v_output from public.items where lower(name)='arrow' limit 1;
    select id into v_stick from public.items where lower(name)='stick' limit 1;
    select id into v_head from public.items where lower(name)='iron arrowhead' limit 1;
    select id into v_feather from public.items where lower(name) in ('feather','feathers') order by case when lower(name)='feather' then 0 else 1 end limit 1;

    insert into public.workstation_recipes(recipe_key,station_type,recipe_type,name,description,output_item_id,output_quantity,required_station_level,duration_seconds,fuel_seconds_required,sort_order,is_active)
    values('workbench_arrow','workbench','craft','Arrow','Fletch one arrow from an ordinary stick, an iron arrowhead and three feathers.',v_output,1,1,8,0,168,true)
    on conflict(recipe_key) do update set station_type='workbench',recipe_type='craft',name='Arrow',description=excluded.description,output_item_id=v_output,output_quantity=1,required_station_level=1,duration_seconds=8,fuel_seconds_required=0,sort_order=168,is_active=true
    returning id into v_recipe;

    delete from public.workstation_recipe_ingredients where recipe_id=v_recipe;
    insert into public.workstation_recipe_ingredients(recipe_id,item_id,quantity)
    values(v_recipe,v_stick,1),(v_recipe,v_head,1),(v_recipe,v_feather,3);

    update public.workstation_recipes set is_active=false where recipe_key='workbench_arrows';
end $$;

-- ------------------------------------------------------------
-- Random woodcutting finds
-- ------------------------------------------------------------
create or replace function public.grant_woodcutting_finds(
    p_player uuid,
    p_node_key text,
    p_actions integer
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
    v_action integer;
    v_large_sticks integer := 0;
    v_nests integer := 0;
    v_eggs integer := 0;
    v_feathers integer := 0;
    v_large_name text;
    v_item bigint;
begin
    v_large_name := case p_node_key
        when 'birch_tree' then 'Birch Large Stick'
        when 'pine_tree' then 'Pine Large Stick'
        when 'willow_tree' then 'Willow Large Stick'
        when 'oak_tree' then 'Oak Large Stick'
        when 'ash_tree' then 'Ash Large Stick'
        when 'maple_tree' then 'Maple Large Stick'
        when 'yew_tree' then 'Yew Large Stick'
        when 'ancient_tree' then 'Ancient Large Stick'
        else null end;

    if v_large_name is null then return '{}'::jsonb; end if;

    for v_action in 1..greatest(1,p_actions) loop
        if random() < 0.25 then v_large_sticks := v_large_sticks + 1; end if;
        if random() < 0.10 then
            v_nests := v_nests + 1;
            -- A discovered nest always contains eggs, feathers, or both.
            if random() < 0.70 then v_eggs := v_eggs + 1 + floor(random()*4)::integer; end if;
            if random() < 0.70 then v_feathers := v_feathers + 1 + floor(random()*6)::integer; end if;
            if v_eggs = 0 and v_feathers = 0 then v_feathers := 1; end if;
        end if;
    end loop;

    if v_large_sticks > 0 then
        select id into v_item from public.items where lower(name)=lower(v_large_name) limit 1;
        perform public.grant_gathered_item(p_player,v_item,v_large_sticks);
    end if;
    if v_nests > 0 then
        select id into v_item from public.items where lower(name)='bird nest' limit 1;
        perform public.grant_gathered_item(p_player,v_item,v_nests);
    end if;
    if v_eggs > 0 then
        select id into v_item from public.items where lower(name)='egg' limit 1;
        perform public.grant_gathered_item(p_player,v_item,v_eggs);
    end if;
    if v_feathers > 0 then
        select id into v_item from public.items where lower(name) in ('feather','feathers') order by case when lower(name)='feather' then 0 else 1 end limit 1;
        perform public.grant_gathered_item(p_player,v_item,v_feathers);
    end if;

    return jsonb_build_object(
        'large_stick_name',v_large_name,
        'large_sticks',v_large_sticks,
        'bird_nests',v_nests,
        'eggs',v_eggs,
        'feathers',v_feathers
    );
end;
$$;

-- Preserve migration 024's gathering implementation as the secure core.
alter function public.gather_resource(text,integer) rename to gather_resource_024_core;

create or replace function public.gather_resource(p_node_key text, p_actions integer default 1)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
    v_player uuid := auth.uid();
    v_profession text;
    v_result jsonb;
    v_finds jsonb := '{}'::jsonb;
    v_arrow_id bigint;
    v_bow record;
    v_knife_owned boolean := false;
    v_bonus_item text;
    v_bonus_qty integer;
    v_recovered integer := 0;
begin
    if v_player is null then raise exception 'Sign in required.'; end if;
    select profession into v_profession from public.gathering_resource_nodes where node_key=p_node_key and is_active;

    if v_profession='hunting' then
        -- Any crafted wood bow can be used. Prefer the strongest bow currently owned.
        select i.id, i.name, b.damage, b.maximum_durability
        into v_bow
        from public.inventory inv
        join public.items i on i.id=inv.item_id
        join public.bow_definitions b on b.item_id=i.id
        where inv.player_id=v_player and inv.quantity>0
        order by b.damage desc
        limit 1;
        if not found then raise exception 'Hunting requires a crafted bow.'; end if;

        select id into v_arrow_id from public.items where lower(name)='arrow' limit 1;
        if public.shared_item_quantity(v_player,v_arrow_id) < greatest(1,p_actions) then
            raise exception 'You need one Arrow for every hunting action.';
        end if;
        perform public.consume_shared_item(v_player,v_arrow_id,greatest(1,p_actions));

        select exists(
            select 1 from public.player_profession_equipment pe
            where pe.player_id=v_player and pe.equipment_key='hunting_knife' and pe.current_durability>0
        ) into v_knife_owned;
    end if;

    v_result := public.gather_resource_024_core(p_node_key,p_actions);

    if v_profession='woodcutting' then
        v_finds := public.grant_woodcutting_finds(v_player,p_node_key,p_actions);
        v_result := v_result || jsonb_build_object('woodcutting_finds',v_finds);
    elsif v_profession='hunting' then
        -- 60% recovery after successful shots.
        for v_bonus_qty in 1..greatest(1,p_actions) loop
            if random() < 0.60 then v_recovered := v_recovered + 1; end if;
        end loop;
        if v_recovered>0 then perform public.grant_gathered_item(v_player,v_arrow_id,v_recovered); end if;

        -- Without the knife, meat remains but hides/pelts are discarded.
        v_bonus_item := v_result->>'bonus_item';
        v_bonus_qty := coalesce((v_result->>'bonus_quantity')::integer,0);
        if not v_knife_owned and v_bonus_qty>0 and v_bonus_item is not null
           and (lower(v_bonus_item) like '%hide%' or lower(v_bonus_item) like '%pelt%') then
            perform public.consume_shared_item(v_player,(select id from public.items where lower(name)=lower(v_bonus_item) limit 1),v_bonus_qty);
            v_result := jsonb_set(v_result,'{bonus_quantity}','0'::jsonb,true)
                || jsonb_build_object('knife_required_for_bonus',true,'discarded_bonus',v_bonus_item);
        end if;
        v_result := v_result || jsonb_build_object(
            'bow_name',v_bow.name,
            'bow_damage',v_bow.damage,
            'arrows_used',greatest(1,p_actions),
            'arrows_recovered',v_recovered,
            'hunting_knife_owned',v_knife_owned
        );
    end if;

    return v_result;
end;
$$;

revoke all on function public.gather_resource(text,integer) from public,anon;
grant execute on function public.gather_resource(text,integer) to authenticated;

-- ------------------------------------------------------------
-- Cooking fire: nest starts 60 seconds; each log adds 600 seconds
-- ------------------------------------------------------------
create table if not exists public.player_cooking_fires (
    player_id uuid primary key references public.players(id) on delete cascade,
    burns_until timestamptz,
    updated_at timestamptz not null default now()
);
alter table public.player_cooking_fires enable row level security;
drop policy if exists "Players read own cooking fire" on public.player_cooking_fires;
create policy "Players read own cooking fire" on public.player_cooking_fires
for select to authenticated using(auth.uid()=player_id);

create or replace function public.get_my_cooking_fire()
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_until timestamptz; v_remaining integer;
begin
 if auth.uid() is null then raise exception 'Sign in required.'; end if;
 select burns_until into v_until from public.player_cooking_fires where player_id=auth.uid();
 v_remaining:=greatest(0,ceil(extract(epoch from (coalesce(v_until,now())-now())))::integer);
 return jsonb_build_object('burns_until',v_until,'remaining_seconds',v_remaining,'is_lit',v_remaining>0);
end;$$;

create or replace function public.start_cooking_fire()
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_nest bigint; v_until timestamptz;
begin
 if auth.uid() is null then raise exception 'Sign in required.'; end if;
 select id into v_nest from public.items where lower(name)='bird nest' limit 1;
 if exists(select 1 from public.player_cooking_fires where player_id=auth.uid() and burns_until>now()) then
   raise exception 'The fire is already burning. Add a log instead.';
 end if;
 if public.shared_item_quantity(auth.uid(),v_nest)<1 then raise exception 'You need 1 Bird Nest to start the fire.'; end if;
 perform public.consume_shared_item(auth.uid(),v_nest,1);
 v_until:=now()+interval '60 seconds';
 insert into public.player_cooking_fires(player_id,burns_until,updated_at)
 values(auth.uid(),v_until,now())
 on conflict(player_id) do update set burns_until=excluded.burns_until,updated_at=now();
 return jsonb_build_object('burns_until',v_until,'remaining_seconds',60,'item_used','Bird Nest');
end;$$;

create or replace function public.add_log_to_cooking_fire(p_log_name text default 'Birch Log')
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_log bigint; v_until timestamptz; v_base timestamptz;
begin
 if auth.uid() is null then raise exception 'Sign in required.'; end if;
 if p_log_name is null or lower(p_log_name) not like '% log' then raise exception 'Choose a valid log.'; end if;
 select id into v_log from public.items where lower(name)=lower(p_log_name) limit 1;
 if v_log is null then raise exception 'That log does not exist.'; end if;
 if public.shared_item_quantity(auth.uid(),v_log)<1 then raise exception 'You do not have a %.',p_log_name; end if;
 select burns_until into v_until from public.player_cooking_fires where player_id=auth.uid() for update;
 if v_until is null or v_until<=now() then raise exception 'The fire is out. Start it with a Bird Nest first.'; end if;
 perform public.consume_shared_item(auth.uid(),v_log,1);
 v_base:=greatest(v_until,now());
 v_until:=v_base+interval '600 seconds';
 update public.player_cooking_fires set burns_until=v_until,updated_at=now() where player_id=auth.uid();
 return jsonb_build_object('burns_until',v_until,'remaining_seconds',greatest(0,ceil(extract(epoch from (v_until-now())))::integer),'item_used',p_log_name);
end;$$;

grant execute on function public.get_my_cooking_fire() to authenticated;
grant execute on function public.start_cooking_fire() to authenticated;
grant execute on function public.add_log_to_cooking_fire(text) to authenticated;

commit;
