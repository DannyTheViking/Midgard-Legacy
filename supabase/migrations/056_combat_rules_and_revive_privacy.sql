-- Midgard Legacy Update 056
-- Combat rules requested during live testing + player revive privacy.
-- Server authoritative: random hit locations, courage costs, 1 HP defeat,
-- 30-attack crowd limit, no mid-fight medicine, and revive opt-out.

alter table public.players add column if not exists is_donator boolean not null default false;
alter table public.players add column if not exists allow_player_revives boolean not null default true;

-- Add the crowd-ended state to combat safely.
alter table public.combat_fights drop constraint if exists combat_fights_status_check;
alter table public.combat_fights
    add constraint combat_fights_status_check
    check (status in ('active','attacker_won','defender_won','attacker_fled','defender_fled','crowd_intervened'));

create or replace function public.set_my_revive_preference(p_allow boolean)
returns jsonb
language plpgsql
security definer
set search_path='public','pg_temp'
as $$
declare
    v_me uuid:=auth.uid();
    v_allow boolean:=coalesce(p_allow,true);
begin
    if v_me is null then raise exception 'Sign in required.'; end if;
    update public.players set allow_player_revives=v_allow where id=v_me;
    return jsonb_build_object('allow_player_revives',v_allow);
end;
$$;

revoke all on function public.set_my_revive_preference(boolean) from public;
grant execute on function public.set_my_revive_preference(boolean) to authenticated;

-- Revives are blocked at the database layer when a player opts out.
create or replace function private_api.heal_hospital_patient(target_player_id uuid default null, target_npc_visit_id bigint default null)
returns jsonb
language plpgsql
security definer
set search_path='public','pg_temp'
as $$
declare
    healer_jobs integer;
    heal_percent integer;
    target_health integer;
    patient public.players%rowtype;
    npc_visit public.npc_hospital_visits%rowtype;
    reward_silver integer:=0;
    reward_reputation integer:=0;
begin
    if auth.uid() is null then raise exception 'You must be logged in.'; end if;
    if (target_player_id is null)=(target_npc_visit_id is null) then
        raise exception 'Choose exactly one patient.';
    end if;

    select coalesce(pp.jobs_completed,0) into healer_jobs
    from public.profession_progress pp
    join public.job_npcs n on n.id=pp.npc_id and n.code='healer'
    where pp.player_id=auth.uid();
    healer_jobs:=coalesce(healer_jobs,0);

    if healer_jobs<10 then
        raise exception 'Revive training is locked. Complete 10 jobs for Yrsa the Healer.';
    end if;

    heal_percent:=least(100,10+(floor(healer_jobs/10)::integer*10));
    target_health:=greatest(1,round(500*(heal_percent/100.0))::integer);

    if target_player_id is not null then
        if target_player_id=auth.uid() then raise exception 'You cannot revive yourself.'; end if;
        select * into patient from public.players where id=target_player_id for update;
        if not found or patient.hospital_until is null or patient.hospital_until<=now() then
            raise exception 'That player is not in the healer hut.';
        end if;
        if coalesce(patient.allow_player_revives,true)=false then
            raise exception 'That Viking does not allow other players to revive them.';
        end if;

        target_health:=greatest(1,round(patient.max_health*(heal_percent/100.0))::integer);
        update public.players set
            health=target_health,
            hospital_started_at=null,
            hospital_until=null,
            hospital_reason=null,
            hospital_start_health=null
        where id=patient.id;

        insert into public.healing_records(healer_id,patient_player_id,restored_to)
        values(auth.uid(),patient.id,target_health);
    else
        select * into npc_visit from public.npc_hospital_visits
        where id=target_npc_visit_id and status='recovering' for update;
        if not found then raise exception 'That villager has already left the healer hut.'; end if;

        reward_silver:=10+floor(random()*16)::integer;
        reward_reputation:=1;
        update public.npc_hospital_visits set status='healed',healed_by=auth.uid(),healed_at=now()
        where id=npc_visit.id;
        update public.players set silver=coalesce(silver,0)+reward_silver where id=auth.uid();
        insert into public.healing_records(healer_id,patient_npc_id,restored_to,reward_silver,reward_reputation)
        values(auth.uid(),npc_visit.npc_id,target_health,reward_silver,reward_reputation);
    end if;

    update public.players set revive_count=coalesce(revive_count,0)+1 where id=auth.uid();

    return jsonb_build_object(
        'heal_percent',heal_percent,
        'restored_to',target_health,
        'reward_silver',reward_silver,
        'reward_reputation',reward_reputation,
        'revive_count',(select revive_count from public.players where id=auth.uid())
    );
