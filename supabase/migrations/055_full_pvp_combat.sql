-- Midgard Legacy Update 055
-- Server-authoritative PvP combat engine.
-- The browser renders combat, but every hit, miss, ammo use, health change,
-- hospital result, statistic and notification is decided here.

create table if not exists public.combat_fights (
    id bigserial primary key,
    attacker_id uuid not null references public.players(id) on delete cascade,
    defender_id uuid not null references public.players(id) on delete cascade,
    attacker_health integer not null,
    defender_health integer not null,
    attacker_max_health integer not null,
    defender_max_health integer not null,
    status text not null default 'active' check (status in ('active','attacker_won','defender_won','attacker_fled','defender_fled')),
    winner_id uuid references public.players(id) on delete set null,
    loser_id uuid references public.players(id) on delete set null,
    turn_number integer not null default 0,
    started_at timestamptz not null default now(),
    ended_at timestamptz,
    last_action_at timestamptz not null default now()
);

create index if not exists combat_fights_attacker_idx on public.combat_fights(attacker_id, started_at desc);
create index if not exists combat_fights_defender_idx on public.combat_fights(defender_id, started_at desc);
create unique index if not exists one_active_fight_per_attacker
    on public.combat_fights(attacker_id) where status='active';

create table if not exists public.combat_turns (
    id bigserial primary key,
    fight_id bigint not null references public.combat_fights(id) on delete cascade,
    turn_number integer not null,
    actor_id uuid not null references public.players(id) on delete cascade,
    target_id uuid not null references public.players(id) on delete cascade,
    action_type text not null,
    weapon_item_id bigint references public.items(id) on delete set null,
    ammo_item_id bigint references public.items(id) on delete set null,
    body_part text,
    hit boolean not null default false,
    critical boolean not null default false,
    damage integer not null default 0,
    healing integer not null default 0,
    message text not null,
    created_at timestamptz not null default now()
);

create index if not exists combat_turns_fight_idx on public.combat_turns(fight_id, id);

alter table public.combat_fights enable row level security;
alter table public.combat_turns enable row level security;

-- Combat data is intentionally exposed only through participant-safe RPCs.
revoke all on public.combat_fights from anon, authenticated;
revoke all on public.combat_turns from anon, authenticated;

-- Ensure all current and future profiles have a PvP counter.
alter table public.players add column if not exists pvp_wins bigint not null default 0;
alter table public.players add column if not exists pvp_losses bigint not null default 0;

-- Equipment lookup supports the new slot table and the older equipment table.
create or replace function public.combat_equipped_item_id(p_player uuid, p_slot text)
returns bigint
language plpgsql
stable
security definer
set search_path='public','pg_temp'
as $$
declare
    v_id bigint;
begin
    select pes.item_id into v_id
    from public.player_equipment_slots pes
    where pes.player_id=p_player and pes.slot_key=p_slot
    limit 1;

    if v_id is not null then return v_id; end if;

    select e.item_id into v_id
    from public.equipment e
    where e.player_id=p_player
      and e.is_equipped=true
      and (e.slot=p_slot or exists(
          select 1 from public.items i
          where i.id=e.item_id and i.equipment_slot=p_slot
      ))
    order by e.id desc
    limit 1;

    return v_id;
end;
$$;

create or replace function public.combat_item_damage(p_item_id bigint)
returns integer
language plpgsql
stable
security definer
set search_path='public','pg_temp'
as $$
declare
    v_name text;
    v_damage integer;
begin
    if p_item_id is null then return 2; end if;
    select lower(name),coalesce(damage,0) into v_name,v_damage from public.items where id=p_item_id;
    if coalesce(v_damage,0)>0 then return v_damage; end if;
    return case
        when v_name like '%pattern-welded sword%' then 22
        when v_name like '%viking sword%' then 18
        when v_name like '%dane axe%' then 21
        when v_name like '%battle axe%' then 18
        when v_name like '%bearded axe%' then 15
        when v_name like '%hand axe%' then 11
        when v_name like '%war bow%' then 20
        when v_name like '%hunting bow%' then 10
        when v_name like '%wooden axe%' then 6
        when v_name like '%rusty%' then 4
        else 5
    end;
