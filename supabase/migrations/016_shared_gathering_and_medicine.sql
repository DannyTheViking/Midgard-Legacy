-- ============================================================
-- MIDGARD LEGACY
-- Migration 016: Complete Gathering Grounds
-- ============================================================
--
-- This is a complete replacement for every earlier version of 016.
-- It DOES NOT use or alter the old public.gathering_nodes table.
-- The shared engine uses public.gathering_resource_nodes instead.
-- Every action costs exactly 5 energy.
-- ============================================================

begin;

insert into public.items (name, description, type, weight_kg)
select seed.name, seed.description, seed.type, seed.weight_kg
from (
    values
        ('Wild Herbs', 'Healing plants used for medicine.', 'resource', 0.100::numeric),
        ('Herbal Bandage', 'A field dressing packed with herbs.', 'resource', 0.100::numeric),
        ('Birch Log', 'A light birch log.', 'resource', 0.100::numeric),
        ('Oak Log', 'A strong oak log.', 'resource', 0.100::numeric),
        ('Pine Log', 'A straight pine log.', 'resource', 0.100::numeric),
        ('Ash Log', 'A flexible ash log.', 'resource', 0.100::numeric),
        ('Yew Log', 'Dense yew wood prized by bowyers.', 'resource', 0.100::numeric),
        ('Maple Log', 'A smooth maple log.', 'resource', 0.100::numeric),
        ('Willow Log', 'A light flexible willow log.', 'resource', 0.100::numeric),
        ('Ancient Log', 'Rare timber from an ancient tree.', 'resource', 0.100::numeric),
        ('Stick', 'A useful wooden stick.', 'resource', 0.100::numeric),
        ('Rock', 'A common rock.', 'resource', 0.100::numeric),
        ('Bog Iron', 'Iron-rich material from marsh ground.', 'resource', 0.100::numeric),
        ('Limestone', 'A pale stone used for building.', 'resource', 0.100::numeric),
        ('Clay', 'Soft earth used for pottery.', 'resource', 0.100::numeric),
        ('Copper Ore', 'Copper-bearing ore.', 'resource', 0.100::numeric),
        ('Tin Ore', 'Tin-bearing ore.', 'resource', 0.100::numeric),
        ('Coal', 'Fuel for the forge.', 'resource', 0.100::numeric),
        ('Iron Ore', 'Iron-bearing stone.', 'resource', 0.100::numeric),
        ('Silver Ore', 'Rare silver-bearing ore.', 'resource', 0.100::numeric),
        ('Gold Ore', 'Very rare gold-bearing ore.', 'resource', 0.100::numeric),
        ('Salt', 'Mineral salt from a deposit.', 'resource', 0.100::numeric),
        ('Mushroom', 'An edible wild mushroom.', 'resource', 0.100::numeric),
        ('Red Berries', 'Wild red berries.', 'resource', 0.100::numeric),
        ('Blackberries', 'Wild blackberries.', 'resource', 0.100::numeric),
        ('Nettle', 'Fibrous and medicinal nettles.', 'resource', 0.100::numeric),
        ('Flax', 'Wild flax fibres.', 'resource', 0.100::numeric),
        ('Wild Garlic', 'Strong-smelling wild garlic.', 'resource', 0.100::numeric),
        ('Honeycomb', 'A piece of abandoned wild honeycomb.', 'resource', 0.100::numeric),
        ('Wax', 'Natural beeswax.', 'resource', 0.100::numeric),
        ('Empty Bucket', 'An empty wooden bucket.', 'resource', 0.100::numeric),
        ('Bait Bucket', 'A bucket filled with worms and bait.', 'resource', 0.100::numeric),
        ('Minnow', 'A small freshwater fish.', 'resource', 0.100::numeric),
        ('Trout', 'A river trout.', 'resource', 0.100::numeric),
        ('Salmon', 'A strong river salmon.', 'resource', 0.100::numeric),
        ('Pike', 'A predatory freshwater fish.', 'resource', 0.100::numeric),
        ('Eel', 'A slippery eel.', 'resource', 0.100::numeric),
        ('Herring', 'A common coastal fish.', 'resource', 0.100::numeric),
        ('Cod', 'A large sea fish.', 'resource', 0.100::numeric),
        ('Mackerel', 'A fast coastal fish.', 'resource', 0.100::numeric),
        ('Rabbit Meat', 'Meat from a rabbit.', 'resource', 0.100::numeric),
        ('Rabbit Hide', 'A small soft hide.', 'resource', 0.100::numeric),
        ('Deer Meat', 'Venison from a deer.', 'resource', 0.100::numeric),
        ('Deer Hide', 'A large deer hide.', 'resource', 0.100::numeric),
        ('Boar Meat', 'Rich meat from a wild boar.', 'resource', 0.100::numeric),
        ('Boar Hide', 'A thick boar hide.', 'resource', 0.100::numeric),
        ('Wolf Pelt', 'A warm wolf pelt.', 'resource', 0.100::numeric),
        ('Bear Meat', 'Heavy cuts of bear meat.', 'resource', 0.100::numeric),
        ('Bear Hide', 'A massive bear hide.', 'resource', 0.100::numeric),
        ('Feathers', 'Useful bird feathers.', 'resource', 0.100::numeric),
        ('Game Bird Meat', 'Meat from a hunted bird.', 'resource', 0.100::numeric)
) as seed(name, description, type, weight_kg)
where not exists (
    select 1
    from public.items existing
    where lower(existing.name) = lower(seed.name)
);

