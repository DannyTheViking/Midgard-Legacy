-- Village Blacksmith repairs are a paid NPC service and do not require job progression.

create or replace function public.get_repairable_profession_tools()
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
    v_player uuid:=auth.uid();
    v_tools jsonb;
begin
    if v_player is null then raise exception 'Sign in required.'; end if;

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
    join public.profession_equipment_definitions d
      on d.equipment_key=pe.equipment_key and d.is_active=true
    where pe.player_id=v_player;

    return jsonb_build_object(
        'repairs_unlocked',true,
        'blacksmith_jobs_completed',0,
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
    v_owned public.player_profession_equipment%rowtype;
    v_definition public.profession_equipment_definitions%rowtype;
    v_option public.profession_repair_options%rowtype;
    v_item_id bigint;
begin
    if v_player is null then raise exception 'Sign in required.'; end if;

    select * into v_definition
    from public.profession_equipment_definitions
    where equipment_key=p_equipment_key and is_active=true;
    if not found then raise exception 'Tool not found.'; end if;

    select * into v_owned
    from public.player_profession_equipment
    where player_id=v_player and equipment_key=p_equipment_key
    for update;
    if not found then raise exception 'You do not own this tool.'; end if;
    if v_owned.current_durability>=v_definition.maximum_durability then
        raise exception 'This tool is already fully repaired.';
    end if;

    select * into v_option
    from public.profession_repair_options
    where equipment_key=p_equipment_key and option_key=p_option_key;
    if not found then raise exception 'Choose a valid repair material.'; end if;

    select id into v_item_id
    from public.items
    where lower(name)=lower(v_option.material_name)
    limit 1;
    if v_item_id is null then raise exception 'Repair material % is missing.',v_option.material_name; end if;
    if public.shared_item_quantity(v_player,v_item_id)<v_option.material_quantity then
        raise exception 'You need % x% to repair this tool.',v_option.material_name,v_option.material_quantity;
    end if;

    perform public.consume_shared_item(v_player,v_item_id,v_option.material_quantity);

    update public.player_profession_equipment
    set current_durability=v_definition.maximum_durability,updated_at=now()
    where player_id=v_player and equipment_key=p_equipment_key;

    if p_equipment_key in ('iron_axe','iron_pickaxe') and to_regclass('public.equipment') is not null then
        update public.equipment
        set durability=100,max_durability=100
        where player_id=v_player
          and slot=case when p_equipment_key='iron_pickaxe' then 'pickaxe' else 'axe' end;
    end if;

    perform public.record_task_event(v_player,'repair',1);

    insert into public.player_notifications(player_id,notification_type,title,message,icon,link)
    values(v_player,'equipment','Tool Repaired',v_definition.display_name||' was repaired by Bjørn using '||v_option.option_label||'.',v_definition.icon,'blacksmith.html');

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

revoke all on function public.get_repairable_profession_tools() from public,anon;
revoke all on function public.repair_profession_equipment(text,text) from public,anon;
grant execute on function public.get_repairable_profession_tools() to authenticated;
grant execute on function public.repair_profession_equipment(text,text) to authenticated;
