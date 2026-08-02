-- ============================================================
-- MIDGARD LEGACY
-- Migration 024
-- Complete Workbench Recipes, Royal Tutorial Tools and Repairs
-- Safe to run more than once after migrations 021-023.
-- ============================================================

begin;

-- Woodcutting and Mining activities unlock by skill level only.
update public.gathering_resource_nodes
set required_item_id = null,
    consume_required_item = false
where profession in ('woodcutting','mining');

-- Items required by the currently designed Workbench and repair system.
insert into public.items(name,description,type,weight_kg)
select v.name,v.description,v.type,v.weight_kg
from (values
('Wooden Bowl','A carved wooden bowl used for remedies, food and offerings.','container',0.4::numeric),
('Nettle Cordage','Strong cordage twisted from dried nettle fibres.','component',0.1::numeric),
('Strong Stick','A straight seasoned stick suitable for tools and fishing equipment.','component',0.5::numeric),
('Thorn Needle','A hard thorn shaped into a primitive needle.','component',0.02::numeric),
('Rope','A useful length of strong natural-fibre rope.','component',0.8::numeric),
('Feather','A flight feather suitable for fletching arrows.','component',0.02::numeric),
('Arrow','A hunting arrow ready to be fired from a bow.','ammunition',0.08::numeric),
('Iron Arrowhead','A forged iron arrowhead.','component',0.05::numeric),
('Shield Boss','A forged iron boss for the centre of a shield.','component',1.2::numeric),
('Wooden Shield','A round wooden shield strengthened with iron fittings.','equipment',5.0::numeric),
('Bow','A simple hunting bow made from seasoned wood and cordage.','equipment',1.2::numeric)
) as v(name,description,type,weight_kg)
where not exists(select 1 from public.items i where lower(i.name)=lower(v.name));

-- Axe and Pickaxe are royal tutorial rewards, not Job Point purchases.
delete from public.profession_shop_items psi
using public.items i
where psi.item_id=i.id
  and lower(i.name) in ('iron axe','iron pickaxe');

-- Ensure all completed tutorial players own both royal tools at full durability.
insert into public.player_profession_equipment(player_id,equipment_key,current_durability)
select p.id,d.equipment_key,d.maximum_durability
from public.players p
join public.profession_equipment_definitions d
  on d.equipment_key in ('iron_axe','iron_pickaxe')
where p.tutorial_complete=true
on conflict(player_id,equipment_key) do update set
 current_durability=greatest(player_profession_equipment.current_durability,excluded.current_durability),
 updated_at=now();

-- Keep the legacy equipped-tool table in sync for existing game pages.
do $$
declare v_player uuid; v_item record; v_slot text;
begin
 if to_regclass('public.equipment') is null then return; end if;
 for v_player in select id from public.players where tutorial_complete=true loop
  for v_item in select id,name from public.items where lower(name) in ('iron axe','iron pickaxe') loop
   v_slot:=case when lower(v_item.name)='iron pickaxe' then 'pickaxe' else 'axe' end;
   insert into public.equipment(player_id,slot,item_id,durability,max_durability,is_equipped)
   values(v_player,v_slot,v_item.id,100,100,true)
   on conflict(player_id,slot) do update set
    item_id=excluded.item_id,
    durability=greatest(public.equipment.durability,100),
    max_durability=100,
    is_equipped=true;
  end loop;
 end loop;
end $$;

-- Atomic tutorial completion. The server consumes the Mead, grants freedom,
-- gives both permanent royal tools and creates notifications.
create or replace function public.complete_tutorial_with_royal_tools()
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
 v_player uuid:=auth.uid();
 v_row public.players%rowtype;
 v_mead_id bigint;
 v_mead_quantity integer;
 v_tool record;
 v_slot text;
