-- Midgard Legacy: Viking Missions + global player directory/search
-- 10 contacts x 100 sequential main missions, bonus mission every 10, 5 main missions/day.

begin;

create table if not exists public.viking_mission_contacts (
    id bigserial primary key,
    contact_no integer not null unique check (contact_no between 1 and 10),
    name text not null,
    role_title text not null,
    personality text not null,
    intro_text text not null,
    base_silver integer not null check (base_silver > 0),
    icon text not null default '🛡️',
    is_active boolean not null default true
);

create table if not exists public.viking_mission_catalog (
    id bigserial primary key,
    contact_id bigint not null references public.viking_mission_contacts(id) on delete cascade,
    mission_no integer not null check (mission_no between 1 and 100),
    title text not null,
    story_text text not null,
    request_item_name text not null,
    request_quantity integer not null check (request_quantity > 0),
    reward_silver integer not null check (reward_silver >= 0),
    reward_item_name text,
    reward_item_quantity integer not null default 0 check (reward_item_quantity >= 0),
    unique(contact_id, mission_no)
);

create table if not exists public.viking_mission_bonus_catalog (
    id bigserial primary key,
    contact_id bigint not null references public.viking_mission_contacts(id) on delete cascade,
    after_mission_no integer not null check (after_mission_no between 10 and 100 and after_mission_no % 10 = 0),
    title text not null,
    story_text text not null,
    request_item_name text not null,
    request_quantity integer not null check (request_quantity > 0),
    reward_silver integer not null check (reward_silver >= 0),
    reward_item_name text,
    reward_item_quantity integer not null default 0 check (reward_item_quantity >= 0),
    unique(contact_id, after_mission_no)
);

create table if not exists public.player_viking_mission_progress (
    player_id uuid not null references public.players(id) on delete cascade,
    contact_id bigint not null references public.viking_mission_contacts(id) on delete cascade,
    next_mission_no integer not null default 1 check (next_mission_no between 1 and 101),
    main_completed integer not null default 0 check (main_completed between 0 and 100),
    updated_at timestamptz not null default now(),
    primary key(player_id, contact_id)
);

create table if not exists public.player_viking_mission_bonus (
    player_id uuid not null references public.players(id) on delete cascade,
    contact_id bigint not null references public.viking_mission_contacts(id) on delete cascade,
    after_mission_no integer not null,
    status text not null default 'available' check (status in ('available','completed')),
    cameo_player_id uuid references public.players(id) on delete set null,
    assigned_at timestamptz not null default now(),
    completed_at timestamptz,
    primary key(player_id, contact_id, after_mission_no)
);

create table if not exists public.player_viking_mission_daily (
    player_id uuid not null references public.players(id) on delete cascade,
    mission_date date not null default current_date,
    main_completed integer not null default 0 check (main_completed between 0 and 5),
    primary key(player_id, mission_date)
);

create table if not exists public.player_viking_mission_history (
    id bigserial primary key,
    player_id uuid not null references public.players(id) on delete cascade,
    contact_id bigint not null references public.viking_mission_contacts(id) on delete cascade,
    mission_no integer,
    bonus_after_mission_no integer,
    reward_silver integer not null default 0,
    reward_item_name text,
    reward_item_quantity integer not null default 0,
    completed_at timestamptz not null default now(),
    check ((mission_no is not null) <> (bonus_after_mission_no is not null))
);

alter table public.viking_mission_contacts enable row level security;
alter table public.viking_mission_catalog enable row level security;
alter table public.viking_mission_bonus_catalog enable row level security;
alter table public.player_viking_mission_progress enable row level security;
alter table public.player_viking_mission_bonus enable row level security;
alter table public.player_viking_mission_daily enable row level security;
alter table public.player_viking_mission_history enable row level security;