end;
$$;

-- Resolve one strike. The body part is always random and damage can never reduce
-- the target below 1 HP. Reaching 1 HP is treated as defeat by the fight engine.
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
    v_f public.combat_fights%rowtype;
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
    v_body text;
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
    select * into v_f from public.combat_fights where id=p_fight_id;

    -- The player no longer chooses where to aim.
    v_body:=(array['head','torso','left_arm','right_arm','left_hand','right_hand','left_leg','right_leg','left_foot','right_foot'])[1+floor(random()*10)::int];

    v_actor_strength:=greatest(1,coalesce(v_actor.strength,100));
    v_actor_accuracy:=greatest(1,coalesce(v_actor.accuracy,100));
    v_target_defence:=greatest(1,coalesce(v_target.defence,100));
    v_target_agility:=greatest(1,coalesce(v_target.agility,100));
    v_gear_def:=public.combat_total_gear_defence(p_target);

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
        68+((sqrt(v_actor_accuracy::numeric)-sqrt(v_target_agility::numeric))*2.0)
        +(v_weapon_accuracy*1.5)+v_body_accuracy+v_action_accuracy
    ));
    v_hit:=(random()*100)<v_hit_chance;

    if v_hit then
        v_crit:=(random()*100)<greatest(5,least(18,5+sqrt(v_actor_accuracy::numeric)/4));
        v_damage:=greatest(1,round((
            v_weapon_damage
            +sqrt(v_actor_strength::numeric)*0.70
            -sqrt(v_target_defence::numeric)*0.25
            -v_gear_def*0.35
        )*v_body_damage*v_action_damage*(case when v_crit then 1.55 else 1 end))::integer);

        -- A PvP strike never kills. It can only bring the opponent to 1 HP.
        if p_target=v_f.attacker_id then v_target_health:=v_f.attacker_health;
        else v_target_health:=v_f.defender_health;
        end if;
        v_damage:=least(v_damage,greatest(0,v_target_health-1));

        if p_action='shoot' then
            v_message:=v_actor.username||' shot '||v_target.username||' in the '||v_body_label||' with '||v_weapon_name||' and an Arrow, dealing '||v_damage||' damage'||case when v_crit then ' — critical hit!' else '.' end;
        else
            v_message:=v_actor.username||' '||case when p_action='stab' then 'stabbed ' else 'slashed ' end||v_target.username||' in the '||v_body_label||' with '||v_weapon_name||', dealing '||v_damage||' damage'||case when v_crit then ' — critical hit!' else '.' end;
        end if;
    else
        v_message:=v_actor.username||' tried to '||case when p_action='shoot' then 'shoot' when p_action='stab' then 'stab' else 'slash' end||' '||v_target.username||' but missed.';
    end if;

    insert into public.combat_turns(fight_id,turn_number,actor_id,target_id,action_type,weapon_item_id,ammo_item_id,body_part,hit,critical,damage,message)
    values(p_fight_id,p_turn,p_actor,p_target,p_action,v_weapon,v_ammo,v_body,v_hit,v_crit,v_damage,v_message);

    if p_action='shoot' then
        update public.statistics set arrows_shot=coalesce(arrows_shot,0)+1,
            arrows_hit=coalesce(arrows_hit,0)+(case when v_hit then 1 else 0 end),
            arrows_missed=coalesce(arrows_missed,0)+(case when v_hit then 0 else 1 end)
        where player_id=p_actor;
    end if;
    update public.statistics set damage_done=coalesce(damage_done,0)+v_damage,
        attacks_missed=coalesce(attacks_missed,0)+(case when v_hit then 0 else 1 end),
        critical_hits=coalesce(critical_hits,0)+(case when v_crit then 1 else 0 end)
    where player_id=p_actor;
    update public.statistics set damage_taken=coalesce(damage_taken,0)+v_damage where player_id=p_target;

    return jsonb_build_object('hit',v_hit,'critical',v_crit,'damage',v_damage,'message',v_message,'ammo_item_id',v_ammo,'body_part',v_body);
