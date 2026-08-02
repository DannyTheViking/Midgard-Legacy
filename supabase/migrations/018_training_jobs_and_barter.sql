-- Midgard Legacy: combat stats, Training Grounds, profession Job Points,
-- profession shops, item values and NPC barter.
begin;

-- ============================================================
-- COMBAT STATS
-- ============================================================
alter table public.players
    add column if not exists strength bigint not null default 100,
    add column if not exists defence bigint not null default 100,
    add column if not exists agility bigint not null default 100,
    add column if not exists accuracy bigint not null default 100;

update public.players
set strength = greatest(coalesce(strength, 100), 100),
    defence = greatest(coalesce(defence, 100), 100),
    agility = greatest(coalesce(agility, 100), 100),
    accuracy = greatest(coalesce(accuracy, 100), 100);

alter table public.players drop constraint if exists players_strength_check;
alter table public.players drop constraint if exists players_defence_check;
alter table public.players drop constraint if exists players_agility_check;
alter table public.players drop constraint if exists players_accuracy_check;
alter table public.players add constraint players_strength_check check (strength >= 0);
alter table public.players add constraint players_defence_check check (defence >= 0);
alter table public.players add constraint players_agility_check check (agility >= 0);
alter table public.players add constraint players_accuracy_check check (accuracy >= 0);

create table if not exists public.training_sessions (
    id bigint generated always as identity primary key,
    player_id uuid not null references public.players(id) on delete cascade,
    stat_name text not null check (stat_name in ('strength','defence','agility','accuracy')),
    stat_before bigint not null,
    stat_gain bigint not null check (stat_gain > 0),
    stat_after bigint not null,
    silver_cost integer not null default 250,
    created_at timestamptz not null default now()
);
alter table public.training_sessions enable row level security;
drop policy if exists "Players read own training sessions" on public.training_sessions;
create policy "Players read own training sessions" on public.training_sessions
for select to authenticated using (player_id = auth.uid());

