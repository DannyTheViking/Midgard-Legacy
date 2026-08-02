begin;

-- Core materials missing from the current crafting loop.
insert into public.items(name,description,type,category,base_value,value,weight_kg,stackable,tradeable,is_active)
select * from (values
 ('Nettle Stem','Fibrous nettle stem used for cordage, string and rope.','resource','crafting',3::bigint,3::bigint,0.04::numeric,true,true,true),
 ('Nettle Leaves','Fresh nettle leaves used in soup and simple remedies.','resource','food_material',4::bigint,4::bigint,0.03::numeric,true,true,true),
 ('Blackberry Stem','A flexible bramble stem that can be worked into cordage.','resource','crafting',3::bigint,3::bigint,0.04::numeric,true,true,true)
) v(name,description,type,category,base_value,value,weight_kg,stackable,tradeable,is_active)
where not exists(select 1 from public.items i where lower(i.name)=lower(v.name));

-- Sensible shared guide values for the systems already in the game.
insert into public.item_values(item_id,silver_value)
select i.id, v.silver_value
from (values
 ('Stick',1),('Birch Large Stick',4),('Pine Large Stick',5),('Oak Large Stick',8),('Ash Large Stick',9),('Yew Large Stick',12),
 ('Birch Log',10),('Pine Log',12),('Willow Log',11),('Oak Log',20),('Ash Log',22),('Maple Log',24),('Yew Log',30),
 ('Rock',4),('Bog Iron',12),('Iron Ore',20),('Iron Bar',60),('Coal',15),('Iron Nails',2),
 ('Iron Arrowhead',3),('Spearhead',30),('Arrow',8),('Feather',2),('Feathers',2),('Egg',3),('Bird Nest',5),
 ('Nettle Stem',3),('Nettle Leaves',4),('Blackberry Stem',3),('Nettle Cordage',12),('Blackberry',6),
 ('Rabbit Meat',12),('Game Bird Meat',14),('Deer Meat',25),('Boar Meat',30),('Bear Meat',60),
 ('Rabbit Hide',20),('Deer Hide',60),('Boar Hide',75),('Bear Hide',140),('Animal Hide',40),
 ('Roasted Meat',18),('Burnt Food',1),('Burnt Meat',1),('Meat Broth',25),('Honey',50),('Wild Herbs',8),('Mushroom',6)
) v(name,silver_value)
join public.items i on lower(i.name)=lower(v.name)
on conflict(item_id) do update set silver_value=excluded.silver_value;

update public.items i set base_value=iv.silver_value,value=iv.silver_value
from public.item_values iv where iv.item_id=i.id and coalesce(iv.silver_value,0)>0;

-- Split nettles into stems and leaves.
update public.gathering_resource_nodes n
set primary_item_id=(select id from public.items where lower(name)='nettle stem' limit 1),
    bonus_item_id=(select id from public.items where lower(name)='nettle leaves' limit 1),
    bonus_minimum=1, bonus_maximum=3,
    description='Gather nettle stems for cordage and leaves for cooking and remedies.'
where n.node_key='nettle_patch';

-- Blackberry bushes can occasionally provide useful stems.
update public.gathering_resource_nodes n
set bonus_item_id=(select id from public.items where lower(name)='blackberry stem' limit 1),
    bonus_minimum=1, bonus_maximum=2
where lower(n.display_name) like '%berry%' and n.profession='foraging' and n.bonus_item_id is null;

-- Workbench cordage recipes.
do $$
declare r_id bigint; out_id bigint; stem_id bigint;
begin
 select id into out_id from public.items where lower(name)='nettle cordage' limit 1;
 select id into stem_id from public.items where lower(name)='nettle stem' limit 1;
 if out_id is not null and stem_id is not null then
   select id into r_id from public.workstation_recipes where recipe_key='workbench_nettle_cordage';
   if r_id is null then
     insert into public.workstation_recipes(recipe_key,station_type,recipe_type,name,description,output_item_id,output_quantity,required_station_level,duration_seconds,sort_order,is_active)
     values('workbench_nettle_cordage','workbench','craft','Nettle Cordage','Twist dried nettle stems into strong cordage.',out_id,1,1,10,12,true)
     returning id into r_id;
   else update public.workstation_recipes set is_active=true,output_item_id=out_id,required_station_level=1 where id=r_id; end if;
   delete from public.workstation_recipe_ingredients where recipe_id=r_id;
   insert into public.workstation_recipe_ingredients(recipe_id,item_id,quantity) values(r_id,stem_id,5);
 end if;
