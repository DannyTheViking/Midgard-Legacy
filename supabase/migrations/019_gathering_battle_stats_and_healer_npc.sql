-- ============================================================
-- MIDGARD LEGACY
-- Migration 019: Training layout, gathering battle stats and Yrsa fix
-- ============================================================

begin;

-- Find Bait is the only gathering action that costs no energy.
alter table public.gathering_resource_nodes
    drop constraint if exists gathering_resource_nodes_energy_cost_check;

alter table public.gathering_resource_nodes
    add constraint gathering_resource_nodes_energy_cost_check
    check (energy_cost >= 0);

update public.gathering_resource_nodes
set energy_cost = 0
where node_key = 'find_bait';

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
        'skill_level', v_new_level,
        'primary_battle_stat', v_primary_battle_stat,
        'primary_battle_gain', v_primary_battle_gain,
        'secondary_battle_stat', v_secondary_battle_stat,
        'secondary_battle_gain', v_secondary_battle_gain
    );
end;
$$;

grant execute on function public.gather_resource(text, integer) to authenticated;

commit;