-- Catalogs are public to authenticated players; progress remains private.
drop policy if exists "mission contacts readable" on public.viking_mission_contacts;
create policy "mission contacts readable" on public.viking_mission_contacts for select to authenticated using (is_active=true);
drop policy if exists "mission catalog readable" on public.viking_mission_catalog;
create policy "mission catalog readable" on public.viking_mission_catalog for select to authenticated using (true);
drop policy if exists "mission bonus catalog readable" on public.viking_mission_bonus_catalog;
create policy "mission bonus catalog readable" on public.viking_mission_bonus_catalog for select to authenticated using (true);
drop policy if exists "own mission progress readable" on public.player_viking_mission_progress;
create policy "own mission progress readable" on public.player_viking_mission_progress for select to authenticated using (player_id=auth.uid());
drop policy if exists "own mission bonus readable" on public.player_viking_mission_bonus;
create policy "own mission bonus readable" on public.player_viking_mission_bonus for select to authenticated using (player_id=auth.uid());
drop policy if exists "own mission daily readable" on public.player_viking_mission_daily;
create policy "own mission daily readable" on public.player_viking_mission_daily for select to authenticated using (player_id=auth.uid());
drop policy if exists "own mission history readable" on public.player_viking_mission_history;
create policy "own mission history readable" on public.player_viking_mission_history for select to authenticated using (player_id=auth.uid());

insert into public.viking_mission_contacts(contact_no,name,role_title,personality,intro_text,base_silver,icon)
values
(1,'Sigrid','The Weaver','Warm-hearted, practical and blunt','Cold weather does not wait for anyone. Help me keep the village clothed and I will make sure your work is paid.',10,'🧶'),
(2,'Torsten','The Trader','Cheeky, sharp-eyed and always bargaining','Goods move, silver moves, favours move. Help me settle a few matters and there is coin in it for you.',20,'⚖️'),
(3,'Astrid','The Farmer','Hard-working and fiercely protective of her family','A farm never stops needing something. Lend a hand and you will eat better than most warriors.',30,'🌾'),
(4,'Knut','The Dockmaster','Loud, impatient and loyal to his crews','Ships do not load themselves. Bring what I ask for and keep the docks moving.',40,'⚓'),
(5,'Freydis','The Hunter','Quiet, dry-witted and demanding','The wild does not forgive waste. Prove you can bring back what is needed.',50,'🏹'),
(6,'Gunnar','The Smith','Gruff, proud and obsessed with quality','Bad metal makes dead warriors. Bring me proper supplies and I will pay proper silver.',60,'⚒️'),
(7,'Runa','The Wise Woman','Mysterious but surprisingly funny','People think I know everything. I do not. I simply know who to ask. Today, that is you.',70,'🌿'),
(8,'Hakon','The Steward','Organised, political and permanently busy','Keeping a settlement alive is mostly counting what everyone forgot to count. Help me fix that.',80,'📜'),
(9,'Ingrid','The Shipwright','Inventive, stubborn and fearless','A ship is a promise that wood makes to the sea. Bring me what I need to keep that promise.',90,'🛶'),
(10,'Eirik','The Jarl''s Hand','Calm, respected and trusted with serious matters','You have earned a reputation for getting things done. These requests come from people who cannot afford failure.',100,'🛡️')
on conflict(contact_no) do update set
name=excluded.name,role_title=excluded.role_title,personality=excluded.personality,intro_text=excluded.intro_text,base_silver=excluded.base_silver,icon=excluded.icon,is_active=true;

