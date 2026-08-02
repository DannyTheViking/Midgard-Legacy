-- Midgard Legacy Update 026 revision
-- Property Cooking Fire, Cooking skill, burnt food and coal collection.

begin;

insert into public.items (name, description, type, weight_kg)
values
    ('Burnt Food', 'A ruined meal. It cannot be eaten, but it can be used as weak Forge fuel.', 'fuel', 0.10),
    ('Roasted Meat', 'Simple meat cooked over the fire.', 'food', 0.20),
    ('Cooked Fish', 'Fresh fish cooked over the fire.', 'food', 0.20),
    ('Boiled Egg', 'An egg boiled in an iron pot.', 'food', 0.10),
    ('Meat Broth', 'A basic broth cooked in an iron pot.', 'food', 0.30)
on conflict (name) do update set
    description = excluded.description,
    type = excluded.type,
    weight_kg = excluded.weight_kg;

alter table public.player_cooking_fires
    add column if not exists logs_added integer not null default 0,
    add column if not exists coal_ready integer not null default 0;

create table if not exists public.cooking_recipes (
    recipe_key text primary key,
    name text not null,
    description text not null,
    required_level integer not null default 1,
    duration_seconds integer not null default 10,
    xp_reward integer not null default 10,
    output_item_name text not null,
    output_quantity integer not null default 1,
    ingredient_item_name text not null,
    ingredient_quantity integer not null default 1,
    requires_tool text,
    sort_order integer not null default 100,
    is_active boolean not null default true
);

insert into public.cooking_recipes
(recipe_key,name,description,required_level,duration_seconds,xp_reward,output_item_name,output_quantity,ingredient_item_name,ingredient_quantity,requires_tool,sort_order)
values
('roasted_meat','Roasted Meat','Cook raw meat directly over the fire.',1,10,12,'Roasted Meat',1,'Raw Meat',1,null,10),
('cooked_fish','Cooked Fish','Cook a fresh fish directly over the fire.',1,10,12,'Cooked Fish',1,'Raw Fish',1,null,20),
('boiled_egg','Boiled Egg','Boil an egg using an Iron Pot.',2,15,16,'Boiled Egg',1,'Egg',1,'Iron Pot',30),
('meat_broth','Meat Broth','Make a simple broth using an Iron Pot.',3,25,24,'Meat Broth',1,'Raw Meat',2,'Iron Pot',40)
on conflict(recipe_key) do update set
name=excluded.name,description=excluded.description,required_level=excluded.required_level,
duration_seconds=excluded.duration_seconds,xp_reward=excluded.xp_reward,
output_item_name=excluded.output_item_name,output_quantity=excluded.output_quantity,
ingredient_item_name=excluded.ingredient_item_name,ingredient_quantity=excluded.ingredient_quantity,
requires_tool=excluded.requires_tool,sort_order=excluded.sort_order,is_active=true;

create or replace function public.midgard_grant_inventory_item(p_player uuid,p_item bigint,p_quantity bigint)
returns void language plpgsql security definer set search_path=public as $$
begin
    if p_quantity <= 0 then return; end if;
    insert into public.inventory(player_id,item_id,quantity)
    values(p_player,p_item,p_quantity)
    on conflict(player_id,item_id) do update set quantity=public.inventory.quantity+excluded.quantity;
end;$$;

create or replace function public.refresh_cooking_fire_coal(p_player uuid)
returns void language plpgsql security definer set search_path=public as $$
begin
    update public.player_cooking_fires
    set coal_ready = case when logs_added > 0 then 5 else 0 end,
        logs_added = 0,
        updated_at = now()
    where player_id=p_player
      and burns_until is not null
      and burns_until <= now()
      and coal_ready = 0;
end;$$;

create or replace function public.get_my_cooking_fire()
returns jsonb language plpgsql security definer set search_path=public as $$
declare
    v_until timestamptz;
    v_remaining integer;
    v_coal integer:=0;
    v_logs integer:=0;
    v_cooking_xp bigint:=0;
    v_level integer:=1;
    v_recipes jsonb;
