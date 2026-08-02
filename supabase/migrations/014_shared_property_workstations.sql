-- ============================================================
-- MIDGARD LEGACY 014 - SHARED PROPERTY WORKSTATIONS
-- Run after migration 013.
-- Backpack -> active Cart -> Storage Yard consumption order.
-- Forge has fuel, smelting storage and timed queues.
-- Workbench has timed crafting but no fuel.
-- ============================================================

create table if not exists public.workstation_recipes (
  id bigserial primary key,
  recipe_key text unique not null,
  station_type text not null check (station_type in ('forge','workbench')),
  recipe_type text not null default 'craft' check (recipe_type in ('smelt','craft')),
  name text not null,
  description text not null default '',
  output_item_id bigint references public.items(id),
  output_material_key text,
  output_quantity bigint not null default 1 check (output_quantity > 0),
  required_station_level integer not null default 1 check (required_station_level > 0),
  duration_seconds integer not null default 10 check (duration_seconds >= 1),
  fuel_seconds_required integer not null default 0 check (fuel_seconds_required >= 0),
  sort_order integer not null default 0,
  is_active boolean not null default true,
  constraint workstation_recipe_output check (
    (output_item_id is not null and output_material_key is null) or
    (output_item_id is null and output_material_key is not null)
  )
);

create table if not exists public.workstation_recipe_ingredients (
    id bigserial primary key,
    recipe_id bigint not null
        references public.workstation_recipes(id)
        on delete cascade,
    item_id bigint
        references public.items(id),
    forge_material_key text,
    quantity bigint not null
        check (quantity > 0),
    constraint workstation_ingredient_source check (
        (
            item_id is not null
            and forge_material_key is null
        )
        or
        (
            item_id is null
            and forge_material_key is not null
        )
    )
);

-- Older failed versions used all three source columns as the primary key.
-- A PostgreSQL primary key makes every included column NOT NULL, which meant
-- an ingredient could not be either an item OR a Forge material. Repair any
-- partially-created table before continuing.
alter table public.workstation_recipe_ingredients
    drop constraint if exists workstation_recipe_ingredients_pkey;

alter table public.workstation_recipe_ingredients
    alter column item_id drop not null;

alter table public.workstation_recipe_ingredients
    alter column forge_material_key drop not null;

alter table public.workstation_recipe_ingredients
    add column if not exists id bigserial;

do $$
begin
    if not exists (
        select 1
        from pg_constraint
        where conrelid = 'public.workstation_recipe_ingredients'::regclass
          and contype = 'p'
    ) then
        alter table public.workstation_recipe_ingredients
            add constraint workstation_recipe_ingredients_pkey
            primary key (id);
    end if;
end
$$;

create unique index if not exists workstation_recipe_item_unique
    on public.workstation_recipe_ingredients (recipe_id, item_id)
    where item_id is not null;

create unique index if not exists workstation_recipe_forge_material_unique
    on public.workstation_recipe_ingredients (recipe_id, forge_material_key)
    where forge_material_key is not null;

create table if not exists public.player_workstations (
  player_id uuid not null references public.players(id) on delete cascade,
  station_type text not null check (station_type in ('forge','workbench')),
  fuel_seconds integer not null default 0 check (fuel_seconds >= 0),
  is_running boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (player_id, station_type)
);

create table if not exists public.player_forge_materials (
  player_id uuid not null references public.players(id) on delete cascade,
  material_key text not null,
  quantity bigint not null default 0 check (quantity >= 0),
  primary key (player_id, material_key)
);

create table if not exists public.workstation_queue (
  id bigserial primary key,
  player_id uuid not null references public.players(id) on delete cascade,
  station_type text not null check (station_type in ('forge','workbench')),
  recipe_id bigint not null references public.workstation_recipes(id),
  batches integer not null default 1 check (batches > 0),
  started_at timestamptz not null default now(),
  completes_at timestamptz not null,
  claimed_at timestamptz,
  status text not null default 'queued' check (status in ('queued','claimed','cancelled'))
);

create index if not exists workstation_queue_player_idx
  on public.workstation_queue(player_id, station_type, status, completes_at);

alter table public.workstation_recipes enable row level security;
alter table public.workstation_recipe_ingredients enable row level security;
alter table public.player_workstations enable row level security;
alter table public.player_forge_materials enable row level security;
alter table public.workstation_queue enable row level security;

