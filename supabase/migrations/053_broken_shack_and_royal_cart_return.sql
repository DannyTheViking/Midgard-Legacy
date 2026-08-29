-- Restore the intended post-tutorial property progression.
-- New Freemen receive a Broken Shack (level 0), then upgrade it themselves.

create or replace function public.sync_property_stage_name()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
begin
  new.property_name := case greatest(0, least(4, coalesce(new.property_level, 0)))
    when 0 then 'Broken Shack'
    when 1 then 'Upgraded Shack'
    when 2 then 'Small House'
    when 3 then 'Medium House'
    when 4 then 'Large House'
  end;
  return new;
end;
$function$;

create or replace function public.complete_tutorial_with_royal_tools()
returns jsonb
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare
  v_player uuid := auth.uid();
  v_row public.players%rowtype;
  v_mead_id bigint;
  v_tool record;
  v_item_id bigint;
  v_cart_id bigint;
begin
  if v_player is null then raise exception 'Sign in required.'; end if;
  select * into v_row from public.players where id=v_player for update;
  if not found then raise exception 'Player profile not found.'; end if;
  if v_row.tutorial_complete then raise exception 'Your tutorial is already complete.'; end if;
  if coalesce(v_row.tutorial_step,0)<>14 then raise exception 'Finish the tutorial objectives before returning to the King.'; end if;

  select id into v_mead_id from public.items where lower(name)='young mead' order by id limit 1;
  if v_mead_id is null then raise exception 'Young Mead item is missing from the database.'; end if;
  if public.tutorial_named_item_quantity(v_player,'Young Mead')<1 then raise exception 'You do not have the Young Mead.'; end if;
  perform public.consume_shared_item(v_player,v_mead_id,1);

  select id into v_cart_id from public.player_carts
  where player_id=v_player and transport_type='tutorial_handcart'
  order by is_active desc,id limit 1 for update;

  if v_cart_id is not null then
    insert into public.player_storage(player_id,item_id,quantity)
    select v_player,ci.item_id,sum(ci.quantity) from public.cart_items ci
    where ci.cart_id=v_cart_id group by ci.item_id
    on conflict(player_id,item_id) do update
      set quantity=public.player_storage.quantity+excluded.quantity;
    delete from public.cart_items where cart_id=v_cart_id;
    delete from public.player_carts where id=v_cart_id;
  end if;

  update public.players set
    tutorial_step=15,tutorial_complete=true,is_free_man=true,
    kings_tax_rate=0.01,reputation=coalesce(reputation,0)+100,
    oak_unlocked=true,property_level=0,
    has_rusty_axe=false,rusty_axe_durability=0
  where id=v_player;

  select * into v_tool from public.profession_equipment_definitions where equipment_key='iron_axe' limit 1;
  if found then
    insert into public.player_profession_equipment(player_id,equipment_key,current_durability)
    values(v_player,v_tool.equipment_key,v_tool.maximum_durability)
    on conflict(player_id,equipment_key) do update set current_durability=excluded.current_durability,updated_at=now();
    if to_regclass('public.equipment') is not null then
      select id into v_item_id from public.items where lower(name)=lower(v_tool.item_name) order by id limit 1;
      update public.equipment set item_id=v_item_id,durability=100,max_durability=100,is_equipped=true
      where player_id=v_player and slot='axe';
      if not found then
        insert into public.equipment(player_id,slot,item_id,durability,max_durability,is_equipped)
        values(v_player,'axe',v_item_id,100,100,true);
      end if;
    end if;
  end if;

  insert into public.player_notifications(player_id,notification_type,title,message,icon,link,unique_key) values
    (v_player,'achievement','You Are a Freeman!','The King has released you from thralldom and granted you a Broken Shack to restore. His men delivered everything left in the King''s Handcart to your Storage Yard.','👑','property.html','freeman'),
    (v_player,'equipment','A Gift from the King','The King awarded you a permanent Iron Axe for woodcutting.','🪓','gathering.html?profession=woodcutting','royal-tools')
  on conflict(player_id,unique_key) do nothing;

  return jsonb_build_object('tutorial_complete',true,'is_free_man',true,'property_level',0,'property_name','Broken Shack','royal_cart_returned',v_cart_id is not null);
end;
$function$;
