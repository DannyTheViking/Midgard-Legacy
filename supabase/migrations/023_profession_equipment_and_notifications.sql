-- ============================================================
-- MIDGARD LEGACY
-- Migration 023: Permanent profession equipment and notifications
-- Run after migrations 001-022.
-- ============================================================

begin;

-- ------------------------------------------------------------
-- Permanent profession equipment
-- ------------------------------------------------------------
create table if not exists public.profession_equipment_definitions (
    equipment_key text primary key,
    display_name text not null,
    profession text not null check (profession in ('woodcutting','mining','fishing','hunting')),
    icon text not null default '🧰',
    maximum_durability integer not null check (maximum_durability > 0),
    description text not null,
    item_name text unique,
    sort_order integer not null default 0,
    is_active boolean not null default true
);

create table if not exists public.player_profession_equipment (
    player_id uuid not null references public.players(id) on delete cascade,
    equipment_key text not null references public.profession_equipment_definitions(equipment_key),
    current_durability integer not null,
    acquired_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    primary key (player_id, equipment_key)
);

alter table public.profession_equipment_definitions enable row level security;
alter table public.player_profession_equipment enable row level security;

drop policy if exists "Equipment definitions readable" on public.profession_equipment_definitions;
create policy "Equipment definitions readable"
on public.profession_equipment_definitions for select to authenticated
using (is_active);

drop policy if exists "Players read own profession equipment" on public.player_profession_equipment;
create policy "Players read own profession equipment"
on public.player_profession_equipment for select to authenticated
using (auth.uid() = player_id);

insert into public.profession_equipment_definitions
(equipment_key, display_name, profession, icon, maximum_durability, description, item_name, sort_order)
values
('iron_axe','Iron Axe','woodcutting','🪓',100,'A permanent woodcutting tool. It is never lost, but must be repaired when its durability reaches zero.','Iron Axe',10),
('iron_pickaxe','Iron Pickaxe','mining','⛏️',100,'A permanent mining tool. It is never lost, but must be repaired when its durability reaches zero.','Iron Pickaxe',10),
('fishing_net','Fishing Net','fishing','🕸️',100,'Required to fish. With bait, the net gives a 50% catch chance.','Fishing Net',10),
('fishing_rod','Fishing Rod','fishing','🎣',100,'Used alongside the net and bait to raise fishing catch chance to 100%.','Fishing Rod',20),
('hunting_bow','Hunting Bow','hunting','🏹',100,'Best for small and medium game. Arrows are consumed, but the bow is permanent.','Hunting Bow',10),
('hunting_knife','Hunting Knife','hunting','🔪',100,'Used to process carcasses into meat, hide, bone and other materials.','Hunting Knife',20),
('hunting_spear','Hunting Spear','hunting','🗡️',100,'A durable hunting weapon suited to larger or more dangerous animals.','Hunting Spear',30)
on conflict (equipment_key) do update set
 display_name=excluded.display_name, profession=excluded.profession, icon=excluded.icon,
 maximum_durability=excluded.maximum_durability, description=excluded.description,
 item_name=excluded.item_name, sort_order=excluded.sort_order, is_active=true;

-- Existing owners of these items receive the permanent equipment unlock.
insert into public.player_profession_equipment(player_id,equipment_key,current_durability)
select inv.player_id, d.equipment_key, d.maximum_durability
from public.inventory inv
join public.items i on i.id=inv.item_id
join public.profession_equipment_definitions d on lower(d.item_name)=lower(i.name)
where inv.quantity > 0
on conflict (player_id,equipment_key) do nothing;

-- Four bait uses are tracked separately from the bucket item itself.
create table if not exists public.player_bait_buckets (
    player_id uuid primary key references public.players(id) on delete cascade,
    full_buckets integer not null default 0 check (full_buckets >= 0),
    current_bucket_uses integer not null default 0 check (current_bucket_uses between 0 and 4),
    updated_at timestamptz not null default now()
);

alter table public.player_bait_buckets enable row level security;
drop policy if exists "Players read own bait buckets" on public.player_bait_buckets;
create policy "Players read own bait buckets"
on public.player_bait_buckets for select to authenticated
using (auth.uid()=player_id);

-- ------------------------------------------------------------
-- Notification security and helper RPCs
-- ------------------------------------------------------------
revoke all on function public.create_player_notification(uuid,text,text,text,text,text,text) from authenticated;

create or replace function public.get_my_notifications(p_limit integer default 100)
returns jsonb
language plpgsql security definer set search_path=public
as $$
declare v_player uuid:=auth.uid();
begin
 if v_player is null then raise exception 'Sign in required.'; end if;
 return jsonb_build_object(
   'unread_count',(select count(*) from player_notifications where player_id=v_player and not is_read),
   'notifications',coalesce((select jsonb_agg(to_jsonb(n) order by n.created_at desc)
      from (select id,notification_type,title,message,icon,link,is_read,created_at,read_at
            from player_notifications where player_id=v_player
            order by created_at desc limit greatest(1,least(coalesce(p_limit,100),200))) n),'[]'::jsonb)
 );
end;$$;

create or replace function public.mark_notification_read(p_notification_id bigint)
returns void language plpgsql security definer set search_path=public as $$
begin
 update player_notifications set is_read=true,read_at=coalesce(read_at,now())
 where id=p_notification_id and player_id=auth.uid();
end;$$;

create or replace function public.mark_all_notifications_read()
returns void language plpgsql security definer set search_path=public as $$
begin
 update player_notifications set is_read=true,read_at=coalesce(read_at,now())
 where player_id=auth.uid() and not is_read;
end;$$;