end;
$$;

-- Defeat now means 1 HP, never 0 HP.
create or replace function public.combat_finish_fight(p_fight_id bigint,p_winner uuid,p_loser uuid,p_status text)
returns void
language plpgsql
security definer
set search_path='public','pg_temp'
as $$
declare
    v_winner_name text;
    v_loser_name text;
begin
    select username into v_winner_name from public.players where id=p_winner;
    select username into v_loser_name from public.players where id=p_loser;

    update public.combat_fights set status=p_status,winner_id=p_winner,loser_id=p_loser,ended_at=now(),last_action_at=now() where id=p_fight_id;
    update public.players set pvp_wins=coalesce(pvp_wins,0)+1 where id=p_winner;
    update public.players set pvp_losses=coalesce(pvp_losses,0)+1 where id=p_loser;

    if p_status in ('attacker_won','defender_won') then
        update public.players set
            health=1,
            hospital_started_at=now(),
            hospital_until=now()+interval '30 minutes',
            hospital_reason='Defeated by '||v_winner_name||' in PvP combat',
            hospital_start_health=1
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

create or replace function public.combat_finish_by_crowd(p_fight_id bigint)
returns void
language plpgsql
security definer
set search_path='public','pg_temp'
as $$
declare
    v_f public.combat_fights%rowtype;
    v_a text;
    v_d text;
begin
    select * into v_f from public.combat_fights where id=p_fight_id for update;
    if not found or v_f.status<>'active' then return; end if;
    select username into v_a from public.players where id=v_f.attacker_id;
    select username into v_d from public.players where id=v_f.defender_id;
    update public.combat_fights set status='crowd_intervened',ended_at=now(),last_action_at=now() where id=p_fight_id;
    insert into public.combat_turns(fight_id,turn_number,actor_id,target_id,action_type,hit,message)
    values(p_fight_id,v_f.turn_number+1,v_f.attacker_id,v_f.defender_id,'crowd',false,
        'A crowd of villagers rushed in after thirty attacks and pulled '||v_a||' and '||v_d||' apart.');
    insert into public.player_notifications(player_id,notification_type,title,message,icon,link,unique_key)
    values(v_f.attacker_id,'combat','Fight stopped by the crowd',
        'The crowd ended your fight with '||v_d||' after thirty attacks. Click to view the full attack log.','👥','combat.html?fight='||p_fight_id,'combat-crowd-'||p_fight_id||'-'||v_f.attacker_id::text)
    on conflict (player_id,unique_key) do nothing;
    insert into public.player_notifications(player_id,notification_type,title,message,icon,link,unique_key)
    values(v_f.defender_id,'combat','Fight stopped by the crowd',
        'The crowd ended your fight with '||v_a||' after thirty attacks. Click to view the full attack log.','👥','combat.html?fight='||p_fight_id,'combat-crowd-'||p_fight_id||'-'||v_f.defender_id::text)
    on conflict (player_id,unique_key) do nothing;
end;
$$;

create or replace function public.perform_combat_action(p_fight_id bigint,p_action text,p_body_part text default null)
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
    v_turn integer;
    v_counter_action text;
    v_counter jsonb;
    v_actor_agility bigint;
    v_target_agility bigint;
    v_flee_chance numeric;
    v_target_ranged bigint;
    v_target_arrows integer;
    v_actor_name text;
    v_target_name text;
    v_attack_body text;
    v_counter_body text;
    v_strike jsonb;
    v_attack_count integer;
    v_courage_cost integer;
    v_courage integer;
    v_is_donator boolean;
