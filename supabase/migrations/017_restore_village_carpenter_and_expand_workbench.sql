-- ============================================================
-- MIDGARD LEGACY
-- Migration 017
-- Restore Village Carpenter + Build the Separate Property Workbench
-- ============================================================
--
-- Village Carpenter remains an NPC village location.
-- Property Workbench is a separate player-owned crafting station.
--
-- Workbench responsibilities:
--   - woodworking and construction components
--   - medicine
--   - ordinary containers
--   - assembling axes and pickaxes from forged heads
--   - ordinary bows, arrows and shields
--
-- Not Workbench recipes:
--   - fishing rods and profession-improving equipment (Job Points)
--   - bee suits and bee smokers (Job Points)
--   - beehives (built on Bee Hive cards)
--   - cart and wagon parts (Wagon Builder)
--
-- Safe to run more than once.
-- ============================================================

begin;

-- ============================================================
-- 1. REQUIRED PICKAXE COMPONENT
-- ============================================================

insert into public.items (
    name,
    description,
    type,
    weight_kg
)
select
    'Iron Pickaxe Head',
    'A forged iron head ready to be fitted to a wooden shaft.',
    'component',
    2.500::numeric
where not exists (
    select 1
    from public.items
    where lower(name) = 'iron pickaxe head'
);

-- ============================================================
-- 2. MIGRATION HELPERS
-- ============================================================

create or replace function public.seed_workbench_recipe_017(
    p_recipe_key text,
    p_name text,
    p_description text,
    p_output_name text,
    p_output_quantity integer,
    p_required_level integer,
    p_duration_seconds integer,
    p_sort_order integer,
    p_ingredients jsonb
)
returns void
language plpgsql
set search_path = public
as $$
declare
    v_recipe_id bigint;
    v_output_item_id bigint;
    v_ingredient jsonb;
    v_ingredient_item_id bigint;
begin
    select item.id
    into v_output_item_id
    from public.items item
    where lower(item.name) = lower(p_output_name)
    limit 1;

    if v_output_item_id is null then
        return;
    end if;

    for v_ingredient in
        select value
        from jsonb_array_elements(p_ingredients)
    loop
        select item.id
        into v_ingredient_item_id
        from public.items item
        where lower(item.name) = lower(v_ingredient ->> 'name')
        limit 1;

        if v_ingredient_item_id is null then
            return;
        end if;
    end loop;

    insert into public.workstation_recipes (
        recipe_key,
        station_type,
        recipe_type,
        name,
        description,
        output_item_id,
        output_quantity,
        required_station_level,
        duration_seconds,
        fuel_seconds_required,
        sort_order,
        is_active
    )
    values (
        p_recipe_key,
        'workbench',
        'craft',
        p_name,
        p_description,
        v_output_item_id,
        p_output_quantity,
        p_required_level,
        p_duration_seconds,
        0,
        p_sort_order,
        true
    )
    on conflict (recipe_key)
    do update set
        station_type = 'workbench',
        recipe_type = 'craft',
        name = excluded.name,
        description = excluded.description,
        output_item_id = excluded.output_item_id,
        output_quantity = excluded.output_quantity,
        required_station_level = excluded.required_station_level,
        duration_seconds = excluded.duration_seconds,
        fuel_seconds_required = 0,
        sort_order = excluded.sort_order,
        is_active = true
    returning id into v_recipe_id;

    delete from public.workstation_recipe_ingredients
    where recipe_id = v_recipe_id;

    for v_ingredient in
        select value
        from jsonb_array_elements(p_ingredients)
    loop
        select item.id
        into v_ingredient_item_id
        from public.items item
        where lower(item.name) = lower(v_ingredient ->> 'name')
        limit 1;

        insert into public.workstation_recipe_ingredients (
            recipe_id,
            item_id,
            quantity
        )
        values (
            v_recipe_id,
            v_ingredient_item_id,
            greatest(1, (v_ingredient ->> 'quantity')::integer)
        );
    end loop;
end;
$$;

create or replace function public.seed_forge_recipe_017(
    p_recipe_key text,
    p_name text,
    p_description text,
    p_output_name text,
    p_output_quantity integer,
    p_required_level integer,
    p_duration_seconds integer,
    p_fuel_seconds integer,
    p_sort_order integer,
    p_ingredients jsonb
)
returns void
language plpgsql
set search_path = public
as $$
declare
    v_recipe_id bigint;
    v_output_item_id bigint;
    v_ingredient jsonb;
    v_ingredient_item_id bigint;