create or replace function public.delete_read_notifications()
returns integer language plpgsql security definer set search_path=public as $$
declare v_count integer;
begin
 delete from player_notifications where player_id=auth.uid() and is_read;
 get diagnostics v_count=row_count;
 return v_count;
end;$$;

grant execute on function public.get_my_notifications(integer) to authenticated;
grant execute on function public.mark_notification_read(bigint) to authenticated;
grant execute on function public.mark_all_notifications_read() to authenticated;
grant execute on function public.delete_read_notifications() to authenticated;

-- Create level-up notifications whenever a profession level rises.
create or replace function public.notify_profession_level_up()
returns trigger language plpgsql security definer set search_path=public as $$
declare
 v_profession text;
 v_old integer;
 v_new integer;
 v_icon text;
begin
 foreach v_profession in array array['woodcutting','mining','foraging','fishing','hunting'] loop
   execute format('select coalesce(($1).%I,1),coalesce(($2).%I,1)',v_profession||'_level',v_profession||'_level')
   into v_old,v_new using old,new;
   if v_new > v_old then
     v_icon:=case v_profession when 'woodcutting' then '🪓' when 'mining' then '⛏️' when 'foraging' then '🌿' when 'fishing' then '🎣' else '🏹' end;
     insert into player_notifications(player_id,notification_type,title,message,icon,link,unique_key)
     values(new.player_id,'skill_level',initcap(v_profession)||' Level Up!',
       'Congratulations! You reached '||initcap(v_profession)||' Level '||v_new||'.',v_icon,
       'gathering.html?profession='||v_profession,
       'skill-level-'||v_profession||'-'||v_new)
     on conflict(player_id,unique_key) do nothing;
   end if;
 end loop;
 return new;
end;$$;

drop trigger if exists skills_profession_level_notification on public.skills;
create trigger skills_profession_level_notification
after update of woodcutting_level,mining_level,foraging_level,fishing_level,hunting_level
on public.skills for each row execute function public.notify_profession_level_up();

-- Job Point shop purchases of named profession tools become permanent unlocks.
create or replace function public.buy_profession_shop_item(target_shop_item_id bigint)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
 v_player uuid:=auth.uid(); v_shop record; v_points integer; v_completed integer; v_equipment record;
begin
 if v_player is null then raise exception 'Sign in required.'; end if;
 select s.*,i.name item_name,n.name npc_name into v_shop
 from profession_shop_items s join items i on i.id=s.item_id join job_npcs n on n.id=s.npc_id
 where s.id=target_shop_item_id and s.is_active;
 if not found then raise exception 'That shop item is unavailable.'; end if;
 select job_points,jobs_completed into v_points,v_completed from profession_progress
 where player_id=v_player and npc_id=v_shop.npc_id for update;
 if coalesce(v_completed,0)<v_shop.minimum_jobs_completed then raise exception 'Complete more jobs first.'; end if;
 if coalesce(v_points,0)<v_shop.job_point_cost then raise exception 'You do not have enough Job Points.'; end if;
 update profession_progress set job_points=job_points-v_shop.job_point_cost,updated_at=now()
 where player_id=v_player and npc_id=v_shop.npc_id;
 select * into v_equipment from profession_equipment_definitions
 where lower(item_name)=lower(v_shop.item_name) and is_active;
 if found then
   insert into player_profession_equipment(player_id,equipment_key,current_durability)
   values(v_player,v_equipment.equipment_key,v_equipment.maximum_durability)
   on conflict(player_id,equipment_key) do nothing;
   insert into player_notifications(player_id,notification_type,title,message,icon,link,unique_key)
   values(v_player,'equipment','Equipment Unlocked',
     'You permanently unlocked '||v_shop.item_name||'. It will never be lost, but it must be repaired when damaged.',
     v_equipment.icon,'gathering.html?profession='||v_equipment.profession,
     'equipment-unlocked-'||v_equipment.equipment_key)
   on conflict(player_id,unique_key) do nothing;
 else
   insert into inventory(player_id,item_id,quantity) values(v_player,v_shop.item_id,1)
   on conflict(player_id,item_id) do update set quantity=inventory.quantity+1;
 end if;
 return jsonb_build_object('item_name',v_shop.item_name,'npc_name',v_shop.npc_name,
   'remaining_points',v_points-v_shop.job_point_cost,'permanent_equipment',found);
end;$$;

revoke all on function public.buy_profession_shop_item(bigint) from public,anon;
grant execute on function public.buy_profession_shop_item(bigint) to authenticated;

create or replace function public.get_my_profession_equipment()
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_player uuid:=auth.uid();
begin
 if v_player is null then raise exception 'Sign in required.'; end if;
 return jsonb_build_object(
  'equipment',coalesce((select jsonb_agg(jsonb_build_object(
    'equipment_key',d.equipment_key,'display_name',d.display_name,'profession',d.profession,
    'icon',d.icon,'description',d.description,'owned',(p.player_id is not null),
    'current_durability',coalesce(p.current_durability,0),'maximum_durability',d.maximum_durability
  ) order by d.profession,d.sort_order)
  from profession_equipment_definitions d left join player_profession_equipment p
   on p.player_id=v_player and p.equipment_key=d.equipment_key where d.is_active),'[]'::jsonb),
  'bait',coalesce((select jsonb_build_object('full_buckets',full_buckets,'current_bucket_uses',current_bucket_uses)
    from player_bait_buckets where player_id=v_player),jsonb_build_object('full_buckets',0,'current_bucket_uses',0))
 );
end;$$;

grant execute on function public.get_my_profession_equipment() to authenticated;

commit;