create or replace function public.train_battle_stat(target_stat text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_player uuid := auth.uid();
    v_before bigint;
    v_gain bigint;
    v_after bigint;
    v_roll numeric;
begin
    if v_player is null then raise exception 'You must be logged in.'; end if;
    target_stat := lower(trim(target_stat));
    if target_stat not in ('strength','defence','agility','accuracy') then
        raise exception 'Choose Strength, Defence, Agility or Accuracy.';
    end if;

    perform 1 from public.players where id = v_player and coalesce(silver,0) >= 250 for update;
    if not found then raise exception 'You need 250 Silver Pieces to train.'; end if;

    execute format('select %I from public.players where id = $1', target_stat)
    into v_before using v_player;

    -- Percentage growth inspired by exponential browser-game training.
    -- Each session gives 0.80% to 1.20% of the current stat, minimum 1.
    v_roll := 0.008 + (random() * 0.004);
    v_gain := greatest(1, floor(v_before * v_roll)::bigint);
    v_after := v_before + v_gain;

    execute format(
        'update public.players set silver = silver - 250, %I = %I + $1 where id = $2',
        target_stat, target_stat
    ) using v_gain, v_player;

    insert into public.training_sessions(player_id, stat_name, stat_before, stat_gain, stat_after, silver_cost)
    values(v_player, target_stat, v_before, v_gain, v_after, 250);

    return jsonb_build_object(
        'stat_name', target_stat,
        'stat_before', v_before,
        'stat_gain', v_gain,
        'stat_after', v_after,
        'silver_cost', 250
    );
end;
$$;
grant execute on function public.train_battle_stat(text) to authenticated;

-- ============================================================
-- ITEM VALUES AND NPC BARTER
-- ============================================================
alter table public.items add column if not exists base_value numeric(14,2) not null default 1;
alter table public.items drop constraint if exists items_base_value_check;
alter table public.items add constraint items_base_value_check check (base_value >= 0);

-- First-pass values. These are balancing guides, not currency.
update public.items set base_value = case
    when lower(name) like '%silver piece%' then 100
    when lower(name) like '%silver ingot%' then 2500
    when lower(name) like '%silver ore%' then 500
    when lower(name) = 'egg' or lower(name) = 'eggs' then 2
    when lower(name) like '%birch log%' then 10
    when lower(name) like '%oak log%' then 16
    when lower(name) like '%log%' then 10
    when lower(name) like '%plank%' then 15
    when lower(name) like '%beam%' then 45
    when lower(name) like '%iron ore%' then 18
    when lower(name) like '%iron bar%' then 55
    when lower(name) like '%nail%' then 3
    when lower(name) like '%honey%' then 12
    when lower(name) like '%meat%' or lower(name) like '%venison%' then 8
    when lower(name) like '%fish%' then 7
    when lower(name) like '%herb%' then 4
    else greatest(base_value,1)
end;

create table if not exists public.npc_barter_offers (
    id bigint generated always as identity primary key,
    code text not null unique,
    npc_name text not null,
    npc_icon text not null default '🧑',
    title text not null,
    description text,
    required_item_id bigint not null references public.items(id),
    required_quantity integer not null check (required_quantity > 0),
    daily_limit integer not null default 1 check (daily_limit > 0),
    is_active boolean not null default true,
    sort_order integer not null default 0
);

create table if not exists public.npc_barter_options (
    id bigint generated always as identity primary key,
    offer_id bigint not null references public.npc_barter_offers(id) on delete cascade,
    reward_item_id bigint not null references public.items(id),
    reward_quantity integer not null check (reward_quantity > 0),
    sort_order integer not null default 0,
    unique(offer_id, reward_item_id)
);

create table if not exists public.player_npc_barter_log (
    id bigint generated always as identity primary key,
    player_id uuid not null references public.players(id) on delete cascade,
    offer_id bigint not null references public.npc_barter_offers(id),
    option_id bigint not null references public.npc_barter_options(id),
    completed_at timestamptz not null default now()
);

alter table public.npc_barter_offers enable row level security;
alter table public.npc_barter_options enable row level security;
alter table public.player_npc_barter_log enable row level security;
drop policy if exists "Barter offers readable" on public.npc_barter_offers;
create policy "Barter offers readable" on public.npc_barter_offers for select to authenticated using (is_active);
drop policy if exists "Barter options readable" on public.npc_barter_options;
create policy "Barter options readable" on public.npc_barter_options for select to authenticated using (true);
drop policy if exists "Players read own barter log" on public.player_npc_barter_log;
create policy "Players read own barter log" on public.player_npc_barter_log for select to authenticated using (player_id=auth.uid());

create or replace function public.player_item_quantity(p_player uuid, p_item bigint)
returns bigint language sql stable security definer set search_path=public as $$
    select coalesce((select quantity from inventory where player_id=p_player and item_id=p_item),0)
         + coalesce((select sum(ci.quantity) from player_carts pc join cart_items ci on ci.cart_id=pc.id
                     where pc.player_id=p_player and pc.is_active=true and ci.item_id=p_item),0);
$$;

create or replace function public.consume_player_item(p_player uuid, p_item bigint, p_quantity bigint)
returns void language plpgsql security definer set search_path=public as $$
declare v_need bigint := p_quantity; v_take bigint; v_cart_id bigint;
begin
    if public.player_item_quantity(p_player,p_item) < p_quantity then raise exception 'Not enough items.'; end if;
    select least(v_need,coalesce(quantity,0)) into v_take from inventory where player_id=p_player and item_id=p_item for update;
    v_take := coalesce(v_take,0);
    if v_take > 0 then
      update inventory set quantity=quantity-v_take where player_id=p_player and item_id=p_item;
      delete from inventory where player_id=p_player and item_id=p_item and quantity<=0;
      v_need := v_need-v_take;
    end if;
    if v_need > 0 then
      select id into v_cart_id from player_carts where player_id=p_player and is_active=true limit 1;
      update cart_items set quantity=quantity-v_need where cart_id=v_cart_id and item_id=p_item;
      delete from cart_items where cart_id=v_cart_id and item_id=p_item and quantity<=0;
    end if;
end;$$;

create or replace function public.complete_npc_barter(target_option_id bigint)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
 v_player uuid:=auth.uid(); v_row record; v_count integer; v_required_name text; v_reward_name text;
begin
 if v_player is null then raise exception 'You must be logged in.'; end if;
 select o.*, b.required_item_id,b.required_quantity,b.daily_limit,b.id offer_id,b.title,
        ri.name reward_name, qi.name required_name
 into v_row
 from npc_barter_options o join npc_barter_offers b on b.id=o.offer_id and b.is_active
 join items ri on ri.id=o.reward_item_id join items qi on qi.id=b.required_item_id
 where o.id=target_option_id;
 if not found then raise exception 'That barter option is unavailable.'; end if;
 select count(*) into v_count from player_npc_barter_log
 where player_id=v_player and offer_id=v_row.offer_id and completed_at>=date_trunc('day',now());
 if v_count>=v_row.daily_limit then raise exception 'You have used this offer for today.'; end if;
 perform consume_player_item(v_player,v_row.required_item_id,v_row.required_quantity);
 insert into inventory(player_id,item_id,quantity) values(v_player,v_row.reward_item_id,v_row.reward_quantity)
 on conflict(player_id,item_id) do update set quantity=inventory.quantity+excluded.quantity;
 insert into player_npc_barter_log(player_id,offer_id,option_id) values(v_player,v_row.offer_id,target_option_id);
 return jsonb_build_object('required_name',v_row.required_name,'required_quantity',v_row.required_quantity,
   'reward_name',v_row.reward_name,'reward_quantity',v_row.reward_quantity,'title',v_row.title);
end;$$;
grant execute on function public.complete_npc_barter(bigint) to authenticated;

-- Seed the example only when all named items exist.
do $$
declare v_eggs bigint; v_birch bigint; v_oak bigint; v_offer bigint;
begin
 select id into v_eggs from items where lower(name) in ('egg','eggs') limit 1;
 select id into v_birch from items where lower(name)='birch log' limit 1;
 select id into v_oak from items where lower(name)='oak log' limit 1;
 if v_eggs is not null and v_birch is not null then
  insert into npc_barter_offers(code,npc_name,npc_icon,title,description,required_item_id,required_quantity,daily_limit,sort_order)
  values('farmer_eggs_100','Village Farmer','🧑‍🌾','The Farmer Needs Eggs','Bring 100 Eggs and choose the resource you want in return.',v_eggs,100,1,10)
  on conflict(code) do update set required_item_id=excluded.required_item_id,required_quantity=excluded.required_quantity,
    description=excluded.description,is_active=true returning id into v_offer;
  insert into npc_barter_options(offer_id,reward_item_id,reward_quantity,sort_order)
  values(v_offer,v_birch,20,10) on conflict(offer_id,reward_item_id) do update set reward_quantity=excluded.reward_quantity;
  if v_oak is not null then
   insert into npc_barter_options(offer_id,reward_item_id,reward_quantity,sort_order)
   values(v_offer,v_oak,12,20) on conflict(offer_id,reward_item_id) do update set reward_quantity=excluded.reward_quantity;
  end if;
 end if;
end$$;

-- ============================================================
-- PROFESSION JOB POINTS AND JOB SHOPS
-- ============================================================
alter table public.job_templates add column if not exists reward_job_points integer not null default 1;
alter table public.profession_progress add column if not exists job_points integer not null default 0;

create table if not exists public.profession_shop_items (
    id bigint generated always as identity primary key,
    npc_id bigint not null references public.job_npcs(id) on delete cascade,
    item_id bigint not null references public.items(id),
    job_point_cost integer not null check(job_point_cost>0),
    minimum_jobs_completed integer not null default 0,
    is_active boolean not null default true,
    sort_order integer not null default 0,
    unique(npc_id,item_id)
);
alter table public.profession_shop_items enable row level security;
drop policy if exists "Profession shops readable" on public.profession_shop_items;
create policy "Profession shops readable" on public.profession_shop_items for select to authenticated using(is_active);

create or replace function public.buy_profession_shop_item(target_shop_item_id bigint)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_player uuid:=auth.uid(); v_shop record; v_points integer; v_completed integer;
begin
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
 insert into inventory(player_id,item_id,quantity) values(v_player,v_shop.item_id,1)
 on conflict(player_id,item_id) do update set quantity=inventory.quantity+1;
 return jsonb_build_object('item_name',v_shop.item_name,'npc_name',v_shop.npc_name,'remaining_points',v_points-v_shop.job_point_cost);
end;$$;
grant execute on function public.buy_profession_shop_item(bigint) to authenticated;

-- Replace job hand-in so requirements can be supplied from Backpack or active Cart,
-- and Job Points are awarded securely.
create or replace function public.hand_in_village_job(target_job_id bigint)
returns jsonb language plpgsql security definer set search_path=public as $$
declare job_record record; requirement record; item_record record; total_completed integer; new_training integer;
 training_message text:=null; v_job_points integer;
begin
 if auth.uid() is null then raise exception 'You must be logged in.'; end if;
 select pj.id,pj.npc_id,jt.title,jt.requirements,jt.reward_silver,jt.reward_reputation,
        jt.reward_mission_points,jt.reward_job_points,n.code,n.name
 into job_record from player_jobs pj join job_templates jt on jt.id=pj.template_id
 join job_npcs n on n.id=pj.npc_id
 where pj.id=target_job_id and pj.player_id=auth.uid() and pj.status='active' for update of pj;
 if not found then raise exception 'Active job not found.'; end if;
 for requirement in select key,value::text::integer amount from jsonb_each(job_record.requirements) loop
  select id,name into item_record from items where lower(name)=lower(requirement.key) limit 1;
  if not found then raise exception 'Item "%" is missing from the items table.',requirement.key; end if;
  if player_item_quantity(auth.uid(),item_record.id)<requirement.amount then
   raise exception 'You still need % x %.',requirement.amount-player_item_quantity(auth.uid(),item_record.id),requirement.key;
  end if;
 end loop;
 for requirement in select key,value::text::integer amount from jsonb_each(job_record.requirements) loop
  select id into item_record from items where lower(name)=lower(requirement.key) limit 1;
  perform consume_player_item(auth.uid(),item_record.id,requirement.amount);
 end loop;
 update players set silver=coalesce(silver,0)+coalesce(job_record.reward_silver,0),
  reputation=coalesce(reputation,0)+coalesce(job_record.reward_reputation,0),
  mission_points=coalesce(mission_points,0)+coalesce(job_record.reward_mission_points,0) where id=auth.uid();
 update player_jobs set status='completed',completed_at=now() where id=target_job_id;
 insert into profession_progress(player_id,npc_id,jobs_completed,training_level,job_points)
 values(auth.uid(),job_record.npc_id,1,0,greatest(1,coalesce(job_record.reward_job_points,1)))
 on conflict(player_id,npc_id) do update set jobs_completed=profession_progress.jobs_completed+1,
  job_points=profession_progress.job_points+greatest(1,coalesce(job_record.reward_job_points,1)),updated_at=now()
 returning jobs_completed,job_points into total_completed,v_job_points;
 new_training:=floor(total_completed/10);
 update profession_progress set training_level=new_training,updated_at=now()
 where player_id=auth.uid() and npc_id=job_record.npc_id;
 if total_completed%10=0 then training_message:=job_record.name||' trains you. Your '||job_record.code||' training is now level '||new_training||'.'; end if;
 return jsonb_build_object('title',job_record.title,'jobs_completed',total_completed,'training_level',new_training,
  'reward_silver',coalesce(job_record.reward_silver,0),'reward_reputation',coalesce(job_record.reward_reputation,0),
  'reward_mission_points',coalesce(job_record.reward_mission_points,0),'reward_job_points',greatest(1,coalesce(job_record.reward_job_points,1)),
  'job_point_balance',v_job_points,'training_message',training_message);
end;$$;
grant execute on function public.hand_in_village_job(bigint) to authenticated;

-- Silver remains rare: ordinary village jobs now primarily pay Job Points.
update public.job_templates set reward_silver=0, reward_job_points=greatest(1,reward_job_points);

commit;