begin
    select id into v_output_item_id
    from public.items
    where lower(name) = lower(p_output_name)
    limit 1;

    if v_output_item_id is null then
        return;
    end if;

    for v_ingredient in select value from jsonb_array_elements(p_ingredients)
    loop
        select id into v_ingredient_item_id
        from public.items
        where lower(name) = lower(v_ingredient ->> 'name')
        limit 1;

        if v_ingredient_item_id is null then
            return;
        end if;
    end loop;

    insert into public.workstation_recipes (
        recipe_key,
        station_type,
        recipe_type,
        name,
        description,
        output_item_id,
        output_quantity,
        required_station_level,
        duration_seconds,
        fuel_seconds_required,
        sort_order,
        is_active
    )
    values (
        p_recipe_key,
        'forge',
        'craft',
        p_name,
        p_description,
        v_output_item_id,
        p_output_quantity,
        p_required_level,
        p_duration_seconds,
        p_fuel_seconds,
        p_sort_order,
        true
    )
    on conflict (recipe_key)
    do update set
        station_type = 'forge',
        recipe_type = 'craft',
        name = excluded.name,
        description = excluded.description,
        output_item_id = excluded.output_item_id,
        output_quantity = excluded.output_quantity,
        required_station_level = excluded.required_station_level,
        duration_seconds = excluded.duration_seconds,
        fuel_seconds_required = excluded.fuel_seconds_required,
        sort_order = excluded.sort_order,
        is_active = true
    returning id into v_recipe_id;

    delete from public.workstation_recipe_ingredients
    where recipe_id = v_recipe_id;

    for v_ingredient in select value from jsonb_array_elements(p_ingredients)
    loop
        select id into v_ingredient_item_id
        from public.items
        where lower(name) = lower(v_ingredient ->> 'name')
        limit 1;

        insert into public.workstation_recipe_ingredients (
            recipe_id,
            item_id,
            quantity
        )
        values (
            v_recipe_id,
            v_ingredient_item_id,
            greatest(1, (v_ingredient ->> 'quantity')::integer)
        );
    end loop;
end;
$$;

-- ============================================================
-- 3. REMOVE RECIPES THAT BELONG TO OTHER SYSTEMS
-- ============================================================

delete from public.workstation_recipe_ingredients
where recipe_id in (
    select id
    from public.workstation_recipes
    where recipe_key in (
        'workbench_fishing_rod',
        'workbench_hunting_trap',
        'workbench_beehive',
        'workbench_bee_suit',
        'workbench_bee_smoker',
        'workbench_cart_wheel'
    )
);

delete from public.workstation_recipes
where recipe_key in (
    'workbench_fishing_rod',
    'workbench_hunting_trap',
    'workbench_beehive',
    'workbench_bee_suit',
    'workbench_bee_smoker',
    'workbench_cart_wheel'
);

-- ============================================================
-- 4. FORGE COMPONENT FOR PICKAXES
-- ============================================================

select public.seed_forge_recipe_017(
    'forge_iron_pickaxe_head',
    'Iron Pickaxe Head',
    'Forge iron bars into a strong pickaxe head.',
    'Iron Pickaxe Head',
    1,
    2,
    50,
    50,
    45,
    '[{"name":"Iron Bar","quantity":2}]'::jsonb
);

-- ============================================================
-- 5. WORKBENCH LEVEL 1
-- ============================================================

select public.seed_workbench_recipe_017(
    'workbench_birch_plank',
    'Birch Plank',
    'Saw a Birch Log into useful building planks.',
    'Birch Plank',
    4,
    1,
    15,
    10,
    '[{"name":"Birch Log","quantity":1}]'::jsonb
);

select public.seed_workbench_recipe_017(
    'workbench_wooden_shaft',
    'Wooden Shaft',
    'Shape a plank into a strong shaft for tools and weapons.',
    'Wooden Shaft',
    1,
    1,
    8,
    20,
    '[{"name":"Birch Plank","quantity":1}]'::jsonb
);

select public.seed_workbench_recipe_017(
    'workbench_wooden_beam',
    'Wooden Beam',
    'Join and shape planks into a structural building beam.',
    'Wooden Beam',
    1,
    1,
    25,
    30,
    '[{"name":"Birch Plank","quantity":4}]'::jsonb
);