-- Generate 100 sequential missions for every contact. The wording rotates by story arc,
-- while quantities scale gradually so later contacts feel more demanding.
with contacts as (
    select id,contact_no,name,base_silver from public.viking_mission_contacts where is_active=true
), missions as (
    select c.*, gs as mission_no,
      ((gs-1)/10)+1 as arc_no,
      ((gs-1)%10)+1 as step_no
    from contacts c cross join generate_series(1,100) gs
), shaped as (
    select *,
      case ((mission_no + contact_no) % 10)
        when 0 then 'Wool'
        when 1 then 'Birch Log'
        when 2 then 'Stick'
        when 3 then 'Rock'
        when 4 then 'Feather'
        when 5 then 'Egg'
        when 6 then 'Bog Iron'
        when 7 then 'Iron Bar'
        when 8 then 'Nettle Cordage'
        else 'Arrow'
      end as request_item,
      case ((mission_no + contact_no) % 10)
        when 0 then 5 + arc_no*2 + contact_no
        when 1 then 8 + arc_no*3 + contact_no*2
        when 2 then 15 + arc_no*5 + contact_no*3
        when 3 then 8 + arc_no*3 + contact_no*2
        when 4 then 10 + arc_no*4 + contact_no*2
        when 5 then 4 + arc_no*2 + contact_no
        when 6 then 5 + arc_no*2 + contact_no
        when 7 then 2 + arc_no + contact_no
        when 8 then 3 + arc_no*2 + contact_no
        else 5 + arc_no*3 + contact_no*2
      end as request_qty,
      case ((mission_no + 3*contact_no) % 8)
        when 0 then 'Feather'
        when 1 then 'Egg'
        when 2 then 'Stick'
        when 3 then 'Rock'
        when 4 then 'Birch Log'
        when 5 then 'Bog Iron'
        when 6 then 'Nettle Cordage'
        else 'Arrow'
      end as extra_item
    from missions
)
insert into public.viking_mission_catalog(contact_id,mission_no,title,story_text,request_item_name,request_quantity,reward_silver,reward_item_name,reward_item_quantity)
select id,mission_no,
  case arc_no
    when 1 then 'A Small Favour'
    when 2 then 'Word Gets Around'
    when 3 then 'Winter Stores'
    when 4 then 'A Friend in Need'
    when 5 then 'No Questions Asked'
    when 6 then 'The Village Is Watching'
    when 7 then 'Harder Than It Sounds'
    when 8 then 'Trusted Work'
    when 9 then 'Serious Business'
    else 'One More Thing'
  end || ' #' || mission_no,
  case (mission_no % 6)
    when 0 then name || ' says, “I have a friend who needs this more than I do. I do not care whether you gather it, make it or buy it. Just get it here.”'
    when 1 then name || ' says, “I need a hand. There is no glory in it, but there is silver. Bring me what I asked for and we are square.”'
    when 2 then name || ' says, “Someone promised me these supplies and never showed. Their problem is now my problem, and my problem is now yours.”'
    when 3 then name || ' says, “The weather is turning. Get this sorted before everyone starts complaining to me at once.”'
    when 4 then name || ' says, “Do not overthink it. Gather it, trade for it, buy it from another Viking — I only care that you return with it.”'
    else name || ' says, “You have been reliable so far. Keep that up and I will keep paying.”'
  end,
  request_item, request_qty, base_silver,
  extra_item,
  greatest(1, least(100, 2 + arc_no + contact_no + (step_no % 4)))
from shaped
on conflict(contact_id,mission_no) do update set
 title=excluded.title,story_text=excluded.story_text,request_item_name=excluded.request_item_name,request_quantity=excluded.request_quantity,
 reward_silver=excluded.reward_silver,reward_item_name=excluded.reward_item_name,reward_item_quantity=excluded.reward_item_quantity;

-- Every tenth main mission unlocks an optional bonus. It does not count toward the daily five.
with contacts as (
  select id,contact_no,name,base_silver from public.viking_mission_contacts where is_active=true
), bonuses as (
  select c.*, gs as after_no, gs/10 as tier
  from contacts c cross join generate_series(10,100,10) gs
)
insert into public.viking_mission_bonus_catalog(contact_id,after_mission_no,title,story_text,request_item_name,request_quantity,reward_silver,reward_item_name,reward_item_quantity)
select id,after_no,
  'Bonus Favour #' || tier,
  name || ' lowers their voice. “Before you go, a friend of mine has a separate problem. Help them and keep the extra payment. This is between you and them.”',
  case (tier % 5) when 0 then 'Iron Bar' when 1 then 'Wool' when 2 then 'Feather' when 3 then 'Bog Iron' else 'Arrow' end,
  case (tier % 5) when 0 then 5+tier+contact_no when 1 then 10+tier*2+contact_no when 2 then 25+tier*5+contact_no*2 when 3 then 10+tier*2+contact_no else 15+tier*3+contact_no end,
  base_silver + 15,
  case (tier % 4) when 0 then 'Nettle Cordage' when 1 then 'Feather' when 2 then 'Egg' else 'Rock' end,
  10 + tier*5 + contact_no