begin
 if v_player is null then raise exception 'Sign in required.'; end if;

 select * into v_row from public.players where id=v_player for update;
 if not found then raise exception 'Player profile not found.'; end if;
 if v_row.tutorial_complete then raise exception 'Your tutorial is already complete.'; end if;
 if coalesce(v_row.tutorial_step,0) <> 14 then raise exception 'Finish the tutorial objectives before returning to the King.'; end if;

 select id into v_mead_id from public.items where lower(name)='young mead' limit 1;
 if v_mead_id is null then raise exception 'Young Mead item is missing from the database.'; end if;

 select quantity into v_mead_quantity from public.inventory
 where player_id=v_player and item_id=v_mead_id for update;
 if coalesce(v_mead_quantity,0)<1 then raise exception 'You do not have the Young Mead.'; end if;

 if v_mead_quantity=1 then
  delete from public.inventory where player_id=v_player and item_id=v_mead_id;
 else
  update public.inventory set quantity=quantity-1 where player_id=v_player and item_id=v_mead_id;
 end if;

 update public.players set
  tutorial_step=15,
  tutorial_complete=true,
  is_free_man=true,
  kings_tax_rate=0.01,
  reputation=coalesce(reputation,0)+100,
  oak_unlocked=true
 where id=v_player;

 for v_tool in
  select * from public.profession_equipment_definitions
  where equipment_key in ('iron_axe','iron_pickaxe')
 loop
  insert into public.player_profession_equipment(player_id,equipment_key,current_durability)
  values(v_player,v_tool.equipment_key,v_tool.maximum_durability)
  on conflict(player_id,equipment_key) do update set
   current_durability=excluded.current_durability,
   updated_at=now();

  if to_regclass('public.equipment') is not null then
   select id into v_mead_id from public.items where lower(name)=lower(v_tool.item_name) limit 1;
   v_slot:=case when v_tool.equipment_key='iron_pickaxe' then 'pickaxe' else 'axe' end;
   insert into public.equipment(player_id,slot,item_id,durability,max_durability,is_equipped)
   values(v_player,v_slot,v_mead_id,100,100,true)
   on conflict(player_id,slot) do update set
    item_id=excluded.item_id,durability=100,max_durability=100,is_equipped=true;
  end if;
 end loop;

 insert into public.player_notifications(player_id,notification_type,title,message,icon,link,unique_key)
 values
 (v_player,'achievement','You Are a Freeman!','Congratulations! The King has released you from thralldom. Your saga truly begins now.','👑','home.html','freeman'),
 (v_player,'equipment','A Gift from the King','The King awarded you a permanent Iron Axe and Iron Pickaxe. They can never be lost, but they must be repaired when damaged.','🪓','gathering.html?profession=woodcutting','royal-tools')
 on conflict(player_id,unique_key) do nothing;

 return jsonb_build_object(
  'tutorial_complete',true,
  'is_free_man',true,
  'iron_axe_durability',100,
  'iron_pickaxe_durability',100
 );
end;$$;

revoke all on function public.complete_tutorial_with_royal_tools() from public,anon;
grant execute on function public.complete_tutorial_with_royal_tools() to authenticated;

-- Full-repair recipes for permanent profession equipment.
create or replace function public.repair_profession_equipment(p_equipment_key text)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
 v_player uuid:=auth.uid();
 v_owned public.player_profession_equipment%rowtype;
 v_definition public.profession_equipment_definitions%rowtype;
 v_costs jsonb;
 v_cost jsonb;
 v_item_id bigint;
 v_item_name text;
 v_quantity integer;