begin
    if auth.uid() is null then raise exception 'Sign in required.'; end if;
    perform public.refresh_cooking_fire_coal(auth.uid());

    select burns_until,coal_ready,logs_added
      into v_until,v_coal,v_logs
    from public.player_cooking_fires where player_id=auth.uid();

    select coalesce(cooking_xp,0) into v_cooking_xp from public.skills where player_id=auth.uid();
    v_level:=public.midgard_skill_level(v_cooking_xp);
    v_remaining:=greatest(0,ceil(extract(epoch from (coalesce(v_until,now())-now())))::integer);

    select coalesce(jsonb_agg(jsonb_build_object(
        'key',r.recipe_key,'name',r.name,'description',r.description,
        'level',r.required_level,'seconds',r.duration_seconds,'xp',r.xp_reward,
        'output',r.output_item_name,'output_quantity',r.output_quantity,
        'ingredient',r.ingredient_item_name,'ingredient_quantity',r.ingredient_quantity,
        'requires_tool',r.requires_tool,
        'unlocked',v_level>=r.required_level,
        'available',coalesce(public.shared_item_quantity(auth.uid(),i.id),0)
    ) order by r.sort_order),'[]'::jsonb)
    into v_recipes
    from public.cooking_recipes r
    left join public.items i on lower(i.name)=lower(r.ingredient_item_name)
    where r.is_active=true;

    return jsonb_build_object(
        'burns_until',v_until,'remaining_seconds',v_remaining,'is_lit',v_remaining>0,
        'coal_ready',coalesce(v_coal,0),'logs_added',coalesce(v_logs,0),
        'cooking_xp',v_cooking_xp,'cooking_level',v_level,'recipes',v_recipes
    );
end;$$;

create or replace function public.start_cooking_fire()
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_nest bigint; v_until timestamptz; v_coal integer;
begin
    if auth.uid() is null then raise exception 'Sign in required.'; end if;
    perform public.refresh_cooking_fire_coal(auth.uid());
    select coal_ready into v_coal from public.player_cooking_fires where player_id=auth.uid();
    if coalesce(v_coal,0)>0 then raise exception 'Collect the coal from your empty fire pit first.'; end if;
    select id into v_nest from public.items where lower(name)='bird nest' limit 1;
    if exists(select 1 from public.player_cooking_fires where player_id=auth.uid() and burns_until>now()) then
        raise exception 'The fire is already burning. Add a log instead.';
    end if;
    if public.shared_item_quantity(auth.uid(),v_nest)<1 then raise exception 'You need 1 Bird Nest to start the fire.'; end if;
    perform public.consume_shared_item(auth.uid(),v_nest,1);
    v_until:=now()+interval '60 seconds';
    insert into public.player_cooking_fires(player_id,burns_until,logs_added,coal_ready,updated_at)
    values(auth.uid(),v_until,0,0,now())
    on conflict(player_id) do update set burns_until=excluded.burns_until,logs_added=0,coal_ready=0,updated_at=now();
    return jsonb_build_object('burns_until',v_until,'remaining_seconds',60,'item_used','Bird Nest');
end;$$;

create or replace function public.add_log_to_cooking_fire(p_log_name text default 'Birch Log')
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_log bigint; v_until timestamptz;
begin
    if auth.uid() is null then raise exception 'Sign in required.'; end if;
    if p_log_name is null or lower(p_log_name) not like '% log' then raise exception 'Choose a valid log.'; end if;
    select id into v_log from public.items where lower(name)=lower(p_log_name) limit 1;
    if v_log is null then raise exception 'That log does not exist.'; end if;
    if public.shared_item_quantity(auth.uid(),v_log)<1 then raise exception 'You do not have a %.',p_log_name; end if;
    select burns_until into v_until from public.player_cooking_fires where player_id=auth.uid() for update;
    if v_until is null or v_until<=now() then raise exception 'The fire is out. Start it with a Bird Nest first.'; end if;
    perform public.consume_shared_item(auth.uid(),v_log,1);
    v_until:=greatest(v_until,now())+interval '600 seconds';
    update public.player_cooking_fires
       set burns_until=v_until,logs_added=logs_added+1,updated_at=now()
     where player_id=auth.uid();
    return jsonb_build_object('burns_until',v_until,'remaining_seconds',greatest(0,ceil(extract(epoch from (v_until-now())))::integer),'item_used',p_log_name);
end;$$;

create or replace function public.collect_cooking_fire_coal()
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_qty integer; v_coal bigint;
begin
    if auth.uid() is null then raise exception 'Sign in required.'; end if;
    perform public.refresh_cooking_fire_coal(auth.uid());
    select coal_ready into v_qty from public.player_cooking_fires where player_id=auth.uid() for update;
    if coalesce(v_qty,0)<=0 then raise exception 'There is no coal ready to collect.'; end if;
    select id into v_coal from public.items where lower(name)='coal' limit 1;
    if v_coal is null then raise exception 'Coal item is missing from the item catalogue.'; end if;
    perform public.midgard_grant_inventory_item(auth.uid(),v_coal,v_qty);
    update public.player_cooking_fires set coal_ready=0,burns_until=null,updated_at=now() where player_id=auth.uid();
    return jsonb_build_object('coal_collected',v_qty);
end;$$;