from bonuses
on conflict(contact_id,after_mission_no) do update set
 title=excluded.title,story_text=excluded.story_text,request_item_name=excluded.request_item_name,request_quantity=excluded.request_quantity,
 reward_silver=excluded.reward_silver,reward_item_name=excluded.reward_item_name,reward_item_quantity=excluded.reward_item_quantity;

create or replace function public.viking_total_skill(p_player uuid)
returns integer language sql stable security definer set search_path=public,pg_temp as $$
  select 1
    + greatest(coalesce(s.woodcutting_level,1)-1,0)
    + greatest(coalesce(s.mining_level,1)-1,0)
    + greatest(coalesce(s.fishing_level,1)-1,0)
    + greatest(coalesce(s.hunting_level,1)-1,0)
    + greatest(coalesce(s.farming_level,1)-1,0)
    + greatest(coalesce(s.cooking_level,1)-1,0)
    + greatest(coalesce(s.brewing_level,1)-1,0)
    + greatest(coalesce(s.combat_level,1)-1,0)
  from public.skills s where s.player_id=p_player;
$$;

create or replace function public.viking_skill_rank(p_total integer)
returns text language sql immutable as $$
 select case
   when coalesce(p_total,1) >= 500 then 'Legend of Midgard'
   when coalesce(p_total,1) >= 350 then 'High Jarl'
   when coalesce(p_total,1) >= 250 then 'Jarl'
   when coalesce(p_total,1) >= 175 then 'Hersir'
   when coalesce(p_total,1) >= 120 then 'Thegn'
   when coalesce(p_total,1) >= 80 then 'Housecarl'
   when coalesce(p_total,1) >= 50 then 'Drengr'
   when coalesce(p_total,1) >= 25 then 'Raider'
   when coalesce(p_total,1) >= 10 then 'Warrior'
   else 'Novice'
 end;
$$;

create or replace function public.consume_named_shared_item(p_player uuid,p_name text,p_quantity bigint)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare
  v_remaining bigint:=greatest(0,p_quantity);
  r record;
begin
  if v_remaining=0 then return; end if;
  if public.tutorial_named_item_quantity(p_player,p_name) < v_remaining then
    raise exception 'You need % x %.',v_remaining,p_name;
  end if;

  for r in
    select inv.id,inv.quantity from public.inventory inv join public.items i on i.id=inv.item_id
    where inv.player_id=p_player and lower(i.name)=lower(p_name) and inv.quantity>0 order by inv.id for update of inv
  loop
    exit when v_remaining<=0;
    if r.quantity<=v_remaining then delete from public.inventory where id=r.id; v_remaining:=v_remaining-r.quantity;
    else update public.inventory set quantity=quantity-v_remaining where id=r.id; v_remaining:=0; end if;
  end loop;

  for r in
    select ci.id,ci.quantity from public.player_carts pc join public.cart_items ci on ci.cart_id=pc.id join public.items i on i.id=ci.item_id
    where pc.player_id=p_player and pc.is_active=true and lower(i.name)=lower(p_name) and ci.quantity>0 order by ci.id for update of ci
  loop
    exit when v_remaining<=0;
    if r.quantity<=v_remaining then delete from public.cart_items where id=r.id; v_remaining:=v_remaining-r.quantity;
    else update public.cart_items set quantity=quantity-v_remaining where id=r.id; v_remaining:=0; end if;
  end loop;

  for r in
    select ps.id,ps.quantity from public.player_storage ps join public.items i on i.id=ps.item_id
    where ps.player_id=p_player and lower(i.name)=lower(p_name) and ps.quantity>0 order by ps.id for update of ps
  loop
    exit when v_remaining<=0;
    if r.quantity<=v_remaining then delete from public.player_storage where id=r.id; v_remaining:=v_remaining-r.quantity;
    else update public.player_storage set quantity=quantity-v_remaining where id=r.id; v_remaining:=0; end if;
  end loop;
end;$$;