begin
    if v_me is null then raise exception 'Sign in required.'; end if;
    select * into v_f from public.combat_fights where id=p_fight_id for update;
    if not found then raise exception 'Fight not found.'; end if;
    if v_f.attacker_id<>v_me then raise exception 'Only the attacking player can control this fight.'; end if;
    if v_f.status<>'active' then return public.get_combat_fight(p_fight_id); end if;

    v_turn:=v_f.turn_number+1;
    select username,agility,courage,coalesce(is_donator,false)
      into v_actor_name,v_actor_agility,v_courage,v_is_donator
    from public.players where id=v_f.attacker_id for update;
    select username,agility into v_target_name,v_target_agility from public.players where id=v_f.defender_id;

    if p_action in ('slash','stab','shoot') then
        v_courage_cost:=case when v_is_donator then 25 else 50 end;
        if coalesce(v_courage,0)<v_courage_cost then
            raise exception 'You need % Courage for another attack.',v_courage_cost;
        end if;
        update public.players set courage=greatest(0,courage-v_courage_cost),last_action=now() where id=v_f.attacker_id;

        v_attack_body:=(array['head','torso','left_arm','right_arm','left_hand','right_hand','left_leg','right_leg','left_foot','right_foot'])[1+floor(random()*10)::int];
        v_strike:=public.combat_resolve_strike(v_f.id,v_f.attacker_id,v_f.defender_id,p_action,v_attack_body,v_turn);
        v_target_hp:=greatest(1,v_f.defender_health-coalesce((v_strike->>'damage')::integer,0));
        update public.combat_fights set defender_health=v_target_hp,turn_number=v_turn,last_action_at=now() where id=v_f.id;
        if v_target_hp<=1 then
            perform public.combat_finish_fight(v_f.id,v_f.attacker_id,v_f.defender_id,'attacker_won');
            return public.get_combat_fight(v_f.id);
        end if;

        select count(*)::integer into v_attack_count from public.combat_turns
        where fight_id=v_f.id and action_type in ('slash','stab','shoot');
        if v_attack_count>=30 then
            perform public.combat_finish_by_crowd(v_f.id);
            return public.get_combat_fight(v_f.id);
        end if;

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
    else
        -- Herbal Bandages and all other medicine are deliberately unavailable in combat.
        raise exception 'That action is not available during a fight.';
    end if;

    -- Defender counterattack. This does not drain the defender's courage because
    -- they did not voluntarily initiate the PvP action while potentially offline.
    select public.combat_equipped_item_id(v_f.defender_id,'ranged'),public.combat_inventory_count(v_f.defender_id,'Arrow')
      into v_target_ranged,v_target_arrows;
    if v_target_ranged is not null and v_target_arrows>0 and random()<0.35 then v_counter_action:='shoot';
    elsif random()<0.50 then v_counter_action:='slash'; else v_counter_action:='stab'; end if;
    v_counter_body:=(array['head','torso','left_arm','right_arm','left_hand','right_hand','left_leg','right_leg','left_foot','right_foot'])[1+floor(random()*10)::int];
    v_turn:=v_turn+1;
    v_counter:=public.combat_resolve_strike(v_f.id,v_f.defender_id,v_f.attacker_id,v_counter_action,v_counter_body,v_turn);
    select attacker_health into v_actor_hp from public.combat_fights where id=v_f.id;
    v_actor_hp:=greatest(1,v_actor_hp-coalesce((v_counter->>'damage')::integer,0));
    update public.combat_fights set attacker_health=v_actor_hp,turn_number=v_turn,last_action_at=now() where id=v_f.id;
    if v_actor_hp<=1 then
        perform public.combat_finish_fight(v_f.id,v_f.defender_id,v_f.attacker_id,'defender_won');
        return public.get_combat_fight(v_f.id);
    end if;

    select count(*)::integer into v_attack_count from public.combat_turns
    where fight_id=v_f.id and action_type in ('slash','stab','shoot');
    if v_attack_count>=30 then perform public.combat_finish_by_crowd(v_f.id); end if;

    return public.get_combat_fight(v_f.id);
end;
$$;

revoke all on function public.combat_finish_by_crowd(bigint) from public;
revoke all on function public.perform_combat_action(bigint,text,text) from public;
grant execute on function public.perform_combat_action(bigint,text,text) to authenticated;