drop policy if exists "recipes readable" on public.workstation_recipes;
create policy "recipes readable" on public.workstation_recipes for select using (true);
drop policy if exists "ingredients readable" on public.workstation_recipe_ingredients;
create policy "ingredients readable" on public.workstation_recipe_ingredients for select using (true);
drop policy if exists "own workstations readable" on public.player_workstations;
create policy "own workstations readable" on public.player_workstations for select using (auth.uid()=player_id);
drop policy if exists "own forge materials readable" on public.player_forge_materials;
create policy "own forge materials readable" on public.player_forge_materials for select using (auth.uid()=player_id);
drop policy if exists "own queue readable" on public.workstation_queue;
create policy "own queue readable" on public.workstation_queue for select using (auth.uid()=player_id);

create or replace function public.station_level_for(p_player uuid, p_station text)
returns integer language sql stable security definer set search_path=public as $$
 select case p_station
  when 'workbench' then greatest(0,coalesce(workbench_level,0))
  when 'forge' then greatest(0,coalesce(forge_level,0))
  else 0 end
 from players where id=p_player;
$$;

create or replace function public.shared_item_quantity(p_player uuid,p_item bigint)
returns bigint language sql stable security definer set search_path=public as $$
 select
  coalesce((select quantity from inventory where player_id=p_player and item_id=p_item),0) +
  coalesce((select sum(ci.quantity) from player_carts pc join cart_items ci on ci.cart_id=pc.id where pc.player_id=p_player and pc.is_active=true and ci.item_id=p_item),0) +
  coalesce((select quantity from player_storage where player_id=p_player and item_id=p_item),0);
$$;

create or replace function public.consume_shared_item(p_player uuid,p_item bigint,p_quantity bigint)
returns void language plpgsql security definer set search_path=public as $$
declare v_need bigint:=p_quantity; v_take bigint; v_have bigint; v_cart bigint;
begin
 if p_quantity<=0 then return; end if;
 if shared_item_quantity(p_player,p_item)<p_quantity then raise exception 'Not enough materials.'; end if;
 -- Backpack first
 select coalesce(quantity,0) into v_have from inventory where player_id=p_player and item_id=p_item for update;
 v_take:=least(v_need,coalesce(v_have,0));
 if v_take>0 then update inventory set quantity=quantity-v_take where player_id=p_player and item_id=p_item; delete from inventory where player_id=p_player and item_id=p_item and quantity<=0; v_need:=v_need-v_take; end if;
 -- Active cart second
 if v_need>0 then
  select id into v_cart from player_carts where player_id=p_player and is_active=true order by id limit 1;
  if v_cart is not null then
   select coalesce(quantity,0) into v_have from cart_items where cart_id=v_cart and item_id=p_item for update;
   v_take:=least(v_need,coalesce(v_have,0));
   if v_take>0 then update cart_items set quantity=quantity-v_take where cart_id=v_cart and item_id=p_item; delete from cart_items where cart_id=v_cart and item_id=p_item and quantity<=0; v_need:=v_need-v_take; end if;
  end if;
 end if;
 -- Storage Yard last
 if v_need>0 then
  update player_storage set quantity=quantity-v_need where player_id=p_player and item_id=p_item;
  delete from player_storage where player_id=p_player and item_id=p_item and quantity<=0;
 end if;
end;$$;

create or replace function public.add_station_fuel(p_item_id bigint,p_quantity bigint)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_player uuid:=auth.uid(); v_name text; v_seconds bigint;
begin
 if v_player is null then raise exception 'Sign in required.'; end if;
 if p_quantity<=0 then raise exception 'Quantity must be positive.'; end if;
 select lower(name) into v_name from items where id=p_item_id;
 v_seconds:=case when v_name like '%coal%' then 300 when v_name like '%log%' then 60 else 0 end;
 if v_seconds=0 then raise exception 'Only coal or logs can fuel the Forge.'; end if;
 perform consume_shared_item(v_player,p_item_id,p_quantity);
 insert into player_workstations(player_id,station_type,fuel_seconds,is_running)
 values(v_player,'forge',v_seconds*p_quantity,true)
 on conflict(player_id,station_type) do update set fuel_seconds=player_workstations.fuel_seconds+excluded.fuel_seconds,is_running=true,updated_at=now();
 return jsonb_build_object('fuel_seconds_added',v_seconds*p_quantity);
end;$$;