create or replace function public.grant_named_mission_reward(p_player uuid,p_name text,p_quantity bigint)
returns text language plpgsql security definer set search_path=public,pg_temp as $$
declare v_item bigint; v_destination text;
begin
  if p_name is null or coalesce(p_quantity,0)<=0 then return null; end if;
  select id into v_item from public.items where lower(name)=lower(p_name) order by id limit 1;
  if v_item is null then return null; end if;
  v_destination:=public.grant_gathered_item(p_player,v_item,p_quantity);
  return v_destination;
end;$$;

create or replace function public.get_my_viking_missions()
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  v_player uuid:=auth.uid();
  v_daily integer:=0;
  v_contacts jsonb;
begin
  if v_player is null then raise exception 'Sign in required.'; end if;
  insert into public.player_viking_mission_daily(player_id,mission_date,main_completed)
  values(v_player,current_date,0) on conflict do nothing;
  select main_completed into v_daily from public.player_viking_mission_daily where player_id=v_player and mission_date=current_date;

  -- Ensure progress row for every contact. Unlocking is calculated from the prior contact, not stored.
  insert into public.player_viking_mission_progress(player_id,contact_id)
  select v_player,id from public.viking_mission_contacts c where c.is_active=true
  on conflict do nothing;

  select coalesce(jsonb_agg(contact_payload order by contact_no),'[]'::jsonb) into v_contacts
  from (
    select c.contact_no,
      jsonb_build_object(
        'contact_no',c.contact_no,'name',c.name,'role_title',c.role_title,'personality',c.personality,'intro_text',c.intro_text,
        'base_silver',c.base_silver,'icon',c.icon,
        'unlocked', case when c.contact_no=1 then true else coalesce(prev.main_completed,0)>=100 end,
        'main_completed',coalesce(pr.main_completed,0),'next_mission_no',coalesce(pr.next_mission_no,1),
        'current_mission', case when coalesce(pr.next_mission_no,1)<=100 then (
          select jsonb_build_object('mission_no',m.mission_no,'title',m.title,'story_text',m.story_text,
            'request_item_name',m.request_item_name,'request_quantity',m.request_quantity,
            'owned_quantity',public.tutorial_named_item_quantity(v_player,m.request_item_name),
            'reward_silver',m.reward_silver,'reward_item_name',m.reward_item_name,'reward_item_quantity',m.reward_item_quantity)
          from public.viking_mission_catalog m where m.contact_id=c.id and m.mission_no=pr.next_mission_no
        ) else null end,
        'available_bonuses',coalesce((
          select jsonb_agg(jsonb_build_object('after_mission_no',b.after_mission_no,'title',bc.title,
            'story_text',case when cameo.username is not null then bc.story_text || ' Ask for ' || cameo.username || ' when you are ready.' else bc.story_text end,
            'cameo_username',cameo.username,'request_item_name',bc.request_item_name,'request_quantity',bc.request_quantity,
            'owned_quantity',public.tutorial_named_item_quantity(v_player,bc.request_item_name),
            'reward_silver',bc.reward_silver,'reward_item_name',bc.reward_item_name,'reward_item_quantity',bc.reward_item_quantity))
          from public.player_viking_mission_bonus b
          join public.viking_mission_bonus_catalog bc on bc.contact_id=b.contact_id and bc.after_mission_no=b.after_mission_no
          left join public.players cameo on cameo.id=b.cameo_player_id
          where b.player_id=v_player and b.contact_id=c.id and b.status='available'
        ),'[]'::jsonb)
      ) as contact_payload
    from public.viking_mission_contacts c
    join public.player_viking_mission_progress pr on pr.player_id=v_player and pr.contact_id=c.id
    left join public.viking_mission_contacts pc on pc.contact_no=c.contact_no-1
    left join public.player_viking_mission_progress prev on prev.player_id=v_player and prev.contact_id=pc.id
    where c.is_active=true
  ) q;

  return jsonb_build_object('daily_completed',v_daily,'daily_limit',5,'reset_at',(current_date+1)::timestamptz,'contacts',v_contacts);
end;$$;

