-- Midgard Legacy Update 026
-- Tasks, bedroom equipment, hunting preparation and map teaser support.

begin;

-- ------------------------------------------------------------
-- Equipment metadata and bedroom slots
-- ------------------------------------------------------------
alter table public.items
    add column if not exists equipment_category text,
    add column if not exists equipment_slot text,
    add column if not exists damage integer not null default 0,
    add column if not exists defence integer not null default 0,
    add column if not exists accuracy integer not null default 0;

create table if not exists public.player_equipment_slots (
    player_id uuid not null references public.players(id) on delete cascade,
    slot_key text not null,
    item_id bigint not null references public.items(id) on delete cascade,
    equipped_at timestamptz not null default now(),
    primary key(player_id, slot_key)
);
alter table public.player_equipment_slots enable row level security;
drop policy if exists "Own equipment slots readable" on public.player_equipment_slots;
create policy "Own equipment slots readable" on public.player_equipment_slots for select using(auth.uid()=player_id);

-- Classify known items. New items can use the same columns later.
update public.items set equipment_category='ranged',equipment_slot='ranged' where lower(name) like '% bow';
update public.items set equipment_category='ammo',equipment_slot='ammo' where lower(name) in ('arrow','bolt','iron arrowhead');
update public.items set equipment_category='main_hand',equipment_slot='main_hand' where lower(name) like '% spear' or lower(name) like '% sword' or lower(name) like '% axe';
update public.items set equipment_category='off_hand',equipment_slot='off_hand' where lower(name) like '% knife';
update public.items set equipment_category='defence',equipment_slot='defence' where lower(name) like '% shield';
update public.items set equipment_category='armour',equipment_slot='body' where lower(name) like '% armour' or lower(name) like '% tunic';
update public.items set equipment_category='armour',equipment_slot='head' where lower(name) like '% helmet';
update public.items set equipment_category='utility',equipment_slot='utility' where lower(name) in ('fishing net','fishing rod','hunting trap','bee smoker','bucket','basket');

update public.items i set damage=b.damage,accuracy=greatest(i.accuracy,5)
from public.bow_definitions b where b.item_id=i.id;

create or replace function public.set_equipped_item(p_slot_key text,p_item_id bigint)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_player uuid:=auth.uid(); v_item public.items%rowtype; v_owned bigint;
begin
 if v_player is null then raise exception 'Sign in required.'; end if;
 select * into v_item from public.items where id=p_item_id;
 if v_item.id is null then raise exception 'Item not found.'; end if;
 select coalesce(quantity,0) into v_owned from public.player_storage where player_id=v_player and item_id=p_item_id;
 if coalesce(v_owned,0)<=0 then raise exception 'You do not own this item.'; end if;
 if exists(select 1 from public.player_equipment_slots where player_id=v_player and slot_key=p_slot_key and item_id=p_item_id) then
   delete from public.player_equipment_slots where player_id=v_player and slot_key=p_slot_key;
   return jsonb_build_object('equipped',false);
 end if;
 insert into public.player_equipment_slots(player_id,slot_key,item_id) values(v_player,p_slot_key,p_item_id)
 on conflict(player_id,slot_key) do update set item_id=excluded.item_id,equipped_at=now();
 return jsonb_build_object('equipped',true);
end $$;
grant execute on function public.set_equipped_item(text,bigint) to authenticated;

create or replace function public.get_bedroom_equipment()
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_player uuid:=auth.uid();
begin
 return jsonb_build_object(
  'items',coalesce((select jsonb_agg(jsonb_build_object('item_id',i.id,'name',i.name,'description',i.description,'category',i.equipment_category,'slot_key',coalesce(i.equipment_slot,i.equipment_category),'quantity',s.quantity,'damage',i.damage,'defence',i.defence,'accuracy',i.accuracy,'equipped',exists(select 1 from public.player_equipment_slots e where e.player_id=v_player and e.item_id=i.id)) order by i.name) from public.player_storage s join public.items i on i.id=s.item_id where s.player_id=v_player and s.quantity>0 and i.equipment_category is not null),'[]'::jsonb),
  'equipped',coalesce((select jsonb_agg(jsonb_build_object('slot_key',e.slot_key,'slot_label',initcap(replace(e.slot_key,'_',' ')),'name',i.name)) from public.player_equipment_slots e join public.items i on i.id=e.item_id where e.player_id=v_player),'[]'::jsonb),
  'total_damage',coalesce((select sum(i.damage) from public.player_equipment_slots e join public.items i on i.id=e.item_id where e.player_id=v_player),0),
  'total_defence',coalesce((select sum(i.defence) from public.player_equipment_slots e join public.items i on i.id=e.item_id where e.player_id=v_player),0),
  'total_accuracy',coalesce((select sum(i.accuracy) from public.player_equipment_slots e join public.items i on i.id=e.item_id where e.player_id=v_player),0)
 );
