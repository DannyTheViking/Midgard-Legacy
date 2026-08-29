-- Mead Hall shared-resource fix.
-- The Mead Hall must use the same Backpack + active cart + Storage Yard
-- resource pool as the rest of the property/tutorial systems.

create or replace function public.add_mead_barrel_shared(p_slot integer)
returns jsonb
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare
  v_player uuid:=auth.uid();
  v_item_id bigint;
  v_barrel_id bigint;
begin
  if v_player is null then raise exception 'Sign in required.'; end if;
  if p_slot<1 or p_slot>5 then raise exception 'Invalid mead shelf.'; end if;
  if exists(select 1 from public.mead_barrels where player_id=v_player and slot=p_slot) then
    raise exception 'That shelf already has a barrel.';
  end if;

  select id into v_item_id
  from public.items
  where lower(name)='empty barrel'
  order by id
  limit 1;

  if v_item_id is null then raise exception 'Empty Barrel item is missing.'; end if;
  if public.shared_item_quantity(v_player,v_item_id)<1 then
    raise exception 'You need 1 Empty Barrel.';
  end if;

  perform public.consume_shared_item(v_player,v_item_id,1);

  insert into public.mead_barrels(player_id,slot,stage,started_at)
  values(v_player,p_slot,'barrel_added',null)
  returning id into v_barrel_id;

  return jsonb_build_object('added',true,'barrel_id',v_barrel_id,'slot',p_slot);
end;
$function$;

grant execute on function public.add_mead_barrel_shared(integer) to authenticated;

create or replace function public.start_young_mead_shared(p_barrel_id bigint)
returns jsonb
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare
  v_player uuid:=auth.uid();
  v_honey_id bigint;
  v_water_id bigint;
  v_barrel public.mead_barrels%rowtype;
begin
  if v_player is null then raise exception 'Sign in required.'; end if;

  select * into v_barrel
  from public.mead_barrels
  where id=p_barrel_id and player_id=v_player
  for update;

  if not found then raise exception 'Mead barrel not found.'; end if;
  if coalesce(v_barrel.stage,'')<>'barrel_added' then
    raise exception 'That barrel is not ready to fill.';
  end if;

  select id into v_honey_id from public.items where lower(name)='honey bucket' order by id limit 1;
  -- The tutorial/current water system uses the canonical newer Water Bucket.
  select id into v_water_id from public.items where lower(name)='water bucket' order by id desc limit 1;

  if v_honey_id is null or v_water_id is null then raise exception 'Brewing materials are missing.'; end if;
  if public.shared_item_quantity(v_player,v_honey_id)<1 then raise exception 'You need 1 Honey Bucket.'; end if;
  if public.shared_item_quantity(v_player,v_water_id)<1 then raise exception 'You need 1 Water Bucket.'; end if;

  perform public.consume_shared_item(v_player,v_honey_id,1);
  perform public.consume_shared_item(v_player,v_water_id,1);

  update public.mead_barrels
  set stage='brewing',started_at=now()
  where id=p_barrel_id;

  return jsonb_build_object('started',true,'barrel_id',p_barrel_id);
end;
$function$;

grant execute on function public.start_young_mead_shared(bigint) to authenticated;