end;
$$;

create or replace function public.combat_item_defence(p_item_id bigint)
returns integer
language plpgsql
stable
security definer
set search_path='public','pg_temp'
as $$
declare
    v_name text;
    v_def integer;
begin
    if p_item_id is null then return 0; end if;
    select lower(name),coalesce(defence,0) into v_name,v_def from public.items where id=p_item_id;
    if coalesce(v_def,0)>0 then return v_def; end if;
    return case
        when v_name like '%reinforced%shield%' then 10
        when v_name like '%shield%' then 6
        when v_name like '%spectacle helmet%' then 6
        when v_name like '%nasal helmet%' then 4
        when v_name like '%wool tunic%' then 2
        else 0
    end;
end;
$$;

create or replace function public.combat_total_gear_defence(p_player uuid)
returns integer
language plpgsql
stable
security definer
set search_path='public','pg_temp'
as $$
declare
    v_total integer:=0;
    v_slot text;
    v_item bigint;
begin
    foreach v_slot in array array['head','body','defence','legs','feet'] loop
        v_item:=public.combat_equipped_item_id(p_player,v_slot);
        v_total:=v_total+public.combat_item_defence(v_item);
    end loop;
    return v_total;
end;
$$;

create or replace function public.combat_inventory_count(p_player uuid, p_item_name text)
returns integer
language sql
stable
security definer
set search_path='public','pg_temp'
as $$
    select coalesce(sum(inv.quantity),0)::integer
    from public.inventory inv
    join public.items i on i.id=inv.item_id
    where inv.player_id=p_player and lower(i.name)=lower(p_item_name);
$$;

create or replace function public.combat_take_inventory_item(p_player uuid, p_item_name text, p_quantity integer default 1)
returns bigint
language plpgsql
security definer
set search_path='public','pg_temp'
as $$
declare
    v_id bigint;
    v_item bigint;
    v_qty integer;
begin
    if p_quantity<1 then raise exception 'Invalid item quantity.'; end if;
    select inv.id,inv.item_id,inv.quantity into v_id,v_item,v_qty
    from public.inventory inv
    join public.items i on i.id=inv.item_id
    where inv.player_id=p_player and lower(i.name)=lower(p_item_name) and inv.quantity>0
    order by inv.id
    limit 1
    for update;
    if v_id is null or v_qty<p_quantity then raise exception 'You do not have enough %.',p_item_name; end if;
    if v_qty=p_quantity then delete from public.inventory where id=v_id;
    else update public.inventory set quantity=quantity-p_quantity where id=v_id; end if;
    return v_item;
end;
$$;