-- The replacement table contains only catalogue data, so rebuilding it is safe.
drop table if exists public.gathering_resource_nodes cascade;

create table public.gathering_resource_nodes (
    node_key text primary key,
    profession text not null check (
        profession in ('woodcutting', 'mining', 'foraging', 'fishing', 'hunting')
    ),
    display_name text not null,
    description text not null,
    icon text not null default '🧺',
    primary_item_id bigint not null references public.items(id),
    minimum_reward integer not null check (minimum_reward > 0),
    maximum_reward integer not null check (maximum_reward >= minimum_reward),
    energy_cost integer not null default 5 check (energy_cost = 5),
    xp_reward integer not null default 1 check (xp_reward >= 0),
    required_skill_level integer not null default 1 check (required_skill_level >= 1),
    bonus_item_id bigint references public.items(id),
    bonus_minimum integer,
    bonus_maximum integer,
    required_item_id bigint references public.items(id),
    consume_required_item boolean not null default false,
    sort_order integer not null default 0,
    is_active boolean not null default true
);

alter table public.gathering_resource_nodes enable row level security;

create policy gathering_resource_nodes_read
on public.gathering_resource_nodes
for select
to authenticated
using (is_active = true);

grant select on public.gathering_resource_nodes to authenticated;

with node_seed (
    node_key, profession, display_name, description, icon,
    primary_item_name, minimum_reward, maximum_reward,
    xp_reward, required_skill_level,
    bonus_item_name, bonus_minimum, bonus_maximum,
    required_item_name, consume_required_item, sort_order
) as (
    values
        ('birch_tree', 'woodcutting', 'Birch Tree', 'Chop a young birch for light timber and sticks.', '🌳', 'Birch Log', 1, 5, 5, 1, 'Stick', 2, 8, null, false, 10),
        ('pine_tree', 'woodcutting', 'Pine Tree', 'Cut straight pine timber for shafts and construction.', '🌲', 'Pine Log', 1, 5, 5, 5, 'Stick', 1, 5, null, false, 20),
        ('willow_tree', 'woodcutting', 'Willow Tree', 'Harvest light and flexible willow timber.', '🌿', 'Willow Log', 1, 4, 6, 10, 'Stick', 2, 6, null, false, 30),
        ('oak_tree', 'woodcutting', 'Oak Tree', 'Fell a strong oak for heavy building timber.', '🌳', 'Oak Log', 1, 4, 7, 15, 'Stick', 1, 4, null, false, 40),
        ('ash_tree', 'woodcutting', 'Ash Tree', 'Gather flexible ash wood for handles and bows.', '🌳', 'Ash Log', 1, 4, 8, 25, 'Stick', 1, 4, null, false, 50),
        ('maple_tree', 'woodcutting', 'Maple Tree', 'Cut smooth maple timber.', '🍁', 'Maple Log', 1, 4, 9, 35, 'Stick', 1, 3, null, false, 60),
        ('yew_tree', 'woodcutting', 'Yew Tree', 'Harvest rare yew wood used by master bowyers.', '🌲', 'Yew Log', 1, 3, 11, 50, 'Stick', 1, 3, null, false, 70),
        ('ancient_tree', 'woodcutting', 'Ancient Tree', 'Attempt to cut exceptionally rare ancient timber.', '🌳', 'Ancient Log', 1, 2, 15, 75, null, null, null, null, false, 80),
        ('loose_stone', 'mining', 'Loose Stone', 'Collect useful rocks from exposed ground.', '🪨', 'Rock', 2, 8, 3, 1, null, null, null, null, false, 110),
        ('bog_iron', 'mining', 'Bog Iron Deposit', 'Dig iron-rich material from wet ground.', '⛏️', 'Bog Iron', 1, 5, 4, 1, 'Rock', 1, 4, null, false, 120),
        ('clay_bank', 'mining', 'Clay Bank', 'Dig workable clay from a river bank.', '🟫', 'Clay', 2, 6, 4, 3, 'Rock', 1, 2, null, false, 130),
        ('limestone_outcrop', 'mining', 'Limestone Outcrop', 'Break pale stone for construction.', '🪨', 'Limestone', 1, 5, 5, 8, 'Rock', 1, 3, null, false, 140),
        ('copper_vein', 'mining', 'Copper Vein', 'Mine copper-bearing stone.', '🟠', 'Copper Ore', 1, 4, 6, 15, 'Rock', 1, 3, null, false, 150),
        ('tin_vein', 'mining', 'Tin Vein', 'Mine tin-bearing stone for bronze work.', '⚪', 'Tin Ore', 1, 4, 7, 20, 'Rock', 1, 3, null, false, 160),
        ('coal_seam', 'mining', 'Coal Seam', 'Extract fuel for your Forge.', '⚫', 'Coal', 1, 5, 8, 25, 'Rock', 1, 2, null, false, 170),
        ('iron_vein', 'mining', 'Iron Vein', 'Mine proper iron ore with a pickaxe.', '⛏️', 'Iron Ore', 1, 4, 10, 35, 'Rock', 1, 2, null, false, 180),
        ('silver_vein', 'mining', 'Silver Vein', 'Mine rare silver-bearing ore.', '🥈', 'Silver Ore', 1, 3, 13, 55, 'Rock', 1, 2, null, false, 190),
        ('gold_vein', 'mining', 'Gold Vein', 'Mine extremely rare gold-bearing ore.', '🥇', 'Gold Ore', 1, 2, 16, 75, 'Rock', 1, 2, null, false, 200),
        ('salt_deposit', 'mining', 'Salt Deposit', 'Break mineral salt from a dry deposit.', '🧂', 'Salt', 1, 4, 7, 18, 'Rock', 1, 2, null, false, 210),
        ('wild_herbs', 'foraging', 'Wild Herb Patch', 'Gather healing plants for medicine.', '🌿', 'Wild Herbs', 2, 6, 3, 1, null, null, null, null, false, 310),
        ('mushroom_patch', 'foraging', 'Mushroom Patch', 'Search shaded ground for mushrooms.', '🍄', 'Mushroom', 1, 5, 3, 1, null, null, null, null, false, 320),
        ('red_berry_bush', 'foraging', 'Red Berry Bush', 'Pick bright wild berries.', '🫐', 'Red Berries', 2, 7, 3, 3, null, null, null, null, false, 330),
        ('blackberry_bush', 'foraging', 'Blackberry Bush', 'Pick ripe blackberries from thorny bushes.', '🫐', 'Blackberries', 2, 7, 4, 5, null, null, null, null, false, 340),
        ('nettle_patch', 'foraging', 'Nettle Patch', 'Carefully gather nettles for fibre and remedies.', '🌱', 'Nettle', 2, 6, 4, 8, null, null, null, null, false, 350),
        ('wild_flax', 'foraging', 'Wild Flax', 'Gather flax fibres for future cloth making.', '🌾', 'Flax', 1, 5, 5, 12, null, null, null, null, false, 360),
        ('wild_garlic', 'foraging', 'Wild Garlic', 'Gather wild garlic for food and remedies.', '🧄', 'Wild Garlic', 1, 5, 5, 15, null, null, null, null, false, 370),
        ('abandoned_honeycomb', 'foraging', 'Abandoned Honeycomb', 'Search an abandoned nest for honeycomb and wax.', '🍯', 'Honeycomb', 1, 3, 8, 25, 'Wax', 1, 2, null, false, 380),
        ('find_bait', 'fishing', 'Find Bait', 'Fill an Empty Bucket with worms and fishing bait.', '🪱', 'Bait Bucket', 1, 1, 2, 1, null, null, null, 'Empty Bucket', true, 410),
        ('stream_minnows', 'fishing', 'Catch Minnows', 'Catch small fish in a shallow stream.', '🐟', 'Minnow', 1, 5, 3, 1, null, null, null, 'Bait Bucket', false, 420),
        ('river_trout', 'fishing', 'River Trout', 'Fish a cold river for trout.', '🎣', 'Trout', 1, 4, 5, 5, null, null, null, 'Bait Bucket', false, 430),
        ('river_salmon', 'fishing', 'River Salmon', 'Fish a fast river for salmon.', '🐟', 'Salmon', 1, 3, 7, 15, null, null, null, 'Bait Bucket', false, 440),
        ('lake_pike', 'fishing', 'Lake Pike', 'Fish deep lake water for pike.', '🐊', 'Pike', 1, 3, 8, 25, null, null, null, 'Bait Bucket', false, 450),
        ('marsh_eel', 'fishing', 'Marsh Eel', 'Catch slippery eels in marsh water.', '〰️', 'Eel', 1, 4, 7, 20, null, null, null, 'Bait Bucket', false, 460),
        ('coastal_herring', 'fishing', 'Coastal Herring', 'Fish coastal waters for herring.', '🐟', 'Herring', 1, 5, 9, 35, null, null, null, 'Bait Bucket', false, 470),
        ('deep_cod', 'fishing', 'Deep-Water Cod', 'Fish deeper water for valuable cod.', '🐟', 'Cod', 1, 3, 12, 55, null, null, null, 'Bait Bucket', false, 480),
        ('coastal_mackerel', 'fishing', 'Coastal Mackerel', 'Catch fast-moving mackerel near the coast.', '🐟', 'Mackerel', 1, 4, 10, 45, null, null, null, 'Bait Bucket', false, 490),
        ('hunt_rabbit', 'hunting', 'Hunt Rabbit', 'Track rabbits for meat and small hides.', '🐇', 'Rabbit Meat', 1, 4, 4, 1, 'Rabbit Hide', 1, 2, null, false, 510),
        ('hunt_game_bird', 'hunting', 'Hunt Game Birds', 'Hunt birds for meat and useful feathers.', '🪶', 'Game Bird Meat', 1, 4, 5, 5, 'Feathers', 2, 6, null, false, 520),
        ('hunt_deer', 'hunting', 'Hunt Deer', 'Track deer for venison and hides.', '🦌', 'Deer Meat', 1, 4, 7, 15, 'Deer Hide', 1, 2, null, false, 530),
        ('hunt_boar', 'hunting', 'Hunt Wild Boar', 'Track dangerous boar for meat and thick hide.', '🐗', 'Boar Meat', 1, 4, 9, 25, 'Boar Hide', 1, 2, null, false, 540),
        ('hunt_wolf', 'hunting', 'Hunt Wolf', 'Track a wolf for its valuable pelt.', '🐺', 'Wolf Pelt', 1, 2, 12, 45, null, null, null, null, false, 550),
        ('hunt_bear', 'hunting', 'Hunt Bear', 'Face a dangerous bear for meat and a massive hide.', '🐻', 'Bear Meat', 1, 3, 16, 70, 'Bear Hide', 1, 1, null, false, 560)
)
insert into public.gathering_resource_nodes (
    node_key, profession, display_name, description, icon,
    primary_item_id, minimum_reward, maximum_reward, energy_cost,
    xp_reward, required_skill_level,
    bonus_item_id, bonus_minimum, bonus_maximum,
    required_item_id, consume_required_item, sort_order
)
select
    seed.node_key,
    seed.profession,
    seed.display_name,
    seed.description,
    seed.icon,
    primary_item.id,
    seed.minimum_reward,
    seed.maximum_reward,
    5,
    seed.xp_reward,
    seed.required_skill_level,
    bonus_item.id,
    seed.bonus_minimum,
    seed.bonus_maximum,
    required_item.id,
    seed.consume_required_item,
    seed.sort_order
