-- Midgard Legacy: Wagon Builder shop
-- Adds wheels and wagon components in several sizes.
begin;

insert into public.items(name,description,type,weight_kg)
select x.name,x.description,'component',x.weight_kg
from (values
    ('Small Wheel','A small wooden wheel for handcarts.',8.000::numeric),
    ('Medium Wheel','A reinforced wheel for a horse cart.',16.000::numeric),
    ('Large Wheel','A heavy wheel for a merchant wagon.',28.000::numeric),
    ('Small Wooden Axle','A compact axle for a handcart.',10.000::numeric),
    ('Medium Wooden Axle','A sturdy axle for a horse cart.',22.000::numeric),
    ('Large Wooden Axle','A thick axle for a merchant wagon.',38.000::numeric),
    ('Iron Axle Fittings','Iron collars and pins that strengthen a wagon axle.',3.000::numeric),
    ('Wagon Board Set','Cut boards used to build a wagon bed and side rails.',25.000::numeric),
    ('Leather Horse Harness','A fitted leather harness for pulling a cart.',8.000::numeric)
) as x(name,description,weight_kg)
where not exists(select 1 from public.items i where lower(i.name)=lower(x.name));

create table if not exists public.wagon_builder_products(
    product_code text primary key,
    product_name text not null,
    item_id bigint not null references public.items(id),
    category text not null check(category in ('wheels','frame','horse')),
    tier_name text not null,
    description text not null,
    price_silver bigint not null check(price_silver>0),
    sort_order integer not null default 0,
    is_active boolean not null default true
);

insert into public.wagon_builder_products(product_code,product_name,item_id,category,tier_name,description,price_silver,sort_order)
select x.product_code,x.product_name,i.id,x.category,x.tier_name,x.description,x.price_silver,x.sort_order
from (values
    ('small_wheel','Small Wheel','Small Wheel','wheels','Handcart Part','A small wooden wheel used for the abandoned handcart and light handcarts.',150::bigint,10),
    ('medium_wheel','Medium Wheel','Medium Wheel','wheels','Horse Cart Part','A reinforced wheel designed for the weight of a horse cart.',400::bigint,20),
    ('large_wheel','Large Wheel','Large Wheel','wheels','Merchant Wagon Part','A broad heavy wheel made for long journeys and merchant cargo.',900::bigint,30),
    ('small_axle','Small Wooden Axle','Small Wooden Axle','frame','Handcart Part','A compact wooden axle suitable for a two-wheel handcart.',250::bigint,40),
    ('medium_axle','Medium Wooden Axle','Medium Wooden Axle','frame','Horse Cart Part','A sturdy axle able to support a horse-drawn cart.',650::bigint,50),
    ('large_axle','Large Wooden Axle','Large Wooden Axle','frame','Merchant Wagon Part','A thick axle built for a fully loaded merchant wagon.',1200::bigint,60),
    ('iron_axle_fittings','Iron Axle Fittings','Iron Axle Fittings','frame','Reinforcement','Iron collars, pins and brackets used on stronger carts.',500::bigint,70),
    ('wagon_board_set','Wagon Board Set','Wagon Board Set','frame','Wagon Body','Prepared boards for the bed, sides and rails of a wagon.',750::bigint,80),
    ('leather_harness','Leather Horse Harness','Leather Horse Harness','horse','Horse Gear','A leather harness required before a horse can safely pull a cart.',1000::bigint,90)
) as x(product_code,product_name,item_name,category,tier_name,description,price_silver,sort_order)
join public.items i on lower(i.name)=lower(x.item_name)
on conflict(product_code) do update set
    product_name=excluded.product_name,
    item_id=excluded.item_id,
    category=excluded.category,
    tier_name=excluded.tier_name,
    description=excluded.description,
    price_silver=excluded.price_silver,
    sort_order=excluded.sort_order,
    is_active=true;

alter table public.wagon_builder_products enable row level security;
drop policy if exists wagon_builder_products_read on public.wagon_builder_products;
create policy wagon_builder_products_read on public.wagon_builder_products for select to authenticated using(is_active=true);

grant select on public.wagon_builder_products to authenticated;

create or replace function public.buy_wagon_builder_part(p_product_code text,p_quantity bigint default 1)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
    v_player uuid:=auth.uid();
    v_product public.wagon_builder_products%rowtype;
    v_silver bigint;
    v_total bigint;
    v_item_name text;
begin
    if v_player is null then raise exception 'Not signed in.'; end if;
    if p_quantity is null or p_quantity<1 or p_quantity>99 then raise exception 'Quantity must be between 1 and 99.'; end if;

    select * into v_product
    from wagon_builder_products
    where product_code=p_product_code and is_active=true;
    if v_product.product_code is null then raise exception 'That wagon part is not for sale.'; end if;

    v_total:=v_product.price_silver*p_quantity;
    select silver into v_silver from players where id=v_player for update;
    if coalesce(v_silver,0)<v_total then raise exception 'You need % Silver but only have %.',v_total,coalesce(v_silver,0); end if;

    update players set silver=silver-v_total where id=v_player;
    insert into player_storage(player_id,item_id,quantity)
    values(v_player,v_product.item_id,p_quantity)
    on conflict(player_id,item_id) do update set quantity=player_storage.quantity+excluded.quantity;

    select name into v_item_name from items where id=v_product.item_id;
    return jsonb_build_object(
        'product_code',v_product.product_code,
        'item_name',v_item_name,
        'quantity',p_quantity,
        'total_price',v_total,
        'remaining_silver',v_silver-v_total
    );
end;
$$;

grant execute on function public.buy_wagon_builder_part(text,bigint) to authenticated;

commit;