create or replace function public.combat_equipment_json(p_player uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path='public','pg_temp'
as $$
declare
    v_result jsonb:='{}'::jsonb;
    v_slot text;
    v_id bigint;
    v_item jsonb;
begin
    foreach v_slot in array array['head','body','main_hand','defence','ranged','ammo'] loop
        v_id:=public.combat_equipped_item_id(p_player,v_slot);
        if v_id is not null then
            select jsonb_build_object('id',i.id,'name',i.name,'slot',v_slot,'damage',public.combat_item_damage(i.id),'defence',public.combat_item_defence(i.id),'accuracy',coalesce(i.accuracy,0))
              into v_item from public.items i where i.id=v_id;
        else
            v_item:=null;
        end if;
        v_result:=v_result||jsonb_build_object(v_slot,v_item);
    end loop;
    v_result:=v_result||jsonb_build_object('arrow_count',public.combat_inventory_count(p_player,'Arrow'));
    return v_result;
end;
$$;

-- Returns the public combat snapshot for either participant only.
create or replace function public.get_combat_fight(p_fight_id bigint)
returns jsonb
language plpgsql
security definer
set search_path='public','pg_temp'
as $$
declare
    v_me uuid:=auth.uid();
    v_f public.combat_fights%rowtype;
    v_a public.players%rowtype;
    v_d public.players%rowtype;
    v_logs jsonb;
begin
    if v_me is null then raise exception 'Sign in required.'; end if;
    select * into v_f from public.combat_fights where id=p_fight_id;
    if not found then raise exception 'Fight not found.'; end if;
    if v_me not in (v_f.attacker_id,v_f.defender_id) then raise exception 'You are not part of this fight.'; end if;
    select * into v_a from public.players where id=v_f.attacker_id;
    select * into v_d from public.players where id=v_f.defender_id;
    select coalesce(jsonb_agg(jsonb_build_object(
        'id',ct.id,'turn_number',ct.turn_number,'actor_id',ct.actor_id,'target_id',ct.target_id,
        'action_type',ct.action_type,'body_part',ct.body_part,'hit',ct.hit,'critical',ct.critical,
        'damage',ct.damage,'healing',ct.healing,'message',ct.message,'created_at',ct.created_at
    ) order by ct.id),'[]'::jsonb) into v_logs
    from public.combat_turns ct where ct.fight_id=v_f.id;

    return jsonb_build_object(
        'fight_id',v_f.id,'status',v_f.status,'winner_id',v_f.winner_id,'loser_id',v_f.loser_id,
        'started_at',v_f.started_at,'ended_at',v_f.ended_at,'turn_number',v_f.turn_number,
        'attacker',jsonb_build_object('id',v_a.id,'player_number',v_a.player_number,'username',v_a.username,'avatar_url',v_a.avatar_url,
            'health',v_f.attacker_health,'max_health',v_f.attacker_max_health,'strength',v_a.strength,'defence',v_a.defence,'agility',v_a.agility,'accuracy',v_a.accuracy,
            'equipment',public.combat_equipment_json(v_a.id)),
        'defender',jsonb_build_object('id',v_d.id,'player_number',v_d.player_number,'username',v_d.username,'avatar_url',v_d.avatar_url,
            'health',v_f.defender_health,'max_health',v_f.defender_max_health,'strength',v_d.strength,'defence',v_d.defence,'agility',v_d.agility,'accuracy',v_d.accuracy,
            'equipment',public.combat_equipment_json(v_d.id)),
        'logs',v_logs
    );
end;
$$;

create or replace function public.start_player_attack(p_target_player uuid)
returns jsonb
language plpgsql
security definer
set search_path='public','pg_temp'
as $$
declare
    v_me uuid:=auth.uid();
    v_attacker public.players%rowtype;
    v_defender public.players%rowtype;
    v_existing bigint;
    v_fight bigint;
begin
    if v_me is null then raise exception 'Sign in required.'; end if;
    if p_target_player is null or p_target_player=v_me then raise exception 'You cannot attack yourself.'; end if;

    select * into v_attacker from public.players where id=v_me for update;
    select * into v_defender from public.players where id=p_target_player for update;
    if not found then raise exception 'Player not found.'; end if;

    if coalesce(v_attacker.is_free_man,false)=false then raise exception 'Earn your freedom before attacking other Vikings.'; end if;
    if coalesce(v_defender.is_free_man,false)=false then raise exception 'You cannot attack a Thrall.'; end if;
    if v_attacker.hospital_until is not null and v_attacker.hospital_until>now() then raise exception 'You cannot fight while in the healer hut.'; end if;
    if v_defender.hospital_until is not null and v_defender.hospital_until>now() then raise exception 'That Viking is already in the healer hut.'; end if;
    if coalesce(v_attacker.health,0)<=0 then raise exception 'You are too injured to fight.'; end if;
    if coalesce(v_defender.health,0)<=0 then raise exception 'That Viking is too injured to fight.'; end if;

    select id into v_existing from public.combat_fights where attacker_id=v_me and status='active' order by id desc limit 1;
    if v_existing is not null then return public.get_combat_fight(v_existing); end if;

    insert into public.combat_fights(attacker_id,defender_id,attacker_health,defender_health,attacker_max_health,defender_max_health)
    values(v_me,p_target_player,v_attacker.health,v_defender.health,v_attacker.max_health,v_defender.max_health)
    returning id into v_fight;

    insert into public.combat_turns(fight_id,turn_number,actor_id,target_id,action_type,hit,message)
    values(v_fight,0,v_me,p_target_player,'start',true,v_attacker.username||' challenged '||v_defender.username||' to battle.');

    return public.get_combat_fight(v_fight);
end;
$$;

-- One server-authoritative strike. This helper is private to the action RPC.
create or replace function public.combat_resolve_strike(
    p_fight_id bigint,
    p_actor uuid,
    p_target uuid,
    p_action text,
    p_body_part text,
    p_turn integer
)
returns jsonb
language plpgsql
security definer
set search_path='public','pg_temp'
as $$
declare
    v_actor public.players%rowtype;
    v_target public.players%rowtype;
    v_weapon bigint;
    v_ammo bigint;
    v_weapon_name text:='bare hands';
    v_weapon_damage integer:=2;
    v_weapon_accuracy integer:=0;
    v_actor_strength bigint:=100;
    v_actor_accuracy bigint:=100;
    v_target_defence bigint:=100;
    v_target_agility bigint:=100;
    v_gear_def integer:=0;
    v_hit_chance numeric;
    v_hit boolean;
    v_crit boolean:=false;
    v_damage integer:=0;
    v_body text:=lower(coalesce(p_body_part,'torso'));
    v_body_label text;
    v_body_damage numeric:=1.0;
    v_body_accuracy numeric:=0;
    v_action_damage numeric:=1.0;
    v_action_accuracy numeric:=0;
    v_message text;
    v_target_health integer;
begin
    select * into v_actor from public.players where id=p_actor;
    select * into v_target from public.players where id=p_target;
    v_actor_strength:=greatest(1,coalesce(v_actor.strength,100));
    v_actor_accuracy:=greatest(1,coalesce(v_actor.accuracy,100));
    v_target_defence:=greatest(1,coalesce(v_target.defence,100));
    v_target_agility:=greatest(1,coalesce(v_target.agility,100));
    v_gear_def:=public.combat_total_gear_defence(p_target);

    if v_body not in ('head','torso','left_arm','right_arm','left_hand','right_hand','left_leg','right_leg','left_foot','right_foot') then v_body:='torso'; end if;
    v_body_label:=replace(v_body,'_',' ');
    case
      when v_body='head' then v_body_damage:=1.30; v_body_accuracy:=-16;
      when v_body='torso' then v_body_damage:=1.00; v_body_accuracy:=8;
      when v_body like '%arm' then v_body_damage:=0.90; v_body_accuracy:=-4;
      when v_body like '%hand' then v_body_damage:=0.80; v_body_accuracy:=-10;
      when v_body like '%leg' then v_body_damage:=0.95; v_body_accuracy:=-3;
      else v_body_damage:=0.75; v_body_accuracy:=-12;
    end case;

    if p_action='shoot' then
        v_weapon:=public.combat_equipped_item_id(p_actor,'ranged');
        if v_weapon is null then raise exception 'Equip a bow before shooting.'; end if;
        v_ammo:=public.combat_take_inventory_item(p_actor,'Arrow',1);
        select name,coalesce(accuracy,0) into v_weapon_name,v_weapon_accuracy from public.items where id=v_weapon;
        v_weapon_damage:=public.combat_item_damage(v_weapon);
        v_action_damage:=1.0; v_action_accuracy:=3;
    else
        v_weapon:=public.combat_equipped_item_id(p_actor,'main_hand');
        if v_weapon is not null then
            select name,coalesce(accuracy,0) into v_weapon_name,v_weapon_accuracy from public.items where id=v_weapon;
            v_weapon_damage:=public.combat_item_damage(v_weapon);
        end if;
        if p_action='stab' then v_action_damage:=0.92; v_action_accuracy:=7;
        elsif p_action='slash' then v_action_damage:=1.08; v_action_accuracy:=-1;
        else raise exception 'Unknown attack action.'; end if;
    end if;

    v_hit_chance:=greatest(18,least(96,
        68 + ((sqrt(v_actor_accuracy::numeric)-sqrt(v_target_agility::numeric))*2.0)
        + (v_weapon_accuracy*1.5) + v_body_accuracy + v_action_accuracy
    ));
    v_hit:=(random()*100)<v_hit_chance;

    if v_hit then
        v_crit:=(random()*100)<greatest(5,least(18,5+sqrt(v_actor_accuracy::numeric)/4));
        v_damage:=greatest(1,round((
            v_weapon_damage
            + sqrt(v_actor_strength::numeric)*0.70
            - sqrt(v_target_defence::numeric)*0.25
            - v_gear_def*0.35
        )*v_body_damage*v_action_damage*(case when v_crit then 1.55 else 1 end))::integer);
        if p_action='shoot' then
            v_message:=v_actor.username||' shot '||v_target.username||' in the '||v_body_label||' with '||v_weapon_name||' and an Arrow, dealing '||v_damage||' damage'||case when v_crit then ' — critical hit!' else '.' end;
        else
            v_message:=v_actor.username||' '||case when p_action='stab' then 'stabbed ' else 'slashed ' end||v_target.username||' in the '||v_body_label||' with '||v_weapon_name||', dealing '||v_damage||' damage'||case when v_crit then ' — critical hit!' else '.' end;
        end if;
    else
        v_message:=v_actor.username||' tried to '||case when p_action='shoot' then 'shoot' when p_action='stab' then 'stab' else 'slash' end||' '||v_target.username||' in the '||v_body_label||' but missed.';
    end if;

    insert into public.combat_turns(fight_id,turn_number,actor_id,target_id,action_type,weapon_item_id,ammo_item_id,body_part,hit,critical,damage,message)
    values(p_fight_id,p_turn,p_actor,p_target,p_action,v_weapon,v_ammo,v_body,v_hit,v_crit,v_damage,v_message);

    if p_action='shoot' then
        update public.statistics set arrows_shot=coalesce(arrows_shot,0)+1,
            arrows_hit=coalesce(arrows_hit,0)+(case when v_hit then 1 else 0 end),
            arrows_missed=coalesce(arrows_missed,0)+(case when v_hit then 0 else 1 end)
        where player_id=p_actor;
    end if;
    update public.statistics set
        damage_done=coalesce(damage_done,0)+v_damage,
        attacks_missed=coalesce(attacks_missed,0)+(case when v_hit then 0 else 1 end),
        critical_hits=coalesce(critical_hits,0)+(case when v_crit then 1 else 0 end)
    where player_id=p_actor;
    update public.statistics set damage_taken=coalesce(damage_taken,0)+v_damage where player_id=p_target;

    return jsonb_build_object('hit',v_hit,'critical',v_crit,'damage',v_damage,'message',v_message,'ammo_item_id',v_ammo);
end;
$$;

create or replace function public.combat_finish_fight(p_fight_id bigint, p_winner uuid, p_loser uuid, p_status text)
returns void
language plpgsql
security definer
set search_path='public','pg_temp'
as $$
declare
    v_winner_name text;
    v_loser_name text;
    v_winner_hp integer;
    v_loser_hp integer;
begin
    select username into v_winner_name from public.players where id=p_winner;
    select username into v_loser_name from public.players where id=p_loser;

    update public.combat_fights set status=p_status,winner_id=p_winner,loser_id=p_loser,ended_at=now(),last_action_at=now() where id=p_fight_id;
    update public.players set pvp_wins=coalesce(pvp_wins,0)+1 where id=p_winner;
    update public.players set pvp_losses=coalesce(pvp_losses,0)+1 where id=p_loser;

    -- A defeated player goes to the healer hut for 30 minutes.
    if p_status in ('attacker_won','defender_won') then
        update public.players set health=0,hospital_started_at=now(),hospital_until=now()+interval '30 minutes',
            hospital_reason='Defeated by '||v_winner_name||' in PvP combat',hospital_start_health=0
        where id=p_loser;
    end if;

    insert into public.player_notifications(player_id,notification_type,title,message,icon,link,unique_key)
    values(p_winner,'combat','Victory over '||v_loser_name,
        v_winner_name||' defeated '||v_loser_name||'. Click to view the full attack log.','⚔️','combat.html?fight='||p_fight_id,'combat-win-'||p_fight_id||'-'||p_winner::text)
    on conflict (player_id,unique_key) do nothing;

    insert into public.player_notifications(player_id,notification_type,title,message,icon,link,unique_key)
    values(p_loser,'combat','Defeated by '||v_winner_name,
        v_winner_name||' defeated '||v_loser_name||'. Click to view the full attack log.','🛡️','combat.html?fight='||p_fight_id,'combat-loss-'||p_fight_id||'-'||p_loser::text)
    on conflict (player_id,unique_key) do nothing;
end;
$$;

create or replace function public.perform_combat_action(p_fight_id bigint, p_action text, p_body_part text default 'torso')
returns jsonb
language plpgsql
security definer
set search_path='public','pg_temp'
as $$
declare
    v_me uuid:=auth.uid();
    v_f public.combat_fights%rowtype;
    v_actor_hp integer;
    v_target_hp integer;
    v_heal_id bigint;
    v_heal integer:=5;
    v_turn integer;
    v_counter_action text;
    v_counter_body text;
    v_counter jsonb;
    v_actor_agility bigint;
    v_target_agility bigint;
    v_flee_chance numeric;
    v_target_ranged bigint;
    v_target_arrows integer;
    v_actor_name text;
    v_target_name text;
begin
    if v_me is null then raise exception 'Sign in required.'; end if;
    select * into v_f from public.combat_fights where id=p_fight_id for update;
    if not found then raise exception 'Fight not found.'; end if;
    if v_f.attacker_id<>v_me then raise exception 'Only the attacking player can control this fight.'; end if;
    if v_f.status<>'active' then return public.get_combat_fight(p_fight_id); end if;

    v_turn:=v_f.turn_number+1;
    select username,agility into v_actor_name,v_actor_agility from public.players where id=v_f.attacker_id;
    select username,agility into v_target_name,v_target_agility from public.players where id=v_f.defender_id;

    if p_action='use_item' then
        v_heal_id:=public.combat_take_inventory_item(v_f.attacker_id,'Herbal Bandage',1);
        v_actor_hp:=least(v_f.attacker_max_health,v_f.attacker_health+v_heal);
        update public.combat_fights set attacker_health=v_actor_hp,turn_number=v_turn,last_action_at=now() where id=v_f.id;
        insert into public.combat_turns(fight_id,turn_number,actor_id,target_id,action_type,hit,healing,message)
        values(v_f.id,v_turn,v_f.attacker_id,v_f.attacker_id,'use_item',true,v_heal,v_actor_name||' used an Herbal Bandage and restored '||v_heal||' health.');
    elsif p_action='flee' then
        v_flee_chance:=greatest(20,least(85,50+(sqrt(greatest(1,coalesce(v_actor_agility,100))::numeric)-sqrt(greatest(1,coalesce(v_target_agility,100))::numeric))*3));
        if random()*100<v_flee_chance then
            update public.combat_fights set status='attacker_fled',ended_at=now(),turn_number=v_turn,last_action_at=now() where id=v_f.id;
            insert into public.combat_turns(fight_id,turn_number,actor_id,target_id,action_type,hit,message)
            values(v_f.id,v_turn,v_f.attacker_id,v_f.defender_id,'flee',true,v_actor_name||' escaped from the fight.');
            return public.get_combat_fight(v_f.id);
        else
            update public.combat_fights set turn_number=v_turn,last_action_at=now() where id=v_f.id;
            insert into public.combat_turns(fight_id,turn_number,actor_id,target_id,action_type,hit,message)
            values(v_f.id,v_turn,v_f.attacker_id,v_f.defender_id,'flee',false,v_actor_name||' tried to flee but '||v_target_name||' cut off the escape.');
        end if;
    elsif p_action in ('slash','stab','shoot') then
        perform public.combat_resolve_strike(v_f.id,v_f.attacker_id,v_f.defender_id,p_action,p_body_part,v_turn);
        select defender_health into v_target_hp from public.combat_fights where id=v_f.id;
        -- combat_resolve_strike records damage; apply the latest damage to the fight snapshot.
        select greatest(0,v_f.defender_health-coalesce((select damage from public.combat_turns where fight_id=v_f.id and turn_number=v_turn and actor_id=v_f.attacker_id order by id desc limit 1),0)) into v_target_hp;
        update public.combat_fights set defender_health=v_target_hp,turn_number=v_turn,last_action_at=now() where id=v_f.id;
        if v_target_hp<=0 then
            perform public.combat_finish_fight(v_f.id,v_f.attacker_id,v_f.defender_id,'attacker_won');
            return public.get_combat_fight(v_f.id);
        end if;
    else
        raise exception 'Unknown combat action.';
    end if;

    -- Defender counterattacks after every unsuccessful flee, item use or normal attack.
    select public.combat_equipped_item_id(v_f.defender_id,'ranged'),public.combat_inventory_count(v_f.defender_id,'Arrow') into v_target_ranged,v_target_arrows;
    if v_target_ranged is not null and v_target_arrows>0 and random()<0.35 then v_counter_action:='shoot';
    elsif random()<0.50 then v_counter_action:='slash'; else v_counter_action:='stab'; end if;
    v_counter_body:=(array['head','torso','left_arm','right_arm','left_hand','right_hand','left_leg','right_leg','left_foot','right_foot'])[1+floor(random()*10)::int];
    v_turn:=v_turn+1;
    v_counter:=public.combat_resolve_strike(v_f.id,v_f.defender_id,v_f.attacker_id,v_counter_action,v_counter_body,v_turn);
    select greatest(0,attacker_health-coalesce((v_counter->>'damage')::integer,0)) into v_actor_hp from public.combat_fights where id=v_f.id;
    update public.combat_fights set attacker_health=v_actor_hp,turn_number=v_turn,last_action_at=now() where id=v_f.id;
    if v_actor_hp<=0 then
        perform public.combat_finish_fight(v_f.id,v_f.defender_id,v_f.attacker_id,'defender_won');
    end if;

    return public.get_combat_fight(v_f.id);
end;
$$;

-- Mission-ready helper: later contract logic can ask whether the player defeated
-- a specific target since the contract was offered, without trusting the browser.
create or replace function public.player_defeated_since(p_player uuid,p_target uuid,p_since timestamptz)
returns boolean
language sql
stable
security definer
set search_path='public','pg_temp'
as $$
    select exists(
        select 1 from public.combat_fights
        where winner_id=p_player and loser_id=p_target
          and status in ('attacker_won','defender_won')
          and ended_at>=coalesce(p_since,'epoch'::timestamptz)
    );
$$;

revoke all on function public.combat_equipped_item_id(uuid,text) from public;
revoke all on function public.combat_item_damage(bigint) from public;
revoke all on function public.combat_item_defence(bigint) from public;
revoke all on function public.combat_total_gear_defence(uuid) from public;
revoke all on function public.combat_inventory_count(uuid,text) from public;
revoke all on function public.combat_take_inventory_item(uuid,text,integer) from public;
revoke all on function public.combat_equipment_json(uuid) from public;
revoke all on function public.combat_resolve_strike(bigint,uuid,uuid,text,text,integer) from public;
revoke all on function public.combat_finish_fight(bigint,uuid,uuid,text) from public;

revoke all on function public.get_combat_fight(bigint) from public;
revoke all on function public.start_player_attack(uuid) from public;
revoke all on function public.perform_combat_action(bigint,text,text) from public;
revoke all on function public.player_defeated_since(uuid,uuid,timestamptz) from public;
grant execute on function public.get_combat_fight(bigint) to authenticated;
grant execute on function public.start_player_attack(uuid) to authenticated;
grant execute on function public.perform_combat_action(bigint,text,text) to authenticated;
-- player_defeated_since is intended for trusted server-side mission functions.