begin
 if v_player is null then raise exception 'Sign in required.'; end if;

 select * into v_definition from public.profession_equipment_definitions
 where equipment_key=p_equipment_key and is_active=true;
 if not found then raise exception 'Equipment not found.'; end if;

 select * into v_owned from public.player_profession_equipment
 where player_id=v_player and equipment_key=p_equipment_key for update;
 if not found then raise exception 'You do not own this equipment.'; end if;
 if v_owned.current_durability>=v_definition.maximum_durability then raise exception 'This equipment does not need repairing.'; end if;

 v_costs:=case p_equipment_key
  when 'iron_axe' then '[{"name":"Iron Bar","quantity":1},{"name":"Wooden Shaft","quantity":1}]'::jsonb
  when 'iron_pickaxe' then '[{"name":"Iron Bar","quantity":1},{"name":"Wooden Shaft","quantity":1}]'::jsonb
  when 'fishing_net' then '[{"name":"Nettle Cordage","quantity":2}]'::jsonb
  when 'fishing_rod' then '[{"name":"Strong Stick","quantity":1},{"name":"Nettle Cordage","quantity":1},{"name":"Thorn Needle","quantity":1}]'::jsonb
  when 'hunting_bow' then '[{"name":"Strong Stick","quantity":1},{"name":"Nettle Cordage","quantity":1}]'::jsonb
  when 'hunting_knife' then '[{"name":"Iron Bar","quantity":1}]'::jsonb
  when 'hunting_spear' then '[{"name":"Wooden Shaft","quantity":1},{"name":"Iron Bar","quantity":1}]'::jsonb
  else '[]'::jsonb end;

 for v_cost in select value from jsonb_array_elements(v_costs) loop
  v_item_name:=v_cost->>'name';
  v_quantity:=(v_cost->>'quantity')::integer;
  select id into v_item_id from public.items where lower(name)=lower(v_item_name) limit 1;
  if v_item_id is null then raise exception 'Repair material % is missing from the database.',v_item_name; end if;
  if public.shared_item_quantity(v_player,v_item_id)<v_quantity then
   raise exception 'You need % x% to complete this repair.',v_item_name,v_quantity;
  end if;
 end loop;

 for v_cost in select value from jsonb_array_elements(v_costs) loop
  select id into v_item_id from public.items where lower(name)=lower(v_cost->>'name') limit 1;
  perform public.consume_shared_item(v_player,v_item_id,(v_cost->>'quantity')::integer);
 end loop;

 update public.player_profession_equipment set
  current_durability=v_definition.maximum_durability,
  updated_at=now()
 where player_id=v_player and equipment_key=p_equipment_key;

 if p_equipment_key in ('iron_axe','iron_pickaxe') and to_regclass('public.equipment') is not null then
  update public.equipment set durability=100,max_durability=100
  where player_id=v_player and slot=case when p_equipment_key='iron_pickaxe' then 'pickaxe' else 'axe' end;
 end if;

 insert into public.player_notifications(player_id,notification_type,title,message,icon,link)
 values(v_player,'equipment','Equipment Repaired',v_definition.display_name||' has been repaired to full durability.',v_definition.icon,'gathering.html?profession='||v_definition.profession);

 return jsonb_build_object('equipment_key',p_equipment_key,'display_name',v_definition.display_name,
  'current_durability',v_definition.maximum_durability,'maximum_durability',v_definition.maximum_durability);
end;$$;

revoke all on function public.repair_profession_equipment(text) from public,anon;
grant execute on function public.repair_profession_equipment(text) to authenticated;

-- Seed the complete set of currently designed Workbench recipes. Recipes are
-- shown even before the station reaches the required level.
create or replace function public.seed_workbench_recipe_024(
 p_key text,p_name text,p_description text,p_output text,p_output_qty integer,
 p_level integer,p_seconds integer,p_sort integer,p_ingredients jsonb)
returns void language plpgsql set search_path=public as $$
declare v_recipe_id bigint; v_output_id bigint; v_ing jsonb; v_ing_id bigint;
begin
 select id into v_output_id from public.items where lower(name)=lower(p_output) limit 1;
 if v_output_id is null then raise exception 'Missing recipe output item: %',p_output; end if;
 insert into public.workstation_recipes(recipe_key,station_type,recipe_type,name,description,
  output_item_id,output_quantity,required_station_level,duration_seconds,fuel_seconds_required,sort_order,is_active)
 values(p_key,'workbench','craft',p_name,p_description,v_output_id,p_output_qty,p_level,p_seconds,0,p_sort,true)
 on conflict(recipe_key) do update set station_type='workbench',recipe_type='craft',name=excluded.name,
  description=excluded.description,output_item_id=excluded.output_item_id,output_quantity=excluded.output_quantity,
  required_station_level=excluded.required_station_level,duration_seconds=excluded.duration_seconds,
  fuel_seconds_required=0,sort_order=excluded.sort_order,is_active=true
 returning id into v_recipe_id;
 delete from public.workstation_recipe_ingredients where recipe_id=v_recipe_id;
 for v_ing in select value from jsonb_array_elements(p_ingredients) loop
  select id into v_ing_id from public.items where lower(name)=lower(v_ing->>'name') limit 1;
  if v_ing_id is null then raise exception 'Missing recipe ingredient item: %',v_ing->>'name'; end if;
  insert into public.workstation_recipe_ingredients(recipe_id,item_id,quantity)
  values(v_recipe_id,v_ing_id,(v_ing->>'quantity')::integer);
 end loop;