create or replace function public.queue_workstation_recipe(p_recipe_key text,p_batches integer default 1)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_player uuid:=auth.uid(); v_recipe workstation_recipes%rowtype; v_ing record; v_level integer; v_duration integer; v_fuel integer; v_mat bigint;
begin
 if v_player is null then raise exception 'Sign in required.'; end if;
 if p_batches<1 or p_batches>999 then raise exception 'Invalid batch amount.'; end if;
 select * into v_recipe from workstation_recipes where recipe_key=p_recipe_key and is_active=true;
 if v_recipe.id is null then raise exception 'Recipe not found.'; end if;
 v_level:=station_level_for(v_player,v_recipe.station_type);
 if v_level<v_recipe.required_station_level then raise exception 'Station level % required.',v_recipe.required_station_level; end if;
 if v_recipe.station_type='forge' and v_recipe.fuel_seconds_required>0 then
  insert into player_workstations(player_id,station_type) values(v_player,'forge') on conflict do nothing;
  select fuel_seconds into v_fuel from player_workstations where player_id=v_player and station_type='forge' for update;
  if v_fuel < v_recipe.fuel_seconds_required*p_batches then raise exception 'The Forge needs more fuel.'; end if;
 end if;
 for v_ing in select * from workstation_recipe_ingredients where recipe_id=v_recipe.id loop
  if v_ing.item_id is not null then
   if shared_item_quantity(v_player,v_ing.item_id)<v_ing.quantity*p_batches then raise exception 'Not enough %.',(select name from items where id=v_ing.item_id); end if;
  else
   select coalesce(quantity,0) into v_mat from player_forge_materials where player_id=v_player and material_key=v_ing.forge_material_key;
   if v_mat<v_ing.quantity*p_batches then raise exception 'Not enough smelted %.',v_ing.forge_material_key; end if;
  end if;
 end loop;
 for v_ing in select * from workstation_recipe_ingredients where recipe_id=v_recipe.id loop
  if v_ing.item_id is not null then perform consume_shared_item(v_player,v_ing.item_id,v_ing.quantity*p_batches);
  else update player_forge_materials set quantity=quantity-v_ing.quantity*p_batches where player_id=v_player and material_key=v_ing.forge_material_key; end if;
 end loop;
 if v_recipe.station_type='forge' and v_recipe.fuel_seconds_required>0 then update player_workstations set fuel_seconds=fuel_seconds-v_recipe.fuel_seconds_required*p_batches,updated_at=now() where player_id=v_player and station_type='forge'; end if;
 v_duration:=v_recipe.duration_seconds*p_batches;
 insert into workstation_queue(player_id,station_type,recipe_id,batches,completes_at) values(v_player,v_recipe.station_type,v_recipe.id,p_batches,now()+make_interval(secs=>v_duration));
 return jsonb_build_object('queued',true,'seconds',v_duration,'recipe',v_recipe.name);
end;$$;

create or replace function public.claim_workstation_job(p_job_id bigint)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_player uuid:=auth.uid(); v_job workstation_queue%rowtype; v_recipe workstation_recipes%rowtype; v_total bigint;
begin
 select * into v_job from workstation_queue where id=p_job_id and player_id=v_player for update;
 if v_job.id is null then raise exception 'Job not found.'; end if;
 if v_job.status<>'queued' then raise exception 'Job already collected.'; end if;
 if now()<v_job.completes_at then raise exception 'This job is not finished yet.'; end if;
 select * into v_recipe from workstation_recipes where id=v_job.recipe_id;
 v_total:=v_recipe.output_quantity*v_job.batches;
 if v_recipe.output_item_id is not null then
  insert into player_storage(player_id,item_id,quantity) values(v_player,v_recipe.output_item_id,v_total)
  on conflict(player_id,item_id) do update set quantity=player_storage.quantity+excluded.quantity;
 else
  insert into player_forge_materials(player_id,material_key,quantity) values(v_player,v_recipe.output_material_key,v_total)
  on conflict(player_id,material_key) do update set quantity=player_forge_materials.quantity+excluded.quantity;
 end if;
 update workstation_queue set status='claimed',claimed_at=now() where id=v_job.id;
 return jsonb_build_object('claimed',true,'name',v_recipe.name,'quantity',v_total);
end;$$;

