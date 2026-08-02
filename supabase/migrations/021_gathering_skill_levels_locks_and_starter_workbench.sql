-- ============================================================
-- MIDGARD LEGACY
-- Migration 021: Gathering skill display, activity locks and starter Workbench
-- ============================================================
begin;

alter table public.skills
    add column if not exists foraging_xp bigint not null default 0,
    add column if not exists foraging_level integer not null default 1;

alter table public.skills
    drop constraint if exists skills_foraging_level_check;
alter table public.skills
    add constraint skills_foraging_level_check check (foraging_level between 1 and 100);

-- The starter property now includes a basic Level 1 Workbench so players
-- can craft Herbal Bandages before completing the first property upgrade.
alter table public.players alter column workbench_level set default 1;
update public.players set workbench_level = greatest(coalesce(workbench_level, 0), 1);

create or replace function public.sync_property_station_levels()
returns trigger
language plpgsql
set search_path = public
as $$
begin
    new.workbench_level := greatest(coalesce(new.workbench_level, 1), 1, coalesce(new.property_level, 0));
    new.forge_level := greatest(coalesce(new.forge_level, 0), greatest(coalesce(new.property_level, 0) - 1, 0));
    return new;
end;
$$;

-- Apply the planned tool requirements. The item lookup uses names so the
-- migration never hardcodes generated item IDs.
update public.gathering_resource_nodes n
set required_item_id = (
    select min(i.id) from public.items i where lower(i.name) = 'iron axe'
)
where n.profession = 'woodcutting';

update public.gathering_resource_nodes n
set required_item_id = (
    select min(i.id) from public.items i where lower(i.name) = 'iron pickaxe'
)
where n.profession = 'mining';

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
    v_strength bigint := 100;
    v_defence bigint := 100;
    v_agility bigint := 100;
    v_accuracy bigint := 100;
    v_primary_battle_stat text;
    v_secondary_battle_stat text;
    v_primary_battle_gain bigint := 0;
    v_secondary_battle_gain bigint := 0;
    v_primary_current bigint := 100;
    v_secondary_current bigint := 100;
    v_current_skill_level integer := 1;
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

    insert into public.skills (player_id)
    values (v_player)
    on conflict (player_id) do nothing;

    select case v_node.profession
        when 'woodcutting' then coalesce(woodcutting_level, public.midgard_skill_level(woodcutting_xp))
        when 'mining' then coalesce(mining_level, public.midgard_skill_level(mining_xp))
        when 'foraging' then coalesce(foraging_level, public.midgard_skill_level(foraging_xp))
        when 'fishing' then coalesce(fishing_level, public.midgard_skill_level(fishing_xp))
        when 'hunting' then coalesce(hunting_level, public.midgard_skill_level(hunting_xp))
        else 1
    end
    into v_current_skill_level
    from public.skills
    where player_id = v_player;

    if v_current_skill_level < v_node.required_skill_level then
        raise exception 'Requires % Level %. Your current level is %.',
            initcap(v_node.profession),
            v_node.required_skill_level,
            v_current_skill_level;
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

    v_total_energy := v_node.energy_cost * p_actions;

    select
        energy,
        coalesce(strength, 100),
        coalesce(defence, 100),
        coalesce(agility, 100),
        coalesce(accuracy, 100)
    into
        v_energy,
        v_strength,
        v_defence,
        v_agility,
        v_accuracy
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

    -- Every gathering profession improves two related battle stats.
    -- The gain scales with the current stat but remains much smaller than
    -- a paid Training Grounds session. A successful batch always gives
    -- at least one point in each related stat.
    case v_node.profession
        when 'woodcutting' then
            v_primary_battle_stat := 'Strength';
            v_secondary_battle_stat := 'Defence';
            v_primary_current := v_strength;
            v_secondary_current := v_defence;
        when 'mining' then
            v_primary_battle_stat := 'Defence';
            v_secondary_battle_stat := 'Strength';
            v_primary_current := v_defence;
            v_secondary_current := v_strength;
        when 'foraging' then
            v_primary_battle_stat := 'Agility';
            v_secondary_battle_stat := 'Accuracy';
            v_primary_current := v_agility;
            v_secondary_current := v_accuracy;
        when 'fishing' then
            v_primary_battle_stat := 'Accuracy';
            v_secondary_battle_stat := 'Agility';
            v_primary_current := v_accuracy;
            v_secondary_current := v_agility;
        when 'hunting' then
            v_primary_battle_stat := 'Accuracy';
            v_secondary_battle_stat := 'Agility';
            v_primary_current := v_accuracy;
            v_secondary_current := v_agility;
    end case;

    v_primary_battle_gain := greatest(
        1,
        floor(
            v_primary_current::numeric
            * (0.00005 + random() * 0.00005)
            * sqrt(p_actions::numeric)
        )::bigint
    );

    v_secondary_battle_gain := greatest(
        1,
        floor(
            v_secondary_current::numeric
            * (0.000025 + random() * 0.000025)
            * sqrt(p_actions::numeric)
        )::bigint
    );

    update public.players
    set
        energy = energy - v_total_energy,
        strength = strength + case
            when v_node.profession = 'woodcutting' then v_primary_battle_gain
            when v_node.profession = 'mining' then v_secondary_battle_gain
            else 0
        end,
        defence = defence + case
            when v_node.profession = 'woodcutting' then v_secondary_battle_gain
            when v_node.profession = 'mining' then v_primary_battle_gain
            else 0
        end,
        agility = agility + case
            when v_node.profession = 'foraging' then v_primary_battle_gain
            when v_node.profession in ('fishing', 'hunting') then v_secondary_battle_gain
            else 0
        end,
        accuracy = accuracy + case
            when v_node.profession = 'foraging' then v_secondary_battle_gain
            when v_node.profession in ('fishing', 'hunting') then v_primary_battle_gain
            else 0
        end,
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

    -- Every gathering profession has Level 1-100 progression.
    if v_node.profession in ('woodcutting', 'mining', 'foraging', 'fishing', 'hunting') then
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
        'skill_level', v_new_level,
        'primary_battle_stat', v_primary_battle_stat,
        'primary_battle_gain', v_primary_battle_gain,
        'secondary_battle_stat', v_secondary_battle_stat,
        'secondary_battle_gain', v_secondary_battle_gain
    );