create or replace function public.complete_viking_mission(p_contact_no integer)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  v_player uuid:=auth.uid(); v_contact public.viking_mission_contacts%rowtype; v_progress public.player_viking_mission_progress%rowtype;
  v_mission public.viking_mission_catalog%rowtype; v_daily integer; v_prev_completed integer:=100; v_cameo uuid; v_destination text;
begin
  if v_player is null then raise exception 'Sign in required.'; end if;
  select * into v_contact from public.viking_mission_contacts where contact_no=p_contact_no and is_active=true;
  if not found then raise exception 'Mission contact not found.'; end if;
  if p_contact_no>1 then
    select coalesce(pr.main_completed,0) into v_prev_completed from public.viking_mission_contacts c
    left join public.player_viking_mission_progress pr on pr.contact_id=c.id and pr.player_id=v_player
    where c.contact_no=p_contact_no-1;
    if coalesce(v_prev_completed,0)<100 then raise exception 'This contact is still locked.'; end if;
  end if;

  insert into public.player_viking_mission_progress(player_id,contact_id) values(v_player,v_contact.id) on conflict do nothing;
  select * into v_progress from public.player_viking_mission_progress where player_id=v_player and contact_id=v_contact.id for update;
  if v_progress.next_mission_no>100 then raise exception 'You have completed every mission for this contact.'; end if;
  select * into v_mission from public.viking_mission_catalog where contact_id=v_contact.id and mission_no=v_progress.next_mission_no;

  insert into public.player_viking_mission_daily(player_id,mission_date,main_completed) values(v_player,current_date,0) on conflict do nothing;
  select main_completed into v_daily from public.player_viking_mission_daily where player_id=v_player and mission_date=current_date for update;
  if v_daily>=5 then raise exception 'You have completed your five main missions for today. Come back after midnight.'; end if;

  perform public.consume_named_shared_item(v_player,v_mission.request_item_name,v_mission.request_quantity);
  update public.players set silver=coalesce(silver,0)+v_mission.reward_silver where id=v_player;
  v_destination:=public.grant_named_mission_reward(v_player,v_mission.reward_item_name,v_mission.reward_item_quantity);
  update public.player_viking_mission_progress set next_mission_no=next_mission_no+1,main_completed=main_completed+1,updated_at=now()
    where player_id=v_player and contact_id=v_contact.id;
  update public.player_viking_mission_daily set main_completed=main_completed+1 where player_id=v_player and mission_date=current_date;
  insert into public.player_viking_mission_history(player_id,contact_id,mission_no,reward_silver,reward_item_name,reward_item_quantity)
    values(v_player,v_contact.id,v_mission.mission_no,v_mission.reward_silver,v_mission.reward_item_name,v_mission.reward_item_quantity);

  if v_mission.mission_no % 10=0 then
    select p.id into v_cameo from public.players p
      where p.id<>v_player and p.last_online < now()-interval '30 days'
      order by random() limit 1;
    insert into public.player_viking_mission_bonus(player_id,contact_id,after_mission_no,cameo_player_id)
      values(v_player,v_contact.id,v_mission.mission_no,v_cameo)
      on conflict(player_id,contact_id,after_mission_no) do nothing;
  end if;

  return jsonb_build_object('completed',true,'mission_no',v_mission.mission_no,'reward_silver',v_mission.reward_silver,
    'reward_item_name',v_mission.reward_item_name,'reward_item_quantity',v_mission.reward_item_quantity,
    'reward_destination',v_destination,'daily_completed',v_daily+1,'bonus_unlocked',(v_mission.mission_no%10=0));
end;$$;

create or replace function public.complete_viking_bonus(p_contact_no integer,p_after_mission_no integer)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  v_player uuid:=auth.uid(); v_contact public.viking_mission_contacts%rowtype; v_bonus public.viking_mission_bonus_catalog%rowtype;
  v_assignment public.player_viking_mission_bonus%rowtype; v_destination text;