end $$;

do $$
declare r_id bigint; out_id bigint; stem_id bigint;
begin
 select id into out_id from public.items where lower(name)='nettle cordage' limit 1;
 select id into stem_id from public.items where lower(name)='blackberry stem' limit 1;
 if out_id is not null and stem_id is not null then
   select id into r_id from public.workstation_recipes where recipe_key='workbench_bramble_cordage';
   if r_id is null then
     insert into public.workstation_recipes(recipe_key,station_type,recipe_type,name,description,output_item_id,output_quantity,required_station_level,duration_seconds,sort_order,is_active)
     values('workbench_bramble_cordage','workbench','craft','Bramble Cordage','Strip and twist blackberry stems into rough cordage.',out_id,1,1,12,13,true)
     returning id into r_id;
   else update public.workstation_recipes set is_active=true,output_item_id=out_id,required_station_level=1 where id=r_id; end if;
   delete from public.workstation_recipe_ingredients where recipe_id=r_id;
   insert into public.workstation_recipe_ingredients(recipe_id,item_id,quantity) values(r_id,stem_id,6);
 end if;
end $$;

-- Forge recipes for arrowheads and spearheads.
do $$
declare r_id bigint; bar_id bigint; output_id bigint;
begin
 select id into bar_id from public.items where lower(name)='iron bar' limit 1;
 select id into output_id from public.items where lower(name)='iron arrowhead' limit 1;
 if bar_id is not null and output_id is not null then
  select id into r_id from public.workstation_recipes where recipe_key='forge_iron_arrowheads';
  if r_id is null then
   insert into public.workstation_recipes(recipe_key,station_type,recipe_type,name,description,output_item_id,output_quantity,required_station_level,duration_seconds,fuel_seconds_required,sort_order,is_active)
   values('forge_iron_arrowheads','forge','craft','Iron Arrowheads','Forge one Iron Bar into twenty-five arrowheads.',output_id,25,1,20,20,8,true) returning id into r_id;
  else update public.workstation_recipes set is_active=true,output_quantity=25,required_station_level=1 where id=r_id; end if;
  delete from public.workstation_recipe_ingredients where recipe_id=r_id;
  insert into public.workstation_recipe_ingredients(recipe_id,item_id,quantity) values(r_id,bar_id,1);
 end if;
 select id into output_id from public.items where lower(name)='spearhead' limit 1;
 if bar_id is not null and output_id is not null then
  select id into r_id from public.workstation_recipes where recipe_key='forge_iron_spearhead';
  if r_id is null then
   insert into public.workstation_recipes(recipe_key,station_type,recipe_type,name,description,output_item_id,output_quantity,required_station_level,duration_seconds,fuel_seconds_required,sort_order,is_active)
   values('forge_iron_spearhead','forge','craft','Iron Spearhead','Forge an Iron Bar into a sturdy spearhead.',output_id,1,1,30,30,9,true) returning id into r_id;
  else update public.workstation_recipes set is_active=true,required_station_level=1 where id=r_id; end if;
  delete from public.workstation_recipe_ingredients where recipe_id=r_id;
  insert into public.workstation_recipe_ingredients(recipe_id,item_id,quantity) values(r_id,bar_id,1);
 end if;
end $$;