end;
$$;


revoke all on function public.gather_resource(text, integer) from public, anon;
grant execute on function public.gather_resource(text, integer) to authenticated;

create or replace function public.get_my_gathering_screen()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_player uuid := auth.uid();
    v_skills public.skills%rowtype;
    v_nodes jsonb;
begin
    if v_player is null then
        raise exception 'Sign in required.';
    end if;

    insert into public.skills (player_id)
    values (v_player)
    on conflict (player_id) do nothing;

    select * into v_skills from public.skills where player_id = v_player;

    select coalesce(jsonb_agg(node_row order by node_row->>'profession', (node_row->>'required_skill_level')::integer, (node_row->>'sort_order')::integer), '[]'::jsonb)
    into v_nodes
    from (
        select jsonb_build_object(
            'node_key', n.node_key,
            'profession', n.profession,
            'display_name', n.display_name,
            'description', n.description,
            'icon', n.icon,
            'minimum_reward', n.minimum_reward,
            'maximum_reward', n.maximum_reward,
            'energy_cost', n.energy_cost,
            'required_skill_level', n.required_skill_level,
            'sort_order', n.sort_order,
            'primary_item_name', primary_item.name,
            'bonus_item_name', bonus_item.name,
            'required_item_name', required_item.name,
            'has_required_item', case when n.required_item_id is null then true else public.shared_item_quantity(v_player, n.required_item_id) >= 1 end,
            'current_skill_level', case n.profession
                when 'woodcutting' then coalesce(v_skills.woodcutting_level, public.midgard_skill_level(v_skills.woodcutting_xp))
                when 'mining' then coalesce(v_skills.mining_level, public.midgard_skill_level(v_skills.mining_xp))
                when 'foraging' then coalesce(v_skills.foraging_level, public.midgard_skill_level(v_skills.foraging_xp))
                when 'fishing' then coalesce(v_skills.fishing_level, public.midgard_skill_level(v_skills.fishing_xp))
                when 'hunting' then coalesce(v_skills.hunting_level, public.midgard_skill_level(v_skills.hunting_xp))
                else 1 end
        ) as node_row
        from public.gathering_resource_nodes n
        join public.items primary_item on primary_item.id = n.primary_item_id
        left join public.items bonus_item on bonus_item.id = n.bonus_item_id
        left join public.items required_item on required_item.id = n.required_item_id
        where n.is_active = true
    ) rows_for_json;

    return jsonb_build_object(
        'skill_levels', jsonb_build_object(
            'woodcutting', coalesce(v_skills.woodcutting_level, public.midgard_skill_level(v_skills.woodcutting_xp)),
            'mining', coalesce(v_skills.mining_level, public.midgard_skill_level(v_skills.mining_xp)),
            'foraging', coalesce(v_skills.foraging_level, public.midgard_skill_level(v_skills.foraging_xp)),
            'fishing', coalesce(v_skills.fishing_level, public.midgard_skill_level(v_skills.fishing_xp)),
            'hunting', coalesce(v_skills.hunting_level, public.midgard_skill_level(v_skills.hunting_xp))
        ),
        'skill_xp', jsonb_build_object(
            'woodcutting', coalesce(v_skills.woodcutting_xp, 0),
            'mining', coalesce(v_skills.mining_xp, 0),
            'foraging', coalesce(v_skills.foraging_xp, 0),
            'fishing', coalesce(v_skills.fishing_xp, 0),
            'hunting', coalesce(v_skills.hunting_xp, 0)
        ),
        'nodes', v_nodes
    );
end;
$$;

revoke all on function public.get_my_gathering_screen() from public, anon;
grant execute on function public.get_my_gathering_screen() to authenticated;

commit;
