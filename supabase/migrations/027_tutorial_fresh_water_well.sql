create or replace function public.fill_fresh_water_bucket(p_source text default 'village_well')
returns jsonb
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare
    v_player uuid := auth.uid();
    v_empty_id bigint;
    v_water_id bigint;
    v_destination text;
    v_tutorial jsonb;
begin
    if v_player is null then
        raise exception 'Sign in required.';
    end if;

    if coalesce(p_source,'') not in ('village_well','river') then
        raise exception 'Fresh water source required.';
    end if;

    select id into v_empty_id
    from public.items
    where lower(name)='empty bucket'
    order by id
    limit 1;

    select id into v_water_id
    from public.items
    where lower(name)='water bucket'
    order by case when id=40 then 0 else 1 end, id
    limit 1;

    if public.shared_item_quantity(v_player,v_empty_id) < 1 then
        raise exception 'You need one Empty Bucket.';
    end if;

    perform public.consume_shared_item(v_player,v_empty_id,1);
    v_destination := public.grant_gathered_item(v_player,v_water_id,1);

    begin
        v_tutorial := public.sync_my_tutorial_progress();
    exception when others then
        v_tutorial := null;
    end;

    return jsonb_build_object(
        'filled',true,
        'source',p_source,
        'destination',v_destination,
        'tutorial',v_tutorial
    );
end;
$function$;