end $$;
grant execute on function public.get_bedroom_equipment() to authenticated;

-- ------------------------------------------------------------
-- Hunter shop: knife is a five-point mini grind; traps are also buyable.
-- ------------------------------------------------------------
insert into public.items(name,description,type,weight_kg,equipment_category,equipment_slot)
select 'Hunting Trap','A reusable trap used for future hunting jobs and creatures.','tool',1.0,'utility','utility'
where not exists(select 1 from public.items where lower(name)='hunting trap');

insert into public.profession_shop_items(npc_id,item_id,job_point_cost,minimum_jobs_completed,is_active,sort_order)
select n.id,i.id,v.cost,0,true,v.sort_order
from public.job_npcs n
join (values('Hunting Knife',5,10),('Hunting Trap',5,20)) v(item_name,cost,sort_order) on true
join public.items i on lower(i.name)=lower(v.item_name)
where lower(n.code)='hunter'
on conflict(npc_id,item_id) do update set job_point_cost=excluded.job_point_cost,is_active=true,sort_order=excluded.sort_order;

-- ------------------------------------------------------------
-- Spear and quiver crafting preparation
-- ------------------------------------------------------------
insert into public.items(name,description,type,weight_kg,equipment_category,equipment_slot,damage,accuracy)
select * from (values
 ('Birch Spear','A light hunting spear.','weapon',1.4::numeric,'main_hand','main_hand',8,2),
 ('Oak Spear','A strong hunting spear suitable for boar.','weapon',1.8::numeric,'main_hand','main_hand',14,3),
 ('Yew Spear','A powerful hunting spear.','weapon',1.7::numeric,'main_hand','main_hand',20,4),
 ('Small Bark Quiver','A bark and cordage quiver holding 25 arrows.','container',0.5::numeric,'utility','quiver',0,0),
 ('Medium Bark Quiver','A bark and cordage quiver holding 50 arrows.','container',0.8::numeric,'utility','quiver',0,0),
 ('Large Bark Quiver','A bark and cordage quiver holding 100 arrows.','container',1.1::numeric,'utility','quiver',0,0)
) v(name,description,type,weight_kg,equipment_category,equipment_slot,damage,accuracy)
where not exists(select 1 from public.items i where lower(i.name)=lower(v.name));

-- Generic bark resource if the project does not already have it.
insert into public.items(name,description,type,weight_kg)
select 'Tree Bark','Flexible bark gathered while chopping trees.','resource',0.05
where not exists(select 1 from public.items where lower(name)='tree bark');

-- Add recipes using helper block and existing workstation tables.
do $$
declare r record; v_recipe bigint; v_out bigint; v_stick bigint; v_cord bigint; v_bark bigint;
begin
 select id into v_cord from public.items where lower(name)='nettle cordage' limit 1;
 select id into v_bark from public.items where lower(name)='tree bark' limit 1;
 for r in select * from (values
  ('workbench_birch_spear','Birch Spear','Birch Large Stick',1,1,45,180),
  ('workbench_oak_spear','Oak Spear','Oak Large Stick',1,2,55,181),
  ('workbench_yew_spear','Yew Spear','Yew Large Stick',1,3,65,182)
 ) x(recipe_key,item_name,stick_name,cord_qty,station_level,duration_seconds,sort_order)
 loop
  select id into v_out from public.items where lower(name)=lower(r.item_name) limit 1;
  select id into v_stick from public.items where lower(name)=lower(r.stick_name) limit 1;
  insert into public.workstation_recipes(recipe_key,station_type,recipe_type,name,description,output_item_id,output_quantity,required_station_level,duration_seconds,fuel_seconds_required,sort_order,is_active)
  values(r.recipe_key,'workbench','craft',r.item_name,'Craft a hunting spear from a large stick and nettle cordage.',v_out,1,r.station_level,r.duration_seconds,0,r.sort_order,true)
  on conflict(recipe_key) do update set output_item_id=excluded.output_item_id,is_active=true returning id into v_recipe;
  delete from public.workstation_recipe_ingredients where recipe_id=v_recipe;
  insert into public.workstation_recipe_ingredients(recipe_id,item_id,quantity) values(v_recipe,v_stick,1),(v_recipe,v_cord,r.cord_qty);
 end loop;
 for r in select * from (values
  ('workbench_small_quiver','Small Bark Quiver',2,2,1,35,190),
  ('workbench_medium_quiver','Medium Bark Quiver',4,4,2,50,191),
  ('workbench_large_quiver','Large Bark Quiver',8,8,3,70,192)
 ) x(recipe_key,item_name,bark_qty,cord_qty,station_level,duration_seconds,sort_order)
 loop
  select id into v_out from public.items where lower(name)=lower(r.item_name) limit 1;
  insert into public.workstation_recipes(recipe_key,station_type,recipe_type,name,description,output_item_id,output_quantity,required_station_level,duration_seconds,fuel_seconds_required,sort_order,is_active)
  values(r.recipe_key,'workbench','craft',r.item_name,'Craft a quiver from bark and nettle cordage.',v_out,1,r.station_level,r.duration_seconds,0,r.sort_order,true)
  on conflict(recipe_key) do update set output_item_id=excluded.output_item_id,is_active=true returning id into v_recipe;
  delete from public.workstation_recipe_ingredients where recipe_id=v_recipe;
  insert into public.workstation_recipe_ingredients(recipe_id,item_id,quantity) values(v_recipe,v_bark,r.bark_qty),(v_recipe,v_cord,r.cord_qty);
 end loop;