create or replace function public.get_workstation_screen(p_station text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_player uuid:=auth.uid(); v_level integer;
begin
 v_level:=station_level_for(v_player,p_station);
 return jsonb_build_object(
  'station',p_station,'level',v_level,
  'fuel_seconds',coalesce((select fuel_seconds from player_workstations where player_id=v_player and station_type=p_station),0),
  'recipes',coalesce((select jsonb_agg(jsonb_build_object('key',r.recipe_key,'name',r.name,'description',r.description,'type',r.recipe_type,'output_quantity',r.output_quantity,'level',r.required_station_level,'seconds',r.duration_seconds,'fuel',r.fuel_seconds_required,'ingredients',(select coalesce(jsonb_agg(jsonb_build_object('name',coalesce(i.name,ri.forge_material_key),'quantity',ri.quantity,'available',case when ri.item_id is not null then shared_item_quantity(v_player,ri.item_id) else coalesce((select quantity from player_forge_materials fm where fm.player_id=v_player and fm.material_key=ri.forge_material_key),0) end)), '[]'::jsonb) from workstation_recipe_ingredients ri left join items i on i.id=ri.item_id where ri.recipe_id=r.id)) order by r.sort_order,r.id) from workstation_recipes r where r.station_type=p_station and r.is_active=true and r.required_station_level<=v_level),'[]'::jsonb),
  'forge_materials',coalesce((select jsonb_object_agg(material_key,quantity) from player_forge_materials where player_id=v_player),'{}'::jsonb),
  'queue',coalesce((select jsonb_agg(jsonb_build_object('id',q.id,'name',r.name,'batches',q.batches,'completes_at',q.completes_at,'ready',now()>=q.completes_at,'status',q.status) order by q.completes_at) from workstation_queue q join workstation_recipes r on r.id=q.recipe_id where q.player_id=v_player and q.station_type=p_station and q.status='queued'),'[]'::jsonb)
 );
end;$$;

grant execute on function public.add_station_fuel(bigint,bigint) to authenticated;
grant execute on function public.queue_workstation_recipe(text,integer) to authenticated;
grant execute on function public.claim_workstation_job(bigint) to authenticated;
grant execute on function public.get_workstation_screen(text) to authenticated;

-- ============================================================
-- SEED THE FIRST FORGE RECIPES
-- ============================================================
-- A typed RECORD is used here. The previous migration accidentally reused a
-- BIGINT variable for a text recipe key such as "forge_iron_bar".

do $$
declare
    v_recipe_id bigint;
    v_item_id bigint;
    v_recipe record;
begin
    -- --------------------------------------------------------
    -- Smelt Bog Iron into the Forge's internal iron storage.
    -- --------------------------------------------------------
    select id
    into v_item_id
    from public.items
    where lower(name) = 'bog iron'
    limit 1;

    if v_item_id is not null then
        insert into public.workstation_recipes (
            recipe_key,
            station_type,
            recipe_type,
            name,
            description,
            output_material_key,
            output_quantity,
            required_station_level,
            duration_seconds,
            fuel_seconds_required,
            sort_order
        )
        values (
            'smelt_bog_iron',
            'forge',
            'smelt',
            'Smelt Bog Iron',
            'Smelt raw Bog Iron into iron stored inside your Forge.',
            'iron',
            1,
            1,
            20,
            20,
            10
        )
        on conflict (recipe_key)
        do update set
            description = excluded.description,
            output_material_key = excluded.output_material_key,
            output_item_id = null
        returning id into v_recipe_id;

        insert into public.workstation_recipe_ingredients (
            recipe_id,
            item_id,
            quantity
        )
        values (
            v_recipe_id,
            v_item_id,
            5
        )
        on conflict do nothing;
    end if;

    -- --------------------------------------------------------
    -- Recipes made from iron already smelted inside the Forge.
    -- --------------------------------------------------------
    for v_recipe in
        select *
        from (
            values
                ('forge_iron_bar',      'Iron Bar',      1, 1, 15, 15, 20, 1),
                ('forge_iron_nails',    'Iron Nails',   25, 1, 20, 20, 30, 1),
                ('forge_iron_axe_head', 'Iron Axe Head', 1, 2, 45, 45, 40, 2),
                ('forge_iron_hoop',     'Iron Hoop',     2, 1, 25, 25, 50, 1)
        ) as recipe_data (
            recipe_key,
            item_name,
            output_quantity,
            station_level,
            duration_seconds,
            fuel_seconds,
            sort_order,
            iron_required
        )
    loop
        select id
        into v_item_id
        from public.items
        where lower(name) = lower(v_recipe.item_name)
        limit 1;

        if v_item_id is not null then
            insert into public.workstation_recipes (
                recipe_key,
                station_type,
                recipe_type,
                name,
                description,
                output_item_id,
                output_material_key,
                output_quantity,
                required_station_level,
                duration_seconds,
                fuel_seconds_required,
                sort_order
            )
            values (
                v_recipe.recipe_key,
                'forge',
                'craft',
                v_recipe.item_name,
                'Forge this item from iron already smelted inside your Forge.',
                v_item_id,
                null,
                v_recipe.output_quantity,
                v_recipe.station_level,
                v_recipe.duration_seconds,
                v_recipe.fuel_seconds,
                v_recipe.sort_order
            )
            on conflict (recipe_key)
            do update set
                output_item_id = excluded.output_item_id,
                output_material_key = null,
                output_quantity = excluded.output_quantity,
                required_station_level = excluded.required_station_level,
                duration_seconds = excluded.duration_seconds,
                fuel_seconds_required = excluded.fuel_seconds_required,
                sort_order = excluded.sort_order
            returning id into v_recipe_id;

            insert into public.workstation_recipe_ingredients (
                recipe_id,
                forge_material_key,
                quantity
            )
            values (
                v_recipe_id,
                'iron',
                v_recipe.iron_required
            )
            on conflict do nothing;
        end if;
    end loop;
end
$$;

-- Workbench seed recipes from current game items.
do $$
declare r bigint; outid bigint; in1 bigint; in2 bigint; in3 bigint;
begin
 -- key, output, output qty, input1, qty1, input2, qty2, input3, qty3, level, seconds
 for r in select 1 loop end loop;
 select id into outid from items where lower(name)='wooden shaft'; select id into in1 from items where lower(name)='birch plank';
 if outid is not null and in1 is not null then insert into workstation_recipes(recipe_key,station_type,name,description,output_item_id,output_quantity,required_station_level,duration_seconds,sort_order) values('workbench_wooden_shaft','workbench','Wooden Shaft','Shape a plank into a strong shaft.',outid,1,1,8,10) on conflict(recipe_key) do update set output_item_id=excluded.output_item_id returning id into r; insert into workstation_recipe_ingredients(recipe_id,item_id,quantity) values(r,in1,1) on conflict do nothing; end if;
 select id into outid from items where lower(name)='empty bucket'; select id into in1 from items where lower(name)='birch plank'; select id into in2 from items where lower(name)='iron hoop';
 if outid is not null and in1 is not null and in2 is not null then insert into workstation_recipes(recipe_key,station_type,name,description,output_item_id,output_quantity,required_station_level,duration_seconds,sort_order) values('workbench_bucket','workbench','Empty Bucket','Build a watertight wooden bucket.',outid,1,1,30,20) on conflict(recipe_key) do update set output_item_id=excluded.output_item_id returning id into r; insert into workstation_recipe_ingredients(recipe_id,item_id,quantity) values(r,in1,5) on conflict do nothing; insert into workstation_recipe_ingredients(recipe_id,item_id,quantity) values(r,in2,3) on conflict do nothing; end if;
 select id into outid from items where lower(name)='barrel staves'; select id into in1 from items where lower(name)='birch plank';
 if outid is not null and in1 is not null then insert into workstation_recipes(recipe_key,station_type,name,description,output_item_id,output_quantity,required_station_level,duration_seconds,sort_order) values('workbench_barrel_staves','workbench','Barrel Staves','Shape planks into barrel staves.',outid,30,1,40,30) on conflict(recipe_key) do update set output_item_id=excluded.output_item_id returning id into r; insert into workstation_recipe_ingredients(recipe_id,item_id,quantity) values(r,in1,30) on conflict do nothing; end if;
 select id into outid from items where lower(name)='barrel lid'; select id into in1 from items where lower(name)='birch plank';
 if outid is not null and in1 is not null then insert into workstation_recipes(recipe_key,station_type,name,description,output_item_id,output_quantity,required_station_level,duration_seconds,sort_order) values('workbench_barrel_lid','workbench','Barrel Lid','Build a fitted barrel lid.',outid,1,1,20,40) on conflict(recipe_key) do update set output_item_id=excluded.output_item_id returning id into r; insert into workstation_recipe_ingredients(recipe_id,item_id,quantity) values(r,in1,5) on conflict do nothing; end if;
 select id into outid from items where lower(name)='empty barrel'; select id into in1 from items where lower(name)='barrel staves'; select id into in2 from items where lower(name)='barrel lid'; select id into in3 from items where lower(name)='iron hoop';
 if outid is not null and in1 is not null and in2 is not null and in3 is not null then insert into workstation_recipes(recipe_key,station_type,name,description,output_item_id,output_quantity,required_station_level,duration_seconds,sort_order) values('workbench_empty_barrel','workbench','Empty Barrel','Assemble staves, lid and hoops into a barrel.',outid,1,2,90,50) on conflict(recipe_key) do update set output_item_id=excluded.output_item_id returning id into r; insert into workstation_recipe_ingredients(recipe_id,item_id,quantity) values(r,in1,30) on conflict do nothing; insert into workstation_recipe_ingredients(recipe_id,item_id,quantity) values(r,in2,1) on conflict do nothing; insert into workstation_recipe_ingredients(recipe_id,item_id,quantity) values(r,in3,6) on conflict do nothing; end if;
end$$;