end;$$;

select public.seed_workbench_recipe_024('workbench_birch_plank','Birch Plank','Saw a Birch Log into four useful planks.','Birch Plank',4,1,15,10,'[{"name":"Birch Log","quantity":1}]');
select public.seed_workbench_recipe_024('workbench_wooden_shaft','Wooden Shaft','Shape a plank into a strong shaft for tools and weapons.','Wooden Shaft',1,1,8,20,'[{"name":"Birch Plank","quantity":1}]');
select public.seed_workbench_recipe_024('workbench_wooden_beam','Wooden Beam','Join and shape planks into a structural beam.','Wooden Beam',1,1,25,30,'[{"name":"Birch Plank","quantity":4}]');
select public.seed_workbench_recipe_024('workbench_herbal_bandage','Herbal Bandage','Craft a field dressing that can release you from the Healer Hut.','Herbal Bandage',1,1,20,40,'[{"name":"Wild Herbs","quantity":5},{"name":"Stick","quantity":2}]');
select public.seed_workbench_recipe_024('workbench_wooden_bowl','Wooden Bowl','Carve a bowl for food, remedies and sacrifices.','Wooden Bowl',1,1,12,50,'[{"name":"Birch Plank","quantity":1}]');
select public.seed_workbench_recipe_024('workbench_bucket','Empty Bucket','Build a watertight wooden bucket.','Empty Bucket',1,2,30,100,'[{"name":"Birch Plank","quantity":5},{"name":"Iron Hoop","quantity":3}]');
select public.seed_workbench_recipe_024('workbench_barrel_staves','Barrel Staves','Shape planks into a complete set of barrel staves.','Barrel Staves',30,2,40,130,'[{"name":"Birch Plank","quantity":30}]');
select public.seed_workbench_recipe_024('workbench_barrel_lid','Barrel Lid','Build a fitted wooden lid for a barrel.','Barrel Lid',1,2,20,140,'[{"name":"Birch Plank","quantity":5}]');
select public.seed_workbench_recipe_024('workbench_empty_barrel','Empty Barrel','Assemble staves, a lid and six forged hoops.','Empty Barrel',1,2,90,150,'[{"name":"Barrel Staves","quantity":30},{"name":"Barrel Lid","quantity":1},{"name":"Iron Hoop","quantity":6}]');
select public.seed_workbench_recipe_024('workbench_bow','Bow','Build an ordinary hunting bow. Specialist equipment still comes from Job Points.','Bow',1,2,45,160,'[{"name":"Strong Stick","quantity":2},{"name":"Nettle Cordage","quantity":1}]');
select public.seed_workbench_recipe_024('workbench_arrows','Arrows','Assemble a bundle of ten hunting arrows.','Arrow',10,2,35,170,'[{"name":"Wooden Shaft","quantity":10},{"name":"Feather","quantity":10},{"name":"Iron Arrowhead","quantity":10}]');
select public.seed_workbench_recipe_024('workbench_wooden_shield','Wooden Shield','Assemble planks with a forged boss and iron fittings.','Wooden Shield',1,3,90,200,'[{"name":"Birch Plank","quantity":12},{"name":"Shield Boss","quantity":1},{"name":"Iron Nails","quantity":8}]');

drop function public.seed_workbench_recipe_024(text,text,text,text,integer,integer,integer,integer,jsonb);

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
                        'unlocked', r.required_station_level <= v_level,
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


revoke all on function public.get_workstation_screen(text) from public,anon;
grant execute on function public.get_workstation_screen(text) to authenticated;

commit;