end $$;

-- ------------------------------------------------------------
-- Ten daily, weekly and monthly tasks with action-based progress.
-- ------------------------------------------------------------
create table if not exists public.player_task_sets(
 id bigserial primary key, player_id uuid not null references public.players(id) on delete cascade,
 period text not null check(period in ('daily','weekly','monthly')), period_key text not null,
 reward_silver integer not null, reward_claimed boolean not null default false,
 rewarded_at timestamptz, created_at timestamptz not null default now(), unique(player_id,period,period_key)
);
create table if not exists public.player_tasks(
 id bigserial primary key, task_set_id bigint not null references public.player_task_sets(id) on delete cascade,
 task_key text not null, label text not null, event_key text not null, target bigint not null,
 progress bigint not null default 0, completed boolean not null default false, sort_order integer not null
);
alter table public.player_task_sets enable row level security; alter table public.player_tasks enable row level security;
drop policy if exists "Own task sets readable" on public.player_task_sets;
create policy "Own task sets readable" on public.player_task_sets for select using(auth.uid()=player_id);
drop policy if exists "Own tasks readable" on public.player_tasks;
create policy "Own tasks readable" on public.player_tasks for select using(exists(select 1 from public.player_task_sets s where s.id=task_set_id and s.player_id=auth.uid()));

create or replace function public.task_period_key(p_period text,p_now timestamptz default now()) returns text language plpgsql stable as $$
declare d date:=(p_now at time zone 'Europe/London')::date; first_thursday date;
begin
 if p_period='daily' then return to_char(d,'YYYY-MM-DD'); end if;
 if p_period='weekly' then return to_char(d-((extract(dow from d)::int+3)%7),'YYYY-MM-DD'); end if;
 first_thursday:=date_trunc('month',d)::date+((4-extract(dow from date_trunc('month',d)::date)::int+7)%7);
 if d<first_thursday then first_thursday:=(date_trunc('month',d)-interval '1 month')::date+((4-extract(dow from (date_trunc('month',d)-interval '1 month')::date)::int+7)%7); end if;
 return to_char(first_thursday,'YYYY-MM-DD');
end $$;

create or replace function public.ensure_player_task_set(p_player uuid,p_period text) returns bigint language plpgsql security definer set search_path=public as $$
declare k text:=public.task_period_key(p_period); sid bigint; mult integer; reward integer;
begin
 select id into sid from public.player_task_sets where player_id=p_player and period=p_period and period_key=k;
 if sid is not null then return sid; end if;
 mult:=case p_period when 'daily' then 1 when 'weekly' then 10 else 50 end;
 reward:=case p_period when 'daily' then 1000 when 'weekly' then 7500 else 30000 end;
 insert into public.player_task_sets(player_id,period,period_key,reward_silver) values(p_player,p_period,k,reward) returning id into sid;
 insert into public.player_tasks(task_set_id,task_key,label,event_key,target,sort_order) values
 (sid,'logs','Gather Logs','gather_logs',100*mult,1),(sid,'sticks','Gather Sticks','gather_sticks',150*mult,2),
 (sid,'resources','Gather Any Resources','gather_any',250*mult,3),(sid,'arrowheads','Craft Iron Arrowheads','craft_arrowheads',100*mult,4),
 (sid,'arrows','Craft Arrows','craft_arrows',20*mult,5),(sid,'bows','Craft Bows','craft_bows',1*greatest(1,mult/2),6),
 (sid,'spears','Craft Spears','craft_spears',1*greatest(1,mult/2),7),(sid,'cordage','Craft Nettle Cordage','craft_cordage',5*mult,8),
 (sid,'repairs','Repair Tools or Equipment','repair',1*greatest(1,mult/2),9),(sid,'jobs','Complete Local Jobs','complete_job',2*greatest(1,mult/2),10);
 return sid;