from node_seed seed
join public.items primary_item
    on lower(primary_item.name) = lower(seed.primary_item_name)
left join public.items bonus_item
    on lower(bonus_item.name) = lower(seed.bonus_item_name)
left join public.items required_item
    on lower(required_item.name) = lower(seed.required_item_name);

create or replace function public.grant_gathered_item (
    p_player uuid,
    p_item_id bigint,
    p_quantity bigint
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
    v_cart_id bigint;
begin
    if p_quantity is null or p_quantity <= 0 then
        return 'none';
    end if;

    select cart.id
    into v_cart_id
    from public.player_carts cart
    where cart.player_id = p_player
      and cart.is_active = true
    order by cart.id
    limit 1;

    if v_cart_id is not null then
        insert into public.cart_items (cart_id, item_id, quantity)
        values (v_cart_id, p_item_id, p_quantity)
        on conflict (cart_id, item_id) do update set
            quantity = public.cart_items.quantity + excluded.quantity;

        return 'cart';
    end if;

    insert into public.inventory (player_id, item_id, quantity)
    values (p_player, p_item_id, p_quantity)
    on conflict (player_id, item_id) do update set
        quantity = public.inventory.quantity + excluded.quantity;

    return 'backpack';
end;
$$;

create or replace function public.gather_resource (
    p_node_key text,
    p_actions integer default 1
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_player uuid := auth.uid();
    v_node public.gathering_resource_nodes%rowtype;
    v_energy integer;
    v_total_energy integer;
    v_primary_quantity bigint := 0;
    v_bonus_quantity bigint := 0;
    v_action integer;
    v_destination text;
    v_primary_name text;
    v_bonus_name text;
    v_required_name text;
    v_xp_column text;
    v_level_column text;
    v_old_xp bigint := 0;
    v_new_xp bigint := 0;
    v_new_level integer := 1;
begin
    if v_player is null then
        raise exception 'Sign in required.';
    end if;

    if p_actions is null or p_actions < 1 or p_actions > 25 then
        raise exception 'Choose between 1 and 25 actions.';
    end if;

    select *
    into v_node
    from public.gathering_resource_nodes
    where node_key = p_node_key
      and is_active = true;

    if v_node.node_key is null then
        raise exception 'Gathering activity not found.';
    end if;

    -- Container conversions, such as Empty Bucket -> Bait Bucket,
    -- deliberately run one at a time.
    if v_node.consume_required_item and p_actions <> 1 then
        raise exception 'This activity must be completed one action at a time.';
    end if;

    if v_node.required_item_id is not null then
        select name into v_required_name
        from public.items
        where id = v_node.required_item_id;

        if public.shared_item_quantity(v_player, v_node.required_item_id) < 1 then
            raise exception 'You need % before doing this activity.', v_required_name;
        end if;
    end if;

    v_total_energy := 5 * p_actions;

    select energy
    into v_energy
    from public.players
    where id = v_player
    for update;

    if coalesce(v_energy, 0) < v_total_energy then
        raise exception 'You need % energy but only have %.',
            v_total_energy,
            coalesce(v_energy, 0);
    end if;

    for v_action in 1..p_actions loop
        v_primary_quantity := v_primary_quantity
            + floor(random() * (v_node.maximum_reward - v_node.minimum_reward + 1))::integer
            + v_node.minimum_reward;

        if v_node.bonus_item_id is not null then
            v_bonus_quantity := v_bonus_quantity
                + floor(random() * (v_node.bonus_maximum - v_node.bonus_minimum + 1))::integer
                + v_node.bonus_minimum;
        end if;
    end loop;

    if v_node.consume_required_item then
        perform public.consume_shared_item(v_player, v_node.required_item_id, 1);
    end if;

    update public.players
    set energy = energy - v_total_energy,
        last_action = now()
    where id = v_player;

    v_destination := public.grant_gathered_item(
        v_player,
        v_node.primary_item_id,
        v_primary_quantity
    );

    if v_node.bonus_item_id is not null and v_bonus_quantity > 0 then
        perform public.grant_gathered_item(
            v_player,
            v_node.bonus_item_id,
            v_bonus_quantity
        );
    end if;

    -- Existing skill columns: woodcutting, mining, fishing and hunting.
    -- Foraging remains a resource activity without a separate skill column.
    if v_node.profession in ('woodcutting', 'mining', 'fishing', 'hunting') then
        v_xp_column := v_node.profession || '_xp';
        v_level_column := v_node.profession || '_level';

        insert into public.skills (player_id)
        values (v_player)
        on conflict (player_id) do nothing;

        execute format(
            'select coalesce(%I, 0) from public.skills where player_id = $1 for update',
            v_xp_column
        ) into v_old_xp using v_player;

        v_new_xp := v_old_xp + (v_node.xp_reward * p_actions);
        v_new_level := greatest(
            1,
            least(100, floor(power(v_new_xp::numeric / 100, 1.0 / 3.0))::integer + 1)
        );

        execute format(
            'update public.skills set %I = $1, %I = $2 where player_id = $3',
            v_xp_column,
            v_level_column
        ) using v_new_xp, v_new_level, v_player;
    end if;

    select name into v_primary_name
    from public.items
    where id = v_node.primary_item_id;

    if v_node.bonus_item_id is not null then
        select name into v_bonus_name
        from public.items
        where id = v_node.bonus_item_id;
    end if;

    return jsonb_build_object(
        'node_key', v_node.node_key,
        'profession', v_node.profession,
        'display_name', v_node.display_name,
        'actions', p_actions,
        'energy_spent', v_total_energy,
        'energy_remaining', v_energy - v_total_energy,
        'destination', v_destination,
        'primary_item', v_primary_name,
        'primary_quantity', v_primary_quantity,
        'bonus_item', v_bonus_name,
        'bonus_quantity', v_bonus_quantity,
        'xp_awarded', v_node.xp_reward * p_actions,
        'skill_level', v_new_level
    );
end;
$$;

grant execute on function public.gather_resource(text, integer) to authenticated;

-- Keep the Herbal Bandage recipe and healer release function from the
-- medicine update. The recipe is a normal Workbench craft.
do $$
declare
    v_recipe_id bigint;
    v_bandage bigint;
    v_herbs bigint;
    v_stick bigint;
begin
    select id into v_bandage from public.items where lower(name) = 'herbal bandage' limit 1;
    select id into v_herbs from public.items where lower(name) = 'wild herbs' limit 1;
    select id into v_stick from public.items where lower(name) = 'stick' limit 1;

    if v_bandage is not null and v_herbs is not null then
        insert into public.workstation_recipes (
            recipe_key, station_type, name, description, recipe_type,
            output_item_id, output_quantity, required_station_level,
            duration_seconds, fuel_seconds_required, sort_order, is_active
        )
        values (
            'workbench_herbal_bandage', 'workbench', 'Herbal Bandage',
            'Craft a field dressing that can release you from the Healer Hut.',
            'craft', v_bandage, 1, 1, 20, 0, 5, true
        )
        on conflict (recipe_key) do update set
            name = excluded.name,
            description = excluded.description,
            recipe_type = 'craft',
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

        insert into public.workstation_recipe_ingredients (recipe_id, item_id, quantity)
        values (v_recipe_id, v_herbs, 5);

        if v_stick is not null then
            insert into public.workstation_recipe_ingredients (recipe_id, item_id, quantity)
            values (v_recipe_id, v_stick, 2);
        end if;
    end if;
end
$$;

create or replace function public.use_hospital_medicine (
    p_item_name text default 'Herbal Bandage'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_player uuid := auth.uid();
    v_item_id bigint;
    v_max_health integer;
    v_new_health integer;
begin
    if v_player is null then
        raise exception 'Sign in required.';
    end if;

    select id into v_item_id
    from public.items
    where lower(name) = lower(p_item_name)
    limit 1;

    if v_item_id is null then
        raise exception 'Medicine item not found.';
    end if;

    if public.shared_item_quantity(v_player, v_item_id) < 1 then
        raise exception 'You do not have an Herbal Bandage.';
    end if;

    select max_health into v_max_health
    from public.players
    where id = v_player
    for update;

    perform public.consume_shared_item(v_player, v_item_id, 1);

    v_new_health := greatest(1, ceil(coalesce(v_max_health, 500) * 0.20)::integer);

    update public.players
    set health = greatest(coalesce(health, 1), v_new_health),
        hospital_started_at = null,
        hospital_until = null,
        hospital_reason = null,
        hospital_start_health = null,
        hospital_regen_per_minute = null
    where id = v_player;

    return jsonb_build_object(
        'released', true,
        'health', v_new_health,
        'medicine', p_item_name
    );
end;
$$;

grant execute on function public.use_hospital_medicine(text) to authenticated;

commit;
