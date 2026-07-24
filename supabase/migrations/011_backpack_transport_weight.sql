-- Midgard Legacy: Backpack, weighted items, Storage Yard and Wagon Shed
begin;

alter table public.items add column if not exists weight_kg numeric(10,3) not null default 0.100;
alter table public.items drop constraint if exists items_weight_kg_check;
alter table public.items add constraint items_weight_kg_check check (weight_kg > 0);
alter table public.players add column if not exists backpack_capacity_kg numeric(10,2) not null default 25;
alter table public.player_carts add column if not exists capacity_kg numeric(10,2);
alter table public.player_carts add column if not exists transport_type text not null default 'handcart';
update public.player_carts set capacity_kg=coalesce(capacity_kg,capacity,100);

-- Sensible first-pass weights. Tune these later from the Supabase table editor.
update public.items set weight_kg=case
 when lower(name) like '%log%' then 5.000
 when lower(name) like '%beam%' then 4.000
 when lower(name) like '%plank%' then 1.500
 when lower(name)='stick' or lower(name) like '%stick%' then 0.100
 when lower(name) like '%rock%' or lower(name) like '%stone%' then 1.000
 when lower(name) like '%ore%' or lower(name) like '%bog iron%' then 0.750
 when lower(name) like '%iron bar%' then 1.000
 when lower(name) like '%nail%' then 0.050
 when lower(name) like '%hoop%' then 0.500
 when lower(name) like '%empty barrel%' then 12.000
 when lower(name) like '%barrel%' then 15.000
 when lower(name) like '%bucket%' then 3.000
 when lower(name) like '%axe%' or lower(name) like '%pickaxe%' then 3.500
 when lower(name) like '%beehive%' then 15.000
 when lower(name) like '%queen bee%' then 0.100
 else weight_kg end;

insert into public.items(name,description,type,weight_kg)
select 'Small Wheel','A small wooden wheel used to repair a handcart.','component',8.000
where not exists(select 1 from public.items where lower(name)='small wheel');

create table if not exists public.player_wagon_sheds(
 player_id uuid primary key references public.players(id) on delete cascade,
 handcart_repaired boolean not null default false,
 repaired_at timestamptz
);
insert into public.player_wagon_sheds(player_id) select id from public.players on conflict(player_id) do nothing;

-- Existing inventory is moved to permanent Storage Yard once. New players start empty.
insert into public.player_storage(player_id,item_id,quantity)
select i.player_id,i.item_id,sum(i.quantity)
from public.inventory i where i.quantity>0
group by i.player_id,i.item_id
on conflict(player_id,item_id) do update set quantity=public.player_storage.quantity+excluded.quantity;
delete from public.inventory;

create or replace function public.backpack_weight(p_player_id uuid)
returns numeric language sql stable security definer set search_path=public as $$
 select coalesce(sum(i.quantity*it.weight_kg),0)
 from inventory i join items it on it.id=i.item_id where i.player_id=p_player_id;
$$;

create or replace function public.enforce_backpack_weight()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_capacity numeric;v_weight numeric;
begin
 select backpack_capacity_kg into v_capacity from players where id=new.player_id;
 select coalesce(sum((case when i.item_id=new.item_id then 0 else i.quantity end)*it.weight_kg),0)
 into v_weight from inventory i join items it on it.id=i.item_id where i.player_id=new.player_id;
 select v_weight + new.quantity*weight_kg into v_weight from items where id=new.item_id;
 if v_weight>coalesce(v_capacity,25)+0.000001 then raise exception 'Your Backpack is too heavy: %kg / %kg.',round(v_weight,2),coalesce(v_capacity,25); end if;
 return new;
end;$$;
drop trigger if exists inventory_weight_limit on public.inventory;
create trigger inventory_weight_limit before insert or update of quantity,item_id on public.inventory for each row execute function public.enforce_backpack_weight();

create or replace function public.repair_abandoned_handcart()
returns void language plpgsql security definer set search_path=public as $$
declare v_player uuid:=auth.uid();v_plank bigint;v_wheel bigint;v_plank_id bigint;v_wheel_id bigint;
begin
 if v_player is null then raise exception 'Not signed in.';end if;
 insert into player_wagon_sheds(player_id) values(v_player) on conflict do nothing;
 if (select handcart_repaired from player_wagon_sheds where player_id=v_player) then raise exception 'Your handcart is already repaired.';end if;
 select id into v_plank_id from items where lower(name)='birch plank' limit 1;
 select id into v_wheel_id from items where lower(name)='small wheel' limit 1;
 select coalesce(quantity,0) into v_plank from player_storage where player_id=v_player and item_id=v_plank_id;
 select coalesce(quantity,0) into v_wheel from player_storage where player_id=v_player and item_id=v_wheel_id;
 if coalesce(v_plank,0)<3 or coalesce(v_wheel,0)<1 then raise exception 'You need 3 Birch Planks and 1 Small Wheel in Storage.';end if;
 update player_storage set quantity=quantity-3 where player_id=v_player and item_id=v_plank_id;
 update player_storage set quantity=quantity-1 where player_id=v_player and item_id=v_wheel_id;
 delete from player_storage where player_id=v_player and quantity<=0;
 update player_carts set is_active=false where player_id=v_player;
 insert into player_carts(player_id,name,capacity,capacity_kg,is_active,transport_type)
 values(v_player,'Wooden Handcart',100,100,true,'handcart');
 update player_wagon_sheds set handcart_repaired=true,repaired_at=now() where player_id=v_player;
end;$$;

create or replace function public.load_storage_item(p_item_id bigint,p_quantity bigint,p_destination text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_player uuid:=auth.uid();v_stored bigint;v_weight numeric;v_capacity numeric;v_used numeric;v_cart player_carts%rowtype;
begin
 if p_quantity<1 then raise exception 'Quantity must be at least 1.';end if;
 select quantity into v_stored from player_storage where player_id=v_player and item_id=p_item_id for update;
 if coalesce(v_stored,0)<p_quantity then raise exception 'Not enough stored.';end if;
 select weight_kg into v_weight from items where id=p_item_id;
 if p_destination='backpack' then
  select backpack_capacity_kg into v_capacity from players where id=v_player;
  v_used:=backpack_weight(v_player);
  if v_used+(v_weight*p_quantity)>v_capacity then raise exception 'That would make your Backpack too heavy.';end if;
  insert into inventory(player_id,item_id,quantity) values(v_player,p_item_id,p_quantity) on conflict(player_id,item_id) do update set quantity=inventory.quantity+excluded.quantity;
 elsif p_destination='cart' then
  select * into v_cart from player_carts where player_id=v_player and is_active=true limit 1;
  if v_cart.id is null then raise exception 'You have no active transport.';end if;
  select coalesce(sum(ci.quantity*i.weight_kg),0) into v_used from cart_items ci join items i on i.id=ci.item_id where ci.cart_id=v_cart.id;
  if v_used+(v_weight*p_quantity)>coalesce(v_cart.capacity_kg,v_cart.capacity) then raise exception 'That would make your transport too heavy.';end if;
  insert into cart_items(cart_id,item_id,quantity) values(v_cart.id,p_item_id,p_quantity) on conflict(cart_id,item_id) do update set quantity=cart_items.quantity+excluded.quantity;
 else raise exception 'Destination must be backpack or cart.';end if;
 update player_storage set quantity=quantity-p_quantity where player_id=v_player and item_id=p_item_id;
 delete from player_storage where player_id=v_player and item_id=p_item_id and quantity<=0;
 return jsonb_build_object('item_id',p_item_id,'quantity',p_quantity,'destination',p_destination);
end;$$;

commit;