select public.seed_workbench_recipe_017(
    'workbench_herbal_bandage',
    'Herbal Bandage',
    'Craft a field dressing that can release you from the Healer Hut.',
    'Herbal Bandage',
    1,
    1,
    20,
    40,
    '[{"name":"Wild Herbs","quantity":5},{"name":"Stick","quantity":2}]'::jsonb
);

select public.seed_workbench_recipe_017(
    'workbench_wooden_bowl',
    'Wooden Bowl',
    'Carve a simple bowl for food, remedies and sacrifices.',
    'Wooden Bowl',
    1,
    1,
    12,
    50,
    '[{"name":"Birch Plank","quantity":1}]'::jsonb
);

-- ============================================================
-- 6. WORKBENCH LEVEL 2
-- ============================================================

select public.seed_workbench_recipe_017(
    'workbench_bucket',
    'Empty Bucket',
    'Build an empty wooden bucket. The Fishing page can later fill it with bait.',
    'Empty Bucket',
    1,
    2,
    30,
    100,
    '[{"name":"Birch Plank","quantity":5},{"name":"Iron Hoop","quantity":3}]'::jsonb
);

select public.seed_workbench_recipe_017(
    'workbench_iron_axe',
    'Iron Axe',
    'Fit a forged Iron Axe Head onto a Wooden Shaft.',
    'Iron Axe',
    1,
    2,
    35,
    110,
    '[{"name":"Iron Axe Head","quantity":1},{"name":"Wooden Shaft","quantity":1}]'::jsonb
);

select public.seed_workbench_recipe_017(
    'workbench_iron_pickaxe',
    'Iron Pickaxe',
    'Fit a forged Iron Pickaxe Head onto a Wooden Shaft.',
    'Iron Pickaxe',
    1,
    2,
    40,
    120,
    '[{"name":"Iron Pickaxe Head","quantity":1},{"name":"Wooden Shaft","quantity":1}]'::jsonb
);

select public.seed_workbench_recipe_017(
    'workbench_barrel_staves',
    'Barrel Staves',
    'Shape planks into a complete set of barrel staves.',
    'Barrel Staves',
    30,
    2,
    40,
    130,
    '[{"name":"Birch Plank","quantity":30}]'::jsonb
);

select public.seed_workbench_recipe_017(
    'workbench_barrel_lid',
    'Barrel Lid',
    'Build a fitted wooden lid for a barrel.',
    'Barrel Lid',
    1,
    2,
    20,
    140,
    '[{"name":"Birch Plank","quantity":5}]'::jsonb
);

select public.seed_workbench_recipe_017(
    'workbench_empty_barrel',
    'Empty Barrel',
    'Assemble staves, a lid and forged hoops into a barrel.',
    'Empty Barrel',
    1,
    2,
    90,
    150,
    '[{"name":"Barrel Staves","quantity":30},{"name":"Barrel Lid","quantity":1},{"name":"Iron Hoop","quantity":6}]'::jsonb
);

select public.seed_workbench_recipe_017(
    'workbench_bow',
    'Bow',
    'Build an ordinary bow. Specialist upgrades still come from Job Points.',
    'Bow',
    1,
    2,
    45,
    160,
    '[{"name":"Wooden Shaft","quantity":2},{"name":"Rope","quantity":1}]'::jsonb
);

select public.seed_workbench_recipe_017(
    'workbench_arrows',
    'Arrows',
    'Assemble a bundle of arrows for hunting and combat.',
    'Arrow',
    10,
    2,
    35,
    170,
    '[{"name":"Wooden Shaft","quantity":10},{"name":"Feather","quantity":10},{"name":"Iron Arrowhead","quantity":10}]'::jsonb
);

-- ============================================================
-- 7. WORKBENCH LEVEL 3
-- ============================================================

select public.seed_workbench_recipe_017(
    'workbench_wooden_shield',
    'Wooden Shield',
    'Assemble planks with a forged boss and iron fittings.',
    'Wooden Shield',
    1,
    3,
    90,
    200,
    '[{"name":"Birch Plank","quantity":12},{"name":"Shield Boss","quantity":1},{"name":"Iron Nails","quantity":8}]'::jsonb
);

-- ============================================================
-- 8. CLEAN UP HELPERS
-- ============================================================

drop function if exists public.seed_workbench_recipe_017(
    text,
    text,
    text,
    text,
    integer,
    integer,
    integer,
    integer,
    jsonb
);

drop function if exists public.seed_forge_recipe_017(
    text,
    text,
    text,
    text,
    integer,
    integer,
    integer,
    integer,
    integer,
    jsonb
);

commit;