-- Never allow the active cart to exceed its capacity. Any exception rolls back energy and rewards.
create or replace function public.grant_gathered_item(p_player uuid,p_item_id bigint,p_quantity bigint)
returns text language plpgsql security definer set search_path='public' as $$
declare v_cart record; v_weight numeric:=0; v_added numeric:=0; v_item_weight numeric:=0;
begin
 if coalesce(p_quantity,0)<=0 then return 'none'; end if;
 select * into v_cart from public.player_carts where player_id=p_player and is_active=true order by id limit 1 for update;
 if found then
   select coalesce(sum(ci.quantity*coalesce(i.weight_kg,0)),0) into v_weight from public.cart_items ci join public.items i on i.id=ci.item_id where ci.cart_id=v_cart.id;
   select coalesce(weight_kg,0) into v_item_weight from public.items where id=p_item_id;
   v_added:=p_quantity*v_item_weight;
   if v_weight+v_added>coalesce(v_cart.capacity_kg,100) then
     raise exception 'Your % is full. This haul needs %kg but only %kg remains. Unload it at your Storage Yard.',v_cart.name,round(v_added,2),round(greatest(0,coalesce(v_cart.capacity_kg,100)-v_weight),2);
   end if;
   insert into public.cart_items(cart_id,item_id,quantity) values(v_cart.id,p_item_id,p_quantity)
   on conflict(cart_id,item_id) do update set quantity=public.cart_items.quantity+excluded.quantity;
   return 'cart';
 end if;
 insert into public.inventory(player_id,item_id,quantity) values(p_player,p_item_id,p_quantity)
 on conflict(player_id,item_id) do update set quantity=public.inventory.quantity+excluded.quantity;
 return 'backpack';
end $$;

-- Restore tool damage and enforce the hunting tool belt.
create or replace function public.gather_resource(p_node_key text,p_actions integer default 1)
returns jsonb language plpgsql security definer set search_path='public' as $$
declare v_player uuid:=auth.uid(); v_profession text; v_tool text; v_owned record; v_result jsonb; v_quantity bigint; v_item_name text; v_bow_equipped boolean:=false;
begin
 if v_player is null then raise exception 'Sign in required.'; end if;
 select profession into v_profession from public.gathering_resource_nodes where node_key=p_node_key and is_active=true;
 if v_profession='woodcutting' then v_tool:='iron_axe'; end if;
 if v_profession='mining' then v_tool:='iron_pickaxe'; end if;
 if v_tool is not null then
   select * into v_owned from public.player_profession_equipment where player_id=v_player and equipment_key=v_tool for update;
   if not found then raise exception 'You need an % in your tool belt.',case when v_tool='iron_axe' then 'Iron Axe' else 'Iron Pickaxe' end; end if;
   if v_owned.current_durability<p_actions then raise exception 'Your tool is too damaged. Repair it before doing % actions.',p_actions; end if;
 end if;
 if v_profession='hunting' then
   if not exists(select 1 from public.player_profession_equipment where player_id=v_player and equipment_key='hunting_knife' and current_durability>0) then
     raise exception 'Hunting is locked until a Hunting Knife is added to your tool belt.';
   end if;
   select exists(select 1 from public.player_equipment_slots e join public.items i on i.id=e.item_id where e.player_id=v_player and e.slot_key='ranged' and lower(i.name) like '%bow%') into v_bow_equipped;
   if not v_bow_equipped then raise exception 'Equip a crafted Bow in your Bedroom before hunting.'; end if;
 end if;
 v_result:=public.gather_resource_025_core(p_node_key,p_actions);
 if v_tool is not null then
   update public.player_profession_equipment set current_durability=greatest(0,current_durability-p_actions),updated_at=now() where player_id=v_player and equipment_key=v_tool;
   v_result:=v_result||jsonb_build_object('tool_durability_remaining',(select current_durability from public.player_profession_equipment where player_id=v_player and equipment_key=v_tool));
 end if;
 v_quantity:=coalesce((v_result->>'primary_quantity')::bigint,0); v_item_name:=lower(coalesce(v_result->>'primary_item',''));
 perform public.record_task_event(v_player,'gather_actions',greatest(1,p_actions)); perform public.record_task_event(v_player,'gather_any',v_quantity);
 if v_item_name like '%log%' then perform public.record_task_event(v_player,'gather_logs',v_quantity); end if;
 if v_item_name like '%stick%' then perform public.record_task_event(v_player,'gather_sticks',v_quantity); end if;
 if v_profession='woodcutting' then perform public.record_task_event(v_player,'gather_woodcutting',v_quantity); end if;
 if v_profession='mining' then perform public.record_task_event(v_player,'gather_mining',v_quantity); end if;
 if v_profession='foraging' then perform public.record_task_event(v_player,'gather_foraging',v_quantity); end if;
 return v_result;
end $$;
grant execute on function public.gather_resource(text,integer) to authenticated;

