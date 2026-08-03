-- Core resource rules:
-- Property systems use backpack + active cart + Storage Yard.
-- Village/travel systems use backpack + active cart only.
-- Village jobs accept partial hand-ins.

create or replace function public.carried_item_quantity(p_player uuid, p_item bigint)
returns bigint
language sql
stable
security definer
set search_path = public
as $$
    select
        coalesce((select sum(quantity) from public.inventory where player_id=p_player and item_id=p_item),0) +
        coalesce((
            select sum(ci.quantity)
            from public.player_carts pc
            join public.cart_items ci on ci.cart_id=pc.id
            where pc.player_id=p_player
              and pc.is_active=true
              and ci.item_id=p_item
        ),0);
$$;

create or replace function public.consume_carried_item(p_player uuid, p_item bigint, p_quantity bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
    v_need bigint := p_quantity;
    v_row record;
    v_take bigint;
begin
    if p_quantity <= 0 then return; end if;
    if public.carried_item_quantity(p_player,p_item) < p_quantity then
        raise exception 'Not enough carried materials.';
    end if;

    for v_row in
        select id, quantity
        from public.inventory
        where player_id=p_player and item_id=p_item and quantity>0
        order by id
        for update
    loop
        exit when v_need<=0;
        v_take := least(v_need,v_row.quantity);
        update public.inventory set quantity=quantity-v_take where id=v_row.id;
        delete from public.inventory where id=v_row.id and quantity<=0;
        v_need := v_need-v_take;
    end loop;

    for v_row in
        select ci.id, ci.quantity
        from public.player_carts pc
        join public.cart_items ci on ci.cart_id=pc.id
        where pc.player_id=p_player and pc.is_active=true
          and ci.item_id=p_item and ci.quantity>0
        order by pc.id,ci.id
        for update of ci
    loop
        exit when v_need<=0;
        v_take := least(v_need,v_row.quantity);
        update public.cart_items set quantity=quantity-v_take where id=v_row.id;
        delete from public.cart_items where id=v_row.id and quantity<=0;
        v_need := v_need-v_take;
    end loop;
end;
$$;

grant execute on function public.carried_item_quantity(uuid,bigint) to authenticated;
revoke execute on function public.consume_carried_item(uuid,bigint,bigint) from public,anon,authenticated;

alter table public.player_jobs
add column if not exists requirements_progress jsonb not null default '{}'::jsonb;

create or replace function public.hand_in_village_job(target_job_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    job_record record;
    requirement record;
    item_record record;
    v_progress jsonb;
    v_already bigint;
    v_remaining bigint;
    v_available bigint;
    v_take bigint;
    v_complete boolean := true;
    total_completed integer;
    new_training integer;
    training_message text := null;
    v_job_points integer;
begin
    if auth.uid() is null then raise exception 'You must be logged in.'; end if;

    select pj.id,pj.npc_id,pj.requirements_progress,jt.title,jt.requirements,
           jt.reward_silver,jt.reward_reputation,jt.reward_mission_points,
           jt.reward_job_points,n.code,n.name
    into job_record
    from public.player_jobs pj
    join public.job_templates jt on jt.id=pj.template_id
    join public.job_npcs n on n.id=pj.npc_id
    where pj.id=target_job_id
      and pj.player_id=auth.uid()
      and pj.status='active'
    for update of pj;

    if not found then raise exception 'Active job not found.'; end if;
    v_progress := coalesce(job_record.requirements_progress,'{}'::jsonb);

    for requirement in
        select key, value::text::bigint amount
        from jsonb_each(job_record.requirements)
    loop
        select id,name into item_record
        from public.items
        where lower(name)=lower(requirement.key)
        order by id
        limit 1;

        if not found then raise exception 'Item "%" is missing from the items table.',requirement.key; end if;

        v_already := coalesce((v_progress->>requirement.key)::bigint,0);
        v_remaining := greatest(0,requirement.amount-v_already);
        v_available := public.carried_item_quantity(auth.uid(),item_record.id);
        v_take := least(v_remaining,v_available);

        if v_take>0 then
            perform public.consume_carried_item(auth.uid(),item_record.id,v_take);
            v_already := v_already+v_take;
            v_progress := jsonb_set(v_progress,array[requirement.key],to_jsonb(v_already),true);
        end if;

        if v_already<requirement.amount then v_complete:=false; end if;
    end loop;

    update public.player_jobs
    set requirements_progress=v_progress
    where id=target_job_id;

    if not v_complete then
        return jsonb_build_object(
            'completed',false,
            'title',job_record.title,
            'progress',v_progress,
            'requirements',job_record.requirements
        );
    end if;

    update public.players
    set silver=coalesce(silver,0)+coalesce(job_record.reward_silver,0),
        reputation=coalesce(reputation,0)+coalesce(job_record.reward_reputation,0),
        mission_points=coalesce(mission_points,0)+coalesce(job_record.reward_mission_points,0)
    where id=auth.uid();

    update public.player_jobs
    set status='completed',completed_at=now()
    where id=target_job_id;

    insert into public.profession_progress(player_id,npc_id,jobs_completed,training_level,job_points)
    values(auth.uid(),job_record.npc_id,1,0,greatest(1,coalesce(job_record.reward_job_points,1)))
    on conflict(player_id,npc_id) do update
    set jobs_completed=public.profession_progress.jobs_completed+1,
        job_points=public.profession_progress.job_points+greatest(1,coalesce(job_record.reward_job_points,1)),
        updated_at=now()
    returning jobs_completed,job_points into total_completed,v_job_points;

    new_training:=floor(total_completed/10);
    update public.profession_progress
    set training_level=new_training,updated_at=now()
    where player_id=auth.uid() and npc_id=job_record.npc_id;

    if total_completed%10=0 then
        training_message:=job_record.name||' trains you. Your '||job_record.code||' training is now level '||new_training||'.';
    end if;

    perform public.record_task_event(auth.uid(),'complete_job',1);

    return jsonb_build_object(
        'completed',true,
        'title',job_record.title,
        'jobs_completed',total_completed,
        'training_level',new_training,
        'reward_silver',coalesce(job_record.reward_silver,0),
        'reward_reputation',coalesce(job_record.reward_reputation,0),
        'reward_mission_points',coalesce(job_record.reward_mission_points,0),
        'reward_job_points',greatest(1,coalesce(job_record.reward_job_points,1)),
        'job_point_balance',v_job_points,
        'training_message',training_message
    );
end;
$$;

grant execute on function public.hand_in_village_job(bigint) to authenticated;

-- Property upgrades use all resources at the property.
create or replace function public.upgrade_my_property()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    current_level integer;
    next_level integer;
    req record;
    v_item bigint;
begin
    if auth.uid() is null then raise exception 'Sign in required.'; end if;
    select property_level into current_level from public.players where id=auth.uid() for update;
    next_level:=current_level+1;
    if next_level>4 then raise exception 'Your property is already fully upgraded.'; end if;

    for req in select * from public.property_upgrade_requirements where target_level=next_level loop
        select id into v_item from public.items where lower(name)=lower(req.item_name) order by id limit 1;
        if v_item is null or public.shared_item_quantity(auth.uid(),v_item)<req.quantity then
            raise exception 'You still need more %.',req.item_name;
        end if;
    end loop;

    for req in select * from public.property_upgrade_requirements where target_level=next_level loop
        select id into v_item from public.items where lower(name)=lower(req.item_name) order by id limit 1;
        perform public.consume_shared_item(auth.uid(),v_item,req.quantity);
    end loop;

    update public.players set property_level=next_level where id=auth.uid();
    return jsonb_build_object('property_level',next_level);
end;
$$;

grant execute on function public.upgrade_my_property() to authenticated;

-- Village Forge uses only what the player carries.
create or replace function public.queue_village_forge_order(p_product_key text,p_batches integer)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_player uuid:=auth.uid();
    v_bars_id bigint;
    v_required bigint;
    v_order_id bigint;
begin
    if v_player is null then raise exception 'Sign in required.'; end if;
    if p_product_key not in ('iron_arrowhead','spearhead') then raise exception 'Unknown Village Forge product.'; end if;
    if p_batches<1 or p_batches>1000 then raise exception 'Choose between 1 and 1,000 batches.'; end if;
    perform public.process_village_forge_orders(v_player);
    if exists(select 1 from public.village_forge_orders where player_id=v_player and status='working') then
        raise exception 'Bjørn is already working on an order for you.';
    end if;
    select id into v_bars_id from public.items where lower(name)='iron bar' order by id limit 1;
    v_required:=p_batches;
    if public.carried_item_quantity(v_player,v_bars_id)<v_required then raise exception 'You need % carried Iron Bars.',v_required; end if;
    perform public.consume_carried_item(v_player,v_bars_id,v_required);
    insert into public.village_forge_orders(player_id,product_key,batches_total)
    values(v_player,p_product_key,p_batches) returning id into v_order_id;
    return jsonb_build_object('order_id',v_order_id,'product_key',p_product_key,'batches',p_batches,'bars_used',v_required,'items_per_batch',25,'seconds_per_batch',20);
end;
$$;

grant execute on function public.queue_village_forge_order(text,integer) to authenticated;

-- Hunting/travel ammunition must be carried, never pulled from home storage.
do $$
declare
    v_oid oid;
    v_definition text;
begin
    select 'public.gather_resource_025_core(text,integer)'::regprocedure::oid into v_oid;
    select pg_get_functiondef(v_oid) into v_definition;
    v_definition:=replace(v_definition,'public.shared_item_quantity','public.carried_item_quantity');
    v_definition:=replace(v_definition,'public.consume_shared_item','public.consume_carried_item');
    execute v_definition;
end;
$$;