begin
  if v_player is null then raise exception 'Sign in required.'; end if;
  select * into v_contact from public.viking_mission_contacts where contact_no=p_contact_no and is_active=true;
  if not found then raise exception 'Mission contact not found.'; end if;
  select * into v_assignment from public.player_viking_mission_bonus where player_id=v_player and contact_id=v_contact.id and after_mission_no=p_after_mission_no for update;
  if not found or v_assignment.status<>'available' then raise exception 'That bonus mission is not available.'; end if;
  select * into v_bonus from public.viking_mission_bonus_catalog where contact_id=v_contact.id and after_mission_no=p_after_mission_no;
  perform public.consume_named_shared_item(v_player,v_bonus.request_item_name,v_bonus.request_quantity);
  update public.players set silver=coalesce(silver,0)+v_bonus.reward_silver where id=v_player;
  v_destination:=public.grant_named_mission_reward(v_player,v_bonus.reward_item_name,v_bonus.reward_item_quantity);
  update public.player_viking_mission_bonus set status='completed',completed_at=now() where player_id=v_player and contact_id=v_contact.id and after_mission_no=p_after_mission_no;
  insert into public.player_viking_mission_history(player_id,contact_id,bonus_after_mission_no,reward_silver,reward_item_name,reward_item_quantity)
    values(v_player,v_contact.id,p_after_mission_no,v_bonus.reward_silver,v_bonus.reward_item_name,v_bonus.reward_item_quantity);
  return jsonb_build_object('completed',true,'bonus_after_mission_no',p_after_mission_no,'reward_silver',v_bonus.reward_silver,
    'reward_item_name',v_bonus.reward_item_name,'reward_item_quantity',v_bonus.reward_item_quantity,'reward_destination',v_destination);
end;$$;

-- Secure global player directory. This exposes only public-facing profile fields.
create or replace function public.search_midgard_players(p_query text default '',p_page integer default 1,p_page_size integer default 25,p_online_only boolean default false)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  v_query text:=trim(coalesce(p_query,'')); v_page integer:=greatest(1,coalesce(p_page,1)); v_size integer:=least(50,greatest(5,coalesce(p_page_size,25)));
  v_total bigint; v_rows jsonb;
begin
  if auth.uid() is null then raise exception 'Sign in required.'; end if;
  select count(*) into v_total from public.players p
    where (v_query='' or p.username ilike '%'||v_query||'%')
      and (not p_online_only or p.last_online>=now()-interval '5 minutes');
  select coalesce(jsonb_agg(row_payload order by online_now desc,username),'[]'::jsonb) into v_rows from (
    select jsonb_build_object(
      'player_number',p.player_number,'username',p.username,'avatar_url',p.avatar_url,
      'online',p.last_online>=now()-interval '5 minutes','last_online',p.last_online,
      'freedom_status',case when p.tutorial_complete and p.is_free_man then 'Freeman' else 'Thrall' end,
      'total_skill',coalesce(public.viking_total_skill(p.id),1),
      'skill_rank',public.viking_skill_rank(coalesce(public.viking_total_skill(p.id),1)),
      'reputation',coalesce(p.reputation,0),'property_name',coalesce(p.property_name,'No Property')
    ) row_payload,
    (p.last_online>=now()-interval '5 minutes') online_now,p.username
    from public.players p
    where (v_query='' or p.username ilike '%'||v_query||'%')
      and (not p_online_only or p.last_online>=now()-interval '5 minutes')
    order by online_now desc,p.username
    limit v_size offset (v_page-1)*v_size
  ) q;
  return jsonb_build_object('players',v_rows,'total',v_total,'page',v_page,'page_size',v_size,'pages',greatest(1,ceil(v_total::numeric/v_size)::integer));
end;$$;

grant execute on function public.get_my_viking_missions() to authenticated;
grant execute on function public.complete_viking_mission(integer) to authenticated;
grant execute on function public.complete_viking_bonus(integer,integer) to authenticated;
grant execute on function public.search_midgard_players(text,integer,integer,boolean) to authenticated;
revoke execute on function public.consume_named_shared_item(uuid,text,bigint) from public,anon,authenticated;
revoke execute on function public.grant_named_mission_reward(uuid,text,bigint) from public,anon,authenticated;
revoke execute on function public.viking_total_skill(uuid) from public,anon;
grant execute on function public.viking_total_skill(uuid) to authenticated;
grant execute on function public.viking_skill_rank(integer) to authenticated;

commit;