end $$;

create or replace function public.record_task_event(p_player uuid,p_event_key text,p_amount bigint) returns void language plpgsql security definer set search_path=public as $$
declare per text; sid bigint;
begin
 if p_amount<=0 then return; end if;
 foreach per in array array['daily','weekly','monthly'] loop
  sid:=public.ensure_player_task_set(p_player,per);
  update public.player_tasks set progress=least(target,progress+p_amount),completed=(progress+p_amount)>=target where task_set_id=sid and event_key=p_event_key and not completed;
 end loop;
end $$;

-- Wrap current gathering function and count broad categories after successful actions.
alter function public.gather_resource(text,integer) rename to gather_resource_025_core;
create or replace function public.gather_resource(p_node_key text,p_actions integer default 1) returns jsonb language plpgsql security definer set search_path=public as $$
declare v jsonb; q bigint; item_name text;
begin
 v:=public.gather_resource_025_core(p_node_key,p_actions); q:=coalesce((v->>'primary_quantity')::bigint,0); item_name:=lower(coalesce(v->>'primary_item',''));
 perform public.record_task_event(auth.uid(),'gather_any',q);
 if item_name like '%log%' then perform public.record_task_event(auth.uid(),'gather_logs',q); end if;
 if item_name like '%stick%' then perform public.record_task_event(auth.uid(),'gather_sticks',q); end if;
 return v;
end $$;

-- Wrap crafting collection; progress counts output made, even if later used or sold.
alter function public.claim_workstation_job(bigint) rename to claim_workstation_job_025_core;
create or replace function public.claim_workstation_job(p_job_id bigint) returns jsonb language plpgsql security definer set search_path=public as $$
declare v jsonb; n text; q bigint;
begin
 v:=public.claim_workstation_job_025_core(p_job_id); n:=lower(coalesce(v->>'name','')); q:=coalesce((v->>'quantity')::bigint,0);
 if n like '%arrowhead%' then perform public.record_task_event(auth.uid(),'craft_arrowheads',q); end if;
 if n='arrow' or n like '% arrows' then perform public.record_task_event(auth.uid(),'craft_arrows',q); end if;
 if n like '%bow%' then perform public.record_task_event(auth.uid(),'craft_bows',q); end if;
 if n like '%spear%' then perform public.record_task_event(auth.uid(),'craft_spears',q); end if;
 if n like '%cordage%' then perform public.record_task_event(auth.uid(),'craft_cordage',q); end if;
 return v;
end $$;

create or replace function public.get_player_tasks(p_period text) returns jsonb language plpgsql security definer set search_path=public as $$
declare v_player uuid:=auth.uid(); sid bigint; s public.player_task_sets%rowtype; reset_text text;
begin
 sid:=public.ensure_player_task_set(v_player,p_period); select * into s from public.player_task_sets where id=sid;
 reset_text:=case p_period when 'daily' then 'at midnight' when 'weekly' then 'Thursday at midnight' else 'the first Thursday of the month' end;
 return jsonb_build_object('period_name',initcap(p_period),'reward_silver',s.reward_silver,'reward_claimed',s.reward_claimed,'resets_at_display',reset_text,
 'tasks',coalesce((select jsonb_agg(jsonb_build_object('id',t.id,'label',t.label,'progress',t.progress,'target',t.target,'completed',t.completed) order by t.sort_order) from public.player_tasks t where t.task_set_id=sid),'[]'::jsonb));
end $$;
grant execute on function public.get_player_tasks(text) to authenticated;

create or replace function public.claim_task_reward(p_period text) returns jsonb language plpgsql security definer set search_path=public as $$
declare v_player uuid:=auth.uid(); sid bigint; s public.player_task_sets%rowtype; done integer;
begin
 sid:=public.ensure_player_task_set(v_player,p_period); select * into s from public.player_task_sets where id=sid for update;
 select count(*) into done from public.player_tasks where task_set_id=sid and completed;
 if done<10 then raise exception 'Complete all ten tasks first.'; end if;
 if s.reward_claimed then raise exception 'Reward already claimed.'; end if;
 update public.players set silver=silver+s.reward_silver where id=v_player;
 update public.player_task_sets set reward_claimed=true,rewarded_at=now() where id=sid;
 insert into public.notifications(player_id,title,message,notification_type) values(v_player,initcap(p_period)||' Tasks Complete!','Good job, warrior! You completed all 10 '||p_period||' tasks and earned '||s.reward_silver||' Silver.','task_reward');
 return jsonb_build_object('silver_awarded',s.reward_silver);
end $$;
grant execute on function public.claim_task_reward(text) to authenticated;

commit;
