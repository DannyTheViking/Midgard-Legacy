-- ============================================================
-- MIDGARD LEGACY
-- FORGE LIVE FUEL / PAUSABLE QUEUE FIX
-- ============================================================
-- Queueing a Forge recipe no longer removes fuel immediately.
-- Fuel is consumed only while the first Forge job is progressing.
-- When fuel reaches zero, the active job pauses and keeps its progress.
-- Adding more fuel allows the job to continue.
-- ============================================================

alter table public.workstation_queue
    add column if not exists remaining_seconds integer;

alter table public.workstation_queue
    add column if not exists finished_at timestamptz;

update public.workstation_queue q
set remaining_seconds = greatest(
    0,
    ceil(extract(epoch from (q.completes_at - now())))::integer
)
where q.remaining_seconds is null
  and q.status = 'queued';

update public.workstation_queue
set remaining_seconds = 0
where remaining_seconds is null;

alter table public.workstation_queue
    alter column remaining_seconds set default 0;

-- ------------------------------------------------------------
-- Progress the Forge using elapsed real time.
-- This function is called whenever the Forge screen is loaded.
-- ------------------------------------------------------------
create or replace function public.process_forge_queue(
    p_player uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
    v_station public.player_workstations%rowtype;
    v_job public.workstation_queue%rowtype;
    v_elapsed integer;
    v_work integer;
begin
    insert into public.player_workstations (
        player_id,
        station_type,
        fuel_seconds,
        is_running,
        updated_at
    )
    values (
        p_player,
        'forge',
        0,
        false,
        now()
    )
    on conflict (player_id, station_type)
    do nothing;

    select *
    into v_station
    from public.player_workstations
    where player_id = p_player
      and station_type = 'forge'
    for update;

    v_elapsed := greatest(
        0,
        floor(
            extract(epoch from (now() - v_station.updated_at))
        )::integer
    );

    while v_elapsed > 0
      and v_station.fuel_seconds > 0
    loop
        select *
        into v_job
        from public.workstation_queue
        where player_id = p_player
          and station_type = 'forge'
          and status = 'queued'
          and remaining_seconds > 0
        order by id
        limit 1
        for update;

        exit when v_job.id is null;

        v_work := least(
            v_elapsed,
            v_station.fuel_seconds,
            v_job.remaining_seconds
        );

        update public.workstation_queue
        set remaining_seconds = remaining_seconds - v_work,
            started_at = coalesce(started_at, now()),
            completes_at = now() + make_interval(
                secs => greatest(remaining_seconds - v_work, 0)
            )
        where id = v_job.id;

        v_elapsed := v_elapsed - v_work;
        v_station.fuel_seconds := v_station.fuel_seconds - v_work;

        if v_job.remaining_seconds - v_work <= 0 then
            update public.workstation_queue
            set finished_at = now(),
                completes_at = now()
            where id = v_job.id;
        end if;
    end loop;

    update public.player_workstations
    set fuel_seconds = v_station.fuel_seconds,
        is_running = exists (
            select 1
            from public.workstation_queue
            where player_id = p_player
              and station_type = 'forge'
              and status = 'queued'
              and remaining_seconds > 0
        ) and v_station.fuel_seconds > 0,
        updated_at = now()
    where player_id = p_player
      and station_type = 'forge';
end;
$$;

-- ------------------------------------------------------------
-- Queue recipe
-- Materials are consumed now, but fuel is NOT consumed now.
-- ------------------------------------------------------------
create or replace function public.queue_workstation_recipe(
    p_recipe_key text,
    p_batches integer default 1
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_player uuid := auth.uid();
    v_recipe public.workstation_recipes%rowtype;
    v_ingredient record;
    v_level integer;
    v_duration integer;
    v_material_quantity bigint;
    v_last_completion timestamptz;
begin
    if v_player is null then
        raise exception 'Sign in required.';
    end if;

    if p_batches < 1 or p_batches > 999 then
        raise exception 'Invalid batch amount.';
    end if;

    select *
    into v_recipe
    from public.workstation_recipes
    where recipe_key = p_recipe_key
      and is_active = true;

    if v_recipe.id is null then
        raise exception 'Recipe not found.';
    end if;

    v_level := public.station_level_for(
        v_player,
        v_recipe.station_type
    );

    if v_level < v_recipe.required_station_level then
        raise exception 'Station level % required.',
            v_recipe.required_station_level;
    end if;

    for v_ingredient in
        select *
        from public.workstation_recipe_ingredients
        where recipe_id = v_recipe.id
    loop
        if v_ingredient.item_id is not null then
            if public.shared_item_quantity(
                v_player,
                v_ingredient.item_id
            ) < v_ingredient.quantity * p_batches then
                raise exception 'Not enough %.',
                    (
                        select name
                        from public.items
                        where id = v_ingredient.item_id
                    );
            end if;
        else
            select coalesce(quantity, 0)
            into v_material_quantity
            from public.player_forge_materials
            where player_id = v_player
              and material_key = v_ingredient.forge_material_key;

            if v_material_quantity < v_ingredient.quantity * p_batches then
                raise exception 'Not enough smelted %.',
                    v_ingredient.forge_material_key;
            end if;
        end if;
    end loop;

    for v_ingredient in
        select *
        from public.workstation_recipe_ingredients
        where recipe_id = v_recipe.id
    loop
        if v_ingredient.item_id is not null then
            perform public.consume_shared_item(
                v_player,
                v_ingredient.item_id,
                v_ingredient.quantity * p_batches
            );
        else
            update public.player_forge_materials
            set quantity = quantity - (
                v_ingredient.quantity * p_batches
            )
            where player_id = v_player
              and material_key = v_ingredient.forge_material_key;
        end if;
    end loop;

    v_duration := v_recipe.duration_seconds * p_batches;

    if v_recipe.station_type = 'forge' then
        insert into public.player_workstations (
            player_id,
            station_type
        )
        values (
            v_player,
            'forge'
        )
        on conflict do nothing;

        select max(completes_at)
        into v_last_completion
        from public.workstation_queue
        where player_id = v_player
          and station_type = 'forge'
          and status = 'queued';

        insert into public.workstation_queue (
            player_id,
            station_type,
            recipe_id,
            batches,
            completes_at,
            remaining_seconds
        )
        values (
            v_player,
            'forge',
            v_recipe.id,
            p_batches,
            coalesce(v_last_completion, now())
                + make_interval(secs => v_duration),
            v_duration
        );
    else
        select max(completes_at)
        into v_last_completion
        from public.workstation_queue
        where player_id = v_player
          and station_type = v_recipe.station_type
          and status = 'queued';

        insert into public.workstation_queue (
            player_id,
            station_type,
            recipe_id,
            batches,
            completes_at,
            remaining_seconds
        )
        values (
            v_player,
            v_recipe.station_type,
            v_recipe.id,
            p_batches,
            greatest(coalesce(v_last_completion, now()), now())
                + make_interval(secs => v_duration),
            v_duration
        );
    end if;

    return jsonb_build_object(
        'queued', true,
        'seconds', v_duration,
        'recipe', v_recipe.name
    );
end;
$$;

-- ------------------------------------------------------------
-- Claim only jobs that have actually reached zero remaining time.
-- ------------------------------------------------------------
create or replace function public.claim_workstation_job(
    p_job_id bigint
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_player uuid := auth.uid();
    v_job public.workstation_queue%rowtype;
    v_recipe public.workstation_recipes%rowtype;
    v_total bigint;
begin
    perform public.process_forge_queue(v_player);

    select *
    into v_job
    from public.workstation_queue
    where id = p_job_id
      and player_id = v_player
    for update;

    if v_job.id is null then
        raise exception 'Job not found.';
    end if;

    if v_job.status <> 'queued' then
        raise exception 'Job already collected.';
    end if;

    if v_job.station_type = 'forge'
       and v_job.remaining_seconds > 0 then
        raise exception 'This job is not finished yet.';
    end if;

    if v_job.station_type <> 'forge'
       and now() < v_job.completes_at then
        raise exception 'This job is not finished yet.';
    end if;

    select *
    into v_recipe
    from public.workstation_recipes
    where id = v_job.recipe_id;

    v_total := v_recipe.output_quantity * v_job.batches;

    if v_recipe.output_item_id is not null then
        insert into public.player_storage (
            player_id,
            item_id,
            quantity
        )
        values (
            v_player,
            v_recipe.output_item_id,
            v_total
        )
        on conflict (player_id, item_id)
        do update
        set quantity = public.player_storage.quantity
            + excluded.quantity;
    else
        insert into public.player_forge_materials (
            player_id,
            material_key,
            quantity
        )
        values (
            v_player,
            v_recipe.output_material_key,
            v_total
        )
        on conflict (player_id, material_key)
        do update
        set quantity = public.player_forge_materials.quantity
            + excluded.quantity;
    end if;

    update public.workstation_queue
    set status = 'claimed',
        claimed_at = now()
    where id = v_job.id;

    return jsonb_build_object(
        'claimed', true,
        'name', v_recipe.name,
        'quantity', v_total
    );
end;
$$;

-- ------------------------------------------------------------
-- Forge screen now processes elapsed work before returning data.
-- ------------------------------------------------------------
create or replace function public.get_workstation_screen(
    p_station text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_player uuid := auth.uid();
    v_level integer;
begin
    if v_player is null then
        raise exception 'Sign in required.';
    end if;

    if p_station = 'forge' then
        perform public.process_forge_queue(v_player);
    end if;

    v_level := public.station_level_for(
        v_player,
        p_station
    );

    return jsonb_build_object(
        'station', p_station,
        'level', v_level,
        'fuel_seconds', coalesce(
            (
                select fuel_seconds
                from public.player_workstations
                where player_id = v_player
                  and station_type = p_station
            ),
            0
        ),
        'recipes', coalesce(
            (
                select jsonb_agg(
                    jsonb_build_object(
                        'key', r.recipe_key,
                        'name', r.name,
                        'description', r.description,
                        'type', r.recipe_type,
                        'output_quantity', r.output_quantity,
                        'level', r.required_station_level,
                        'seconds', r.duration_seconds,
                        'fuel', r.fuel_seconds_required,
                        'ingredients', (
                            select coalesce(
                                jsonb_agg(
                                    jsonb_build_object(
                                        'name', coalesce(
                                            i.name,
                                            ri.forge_material_key
                                        ),
                                        'quantity', ri.quantity,
                                        'available', case
                                            when ri.item_id is not null then
                                                public.shared_item_quantity(
                                                    v_player,
                                                    ri.item_id
                                                )
                                            else coalesce(
                                                (
                                                    select quantity
                                                    from public.player_forge_materials fm
                                                    where fm.player_id = v_player
                                                      and fm.material_key = ri.forge_material_key
                                                ),
                                                0
                                            )
                                        end
                                    )
                                ),
                                '[]'::jsonb
                            )
                            from public.workstation_recipe_ingredients ri
                            left join public.items i
                                on i.id = ri.item_id
                            where ri.recipe_id = r.id
                        )
                    )
                    order by r.sort_order, r.id
                )
                from public.workstation_recipes r
                where r.station_type = p_station
                  and r.is_active = true
                  and r.required_station_level <= v_level
            ),
            '[]'::jsonb
        ),
        'forge_materials', coalesce(
            (
                select jsonb_object_agg(
                    material_key,
                    quantity
                )
                from public.player_forge_materials
                where player_id = v_player
            ),
            '{}'::jsonb
        ),
        'queue', coalesce(
            (
                select jsonb_agg(
                    jsonb_build_object(
                        'id', q.id,
                        'name', r.name,
                        'batches', q.batches,
                        'completes_at', q.completes_at,
                        'remaining_seconds', case
                            when q.station_type = 'forge' then
                                q.remaining_seconds
                            else greatest(
                                0,
                                ceil(
                                    extract(epoch from (
                                        q.completes_at - now()
                                    ))
                                )::integer
                            )
                        end,
                        'ready', case
                            when q.station_type = 'forge' then
                                q.remaining_seconds <= 0
                            else now() >= q.completes_at
                        end,
                        'status', q.status,
                        'paused', case
                            when q.station_type = 'forge' then
                                q.remaining_seconds > 0
                                and coalesce(
                                    (
                                        select fuel_seconds
                                        from public.player_workstations pw
                                        where pw.player_id = v_player
                                          and pw.station_type = 'forge'
                                    ),
                                    0
                                ) <= 0
                            else false
                        end
                    )
                    order by q.id
                )
                from public.workstation_queue q
                join public.workstation_recipes r
                    on r.id = q.recipe_id
                where q.player_id = v_player
                  and q.station_type = p_station
                  and q.status = 'queued'
            ),
            '[]'::jsonb
        )
    );
end;
$$;

grant execute on function public.process_forge_queue(uuid)
    to authenticated;

grant execute on function public.queue_workstation_recipe(text, integer)
    to authenticated;

grant execute on function public.claim_workstation_job(bigint)
    to authenticated;

grant execute on function public.get_workstation_screen(text)
    to authenticated;