create or replace function public.cook_fire_recipe(p_recipe_key text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
    v_recipe public.cooking_recipes%rowtype;
    v_until timestamptz;
    v_xp bigint:=0;
    v_level integer:=1;
    v_burn numeric;
    v_failed boolean;
    v_ingredient bigint;
    v_output bigint;
    v_burnt bigint;
    v_tool bigint;
begin
    if auth.uid() is null then raise exception 'Sign in required.'; end if;
    select * into v_recipe from public.cooking_recipes where recipe_key=p_recipe_key and is_active=true;
    if not found then raise exception 'Cooking recipe not found.'; end if;
    select burns_until into v_until from public.player_cooking_fires where player_id=auth.uid() for update;
    if v_until is null or v_until<=now() then raise exception 'The Cooking Fire has gone out.'; end if;

    insert into public.skills(player_id) values(auth.uid()) on conflict(player_id) do nothing;
    select coalesce(cooking_xp,0) into v_xp from public.skills where player_id=auth.uid() for update;
    v_level:=public.midgard_skill_level(v_xp);
    if v_level<v_recipe.required_level then raise exception 'Cooking Level % required.',v_recipe.required_level; end if;

    if v_recipe.requires_tool is not null then
        select id into v_tool from public.items where lower(name)=lower(v_recipe.requires_tool) limit 1;
        if v_tool is null or public.shared_item_quantity(auth.uid(),v_tool)<1 then
            raise exception 'You need % to cook this recipe.',v_recipe.requires_tool;
        end if;
    end if;

    select id into v_ingredient from public.items where lower(name)=lower(v_recipe.ingredient_item_name) limit 1;
    if v_ingredient is null then raise exception 'Missing ingredient item: %',v_recipe.ingredient_item_name; end if;
    if public.shared_item_quantity(auth.uid(),v_ingredient)<v_recipe.ingredient_quantity then
        raise exception 'You need % × %.',v_recipe.ingredient_quantity,v_recipe.ingredient_item_name;
    end if;
    perform public.consume_shared_item(auth.uid(),v_ingredient,v_recipe.ingredient_quantity);

    -- 40% at level 1, falling by 2 percentage points per level, minimum 1%.
    v_burn:=greatest(0.01,0.40-((v_level-1)*0.02));
    v_failed:=random()<v_burn;

    if v_failed then
        select id into v_burnt from public.items where lower(name)='burnt food' limit 1;
        perform public.midgard_grant_inventory_item(auth.uid(),v_burnt,1);
        perform public.add_skill_xp('cooking',greatest(1,v_recipe.xp_reward/3));
        return jsonb_build_object('success',false,'burnt',true,'item','Burnt Food','burn_chance',v_burn,'cooking_level',v_level);
    end if;

    select id into v_output from public.items where lower(name)=lower(v_recipe.output_item_name) limit 1;
    if v_output is null then raise exception 'Missing output item: %',v_recipe.output_item_name; end if;
    perform public.midgard_grant_inventory_item(auth.uid(),v_output,v_recipe.output_quantity);
    perform public.add_skill_xp('cooking',v_recipe.xp_reward);
    return jsonb_build_object('success',true,'burnt',false,'item',v_recipe.output_item_name,'quantity',v_recipe.output_quantity,'burn_chance',v_burn,'cooking_level',v_level);
end;$$;

-- Burnt Food gives 30 seconds in the Forge; Coal remains 5 minutes and logs 1 minute.
create or replace function public.add_station_fuel(p_item_id bigint,p_quantity bigint)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_player uuid:=auth.uid(); v_name text; v_seconds bigint;
begin
 if v_player is null then raise exception 'Sign in required.'; end if;
 if p_quantity<=0 then raise exception 'Quantity must be positive.'; end if;
 select lower(name) into v_name from items where id=p_item_id;
 v_seconds:=case
   when v_name='burnt food' then 30
   when v_name like '%coal%' then 300
   when v_name like '%log%' then 60
   else 0 end;
 if v_seconds=0 then raise exception 'Only Burnt Food, coal or logs can fuel the Forge.'; end if;
 perform consume_shared_item(v_player,p_item_id,p_quantity);
 insert into player_workstations(player_id,station_type,fuel_seconds,is_running)
 values(v_player,'forge',v_seconds*p_quantity,true)
 on conflict(player_id,station_type) do update set fuel_seconds=player_workstations.fuel_seconds+excluded.fuel_seconds,is_running=true,updated_at=now();
 return jsonb_build_object('fuel_seconds_added',v_seconds*p_quantity);
end;$$;

grant execute on function public.get_my_cooking_fire() to authenticated;
grant execute on function public.start_cooking_fire() to authenticated;
grant execute on function public.add_log_to_cooking_fire(text) to authenticated;
grant execute on function public.collect_cooking_fire_coal() to authenticated;
grant execute on function public.cook_fire_recipe(text) to authenticated;

commit;