-- Keep the shared healer ward populated without requiring a page visit.
create or replace function public.ensure_npc_hospital_population(p_minimum integer default 3)
returns integer language plpgsql security definer set search_path='public','pg_temp' as $$
declare active_count integer; made integer:=0; chosen bigint; injury text; mins integer;
begin
 update public.npc_hospital_visits set status='recovered' where status='recovering' and recovery_at<=now();
 select count(*) into active_count from public.npc_hospital_visits where status='recovering';
 while active_count<least(greatest(p_minimum,0),6) loop
  select id into chosen from public.village_npcs n where n.is_active=true and not exists(select 1 from public.npc_hospital_visits h where h.npc_id=n.id and h.status='recovering') order by random() limit 1;
  exit when chosen is null;
  injury:=(array['Lost an argument with a goat.','A rotten branch landed directly on their head.','Hooked their own ear while fishing.','Attempted to ride a very angry pig.','Opened a beehive because the bees looked friendly.','Was defeated by a bucket, a fence and one furious goose.'])[1+floor(random()*6)::int];
  mins:=25+floor(random()*66)::int;
  insert into public.npc_hospital_visits(npc_id,injury_text,start_health,regen_per_minute,recovery_at,status) values(chosen,injury,1,5,now()+make_interval(mins=>mins),'recovering');
  active_count:=active_count+1; made:=made+1;
 end loop;
 return made;
end $$;
revoke all on function public.ensure_npc_hospital_population(integer) from public,anon,authenticated;
select public.ensure_npc_hospital_population(3);
do $$ begin
 if exists(select 1 from pg_extension where extname='pg_cron') then
   if not exists(select 1 from cron.job where jobname='midgard_healer_population') then
     perform cron.schedule('midgard_healer_population','*/10 * * * *','select public.ensure_npc_hospital_population(3);');
   end if;
 end if;
end $$;

-- Generic value-based NPC trading across all current tradeable items.
create or replace function public.get_trade_catalog()
returns jsonb language sql security definer set search_path='public' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',i.id,'name',i.name,'category',coalesce(i.category,i.type,'other'),'value',coalesce(iv.silver_value,i.base_value,i.value,1),'owned',public.shared_item_quantity(auth.uid(),i.id)) order by coalesce(i.category,i.type,'other'),i.name),'[]'::jsonb)
 from public.items i left join public.item_values iv on iv.item_id=i.id
 where coalesce(i.tradeable,true)=true and coalesce(i.is_active,true)=true and coalesce(iv.silver_value,i.base_value,i.value,0)>0;
$$;
grant execute on function public.get_trade_catalog() to authenticated;

create or replace function public.complete_value_trade(p_sell_item bigint,p_sell_quantity bigint,p_buy_item bigint)
returns jsonb language plpgsql security definer set search_path='public' as $$
declare v_player uuid:=auth.uid(); sell_value bigint; buy_value bigint; receive_qty bigint; sell_name text; buy_name text;
begin
 if v_player is null then raise exception 'Sign in required.'; end if;
 if p_sell_item=p_buy_item then raise exception 'Choose two different items.'; end if;
 if coalesce(p_sell_quantity,0)<1 then raise exception 'Choose an amount to trade.'; end if;
 select i.name,coalesce(iv.silver_value,i.base_value,i.value,0) into sell_name,sell_value from public.items i left join public.item_values iv on iv.item_id=i.id where i.id=p_sell_item;
 select i.name,coalesce(iv.silver_value,i.base_value,i.value,0) into buy_name,buy_value from public.items i left join public.item_values iv on iv.item_id=i.id where i.id=p_buy_item;
 if sell_value<=0 or buy_value<=0 then raise exception 'One of these items has no trade value.'; end if;
 if public.shared_item_quantity(v_player,p_sell_item)<p_sell_quantity then raise exception 'You do not own enough %.',sell_name; end if;
 receive_qty:=floor((p_sell_quantity*sell_value)::numeric/buy_value)::bigint;
 if receive_qty<1 then raise exception 'Your offer is not valuable enough to receive one %.',buy_name; end if;
 perform public.consume_shared_item(v_player,p_sell_item,p_sell_quantity);
 perform public.grant_gathered_item(v_player,p_buy_item,receive_qty);
 return jsonb_build_object('sold_name',sell_name,'sold_quantity',p_sell_quantity,'received_name',buy_name,'received_quantity',receive_qty,'trade_value',p_sell_quantity*sell_value);
end $$;
grant execute on function public.complete_value_trade(bigint,bigint,bigint) to authenticated;

commit;
