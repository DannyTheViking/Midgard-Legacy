-- Midgard Legacy Update 057
-- Full-body equipment figures, male/female body selection, server-enforced
-- weapon requirements, post-victory actions and patron favour advances.

begin;

-- ============================================================
-- CHARACTER BODY + BEDROOM EQUIPMENT FIGURE
-- ============================================================

alter table public.players
    add column if not exists character_body_type text not null default 'male';

alter table public.players drop constraint if exists players_character_body_type_check;
alter table public.players
    add constraint players_character_body_type_check
    check (character_body_type in ('male','female'));

create or replace function public.set_my_character_body_type(p_body_type text)
returns jsonb
language plpgsql
security definer
set search_path='public','pg_temp'
as $$
declare
    v_player uuid:=auth.uid();
    v_body text:=lower(trim(coalesce(p_body_type,'')));
begin
    if v_player is null then raise exception 'Sign in required.'; end if;
    if v_body not in ('male','female') then raise exception 'Choose the male or female Viking.'; end if;
    update public.players set character_body_type=v_body where id=v_player;
    return jsonb_build_object('character_body_type',v_body);
end;
$$;

revoke all on function public.set_my_character_body_type(text) from public,anon;
grant execute on function public.set_my_character_body_type(text) to authenticated;

create or replace function public.get_bedroom_equipment()
returns jsonb
language plpgsql
security definer
set search_path='public','pg_temp'
as $$
declare
    v_player uuid:=auth.uid();
    v_body text;
begin
    if v_player is null then raise exception 'Sign in required.'; end if;
    select coalesce(character_body_type,'male') into v_body from public.players where id=v_player;

    return jsonb_build_object(
        'character_body_type',v_body,
        'items',coalesce((
            with owned as (
                select item_id,sum(quantity)::bigint quantity
                from (
                    select item_id,quantity::bigint from public.inventory where player_id=v_player and quantity>0
                    union all
                    select item_id,quantity::bigint from public.player_storage where player_id=v_player and quantity>0
                ) source_items
                group by item_id
            )
            select jsonb_agg(jsonb_build_object(
                'item_id',i.id,'name',i.name,'description',i.description,
                'category',i.equipment_category,'slot_key',coalesce(i.equipment_slot,i.equipment_category),
                'quantity',owned.quantity,'damage',coalesce(i.damage,0),'defence',coalesce(i.defence,0),
                'accuracy',coalesce(i.accuracy,0),'equipped',exists(
                    select 1 from public.player_equipment_slots equipment
                    where equipment.player_id=v_player and equipment.item_id=i.id
                )
            ) order by i.name)
            from owned join public.items i on i.id=owned.item_id
            where i.equipment_category is not null
        ),'[]'::jsonb),
        'equipped',coalesce((
            select jsonb_agg(jsonb_build_object(
                'item_id',equipment.item_id,'slot_key',equipment.slot_key,
                'slot_label',initcap(replace(equipment.slot_key,'_',' ')),
                'category',item.equipment_category,'name',item.name,
                'damage',coalesce(item.damage,0),'defence',coalesce(item.defence,0),
                'accuracy',coalesce(item.accuracy,0)
            ) order by equipment.slot_key)
            from public.player_equipment_slots equipment
            join public.items item on item.id=equipment.item_id
            where equipment.player_id=v_player
        ),'[]'::jsonb),
        'total_damage',coalesce((select sum(coalesce(item.damage,0)) from public.player_equipment_slots equipment join public.items item on item.id=equipment.item_id where equipment.player_id=v_player),0),
        'total_defence',coalesce((select sum(coalesce(item.defence,0)) from public.player_equipment_slots equipment join public.items item on item.id=equipment.item_id where equipment.player_id=v_player),0),
        'total_accuracy',coalesce((select sum(coalesce(item.accuracy,0)) from public.player_equipment_slots equipment join public.items item on item.id=equipment.item_id where equipment.player_id=v_player),0)
    );
end;
$$;

revoke all on function public.get_bedroom_equipment() from public,anon;
grant execute on function public.get_bedroom_equipment() to authenticated;

-- Include every visible equipment slot in the live combat figure.
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
    foreach v_slot in array array['head','body','armour','legs','feet','main_hand','off_hand','defence','ranged','ammo','accessory','utility'] loop
        v_id:=public.combat_equipped_item_id(p_player,v_slot);
        if v_id is not null then
            select jsonb_build_object(
                'id',i.id,'name',i.name,'slot',v_slot,
                'damage',public.combat_item_damage(i.id),
                'defence',public.combat_item_defence(i.id),
                'accuracy',coalesce(i.accuracy,0)
            ) into v_item from public.items i where i.id=v_id;
        else
            v_item:=null;
        end if;
        v_result:=v_result||jsonb_build_object(v_slot,v_item);
    end loop;
    v_result:=v_result||jsonb_build_object('arrow_count',public.combat_inventory_count(p_player,'Arrow'));
    return v_result;
end;
$$;

revoke all on function public.combat_equipment_json(uuid) from public,anon,authenticated;

-- ============================================================
-- VICTORY CHOICE + COMBAT SNAPSHOT
-- ============================================================

alter table public.combat_fights add column if not exists resolution text;
alter table public.combat_fights add column if not exists resolved_at timestamptz;
alter table public.combat_fights add column if not exists stolen_loot jsonb not null default '[]'::jsonb;
alter table public.combat_fights drop constraint if exists combat_fights_resolution_check;
alter table public.combat_fights
    add constraint combat_fights_resolution_check
    check (resolution is null or resolution in ('abandon','steal'));

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
        'resolution',v_f.resolution,'resolved_at',v_f.resolved_at,'stolen_loot',coalesce(v_f.stolen_loot,'[]'::jsonb),
        'attacker',jsonb_build_object(
            'id',v_a.id,'player_number',v_a.player_number,'username',v_a.username,'avatar_url',v_a.avatar_url,
            'character_body_type',coalesce(v_a.character_body_type,'male'),
            'health',v_f.attacker_health,'max_health',v_f.attacker_max_health,
            'strength',v_a.strength,'defence',v_a.defence,'agility',v_a.agility,'accuracy',v_a.accuracy,
            'equipment',public.combat_equipment_json(v_a.id)
        ),
        'defender',jsonb_build_object(
            'id',v_d.id,'player_number',v_d.player_number,'username',v_d.username,'avatar_url',v_d.avatar_url,
            'character_body_type',coalesce(v_d.character_body_type,'male'),
            'health',v_f.defender_health,'max_health',v_f.defender_max_health,
            'strength',v_d.strength,'defence',v_d.defence,'agility',v_d.agility,'accuracy',v_d.accuracy,
            'equipment',public.combat_equipment_json(v_d.id)
        ),
        'logs',v_logs
    );
end;
$$;

revoke all on function public.get_combat_fight(bigint) from public,anon;
grant execute on function public.get_combat_fight(bigint) to authenticated;

create or replace function public.resolve_combat_victory(p_fight_id bigint,p_choice text)
returns jsonb
language plpgsql
security definer
set search_path='public','pg_temp'
as $$
declare
    v_me uuid:=auth.uid();
    v_f public.combat_fights%rowtype;
    v_choice text:=lower(trim(coalesce(p_choice,'')));
    v_loser uuid;
    v_loot jsonb:='[]'::jsonb;
    v_take integer;
    v_remaining integer;
    v_from_backpack integer;
    v_from_cart integer;
    v_destination text;
    r record;
begin
    if v_me is null then raise exception 'Sign in required.'; end if;
    if v_choice not in ('abandon','steal') then raise exception 'Choose Abandon or Steal.'; end if;
    select * into v_f from public.combat_fights where id=p_fight_id for update;
    if not found then raise exception 'Fight not found.'; end if;
    if v_f.status not in ('attacker_won','defender_won') or v_f.winner_id is null then
        raise exception 'This fight does not have a winner.';
    end if;
    if v_f.winner_id<>v_me then raise exception 'Only the winning Viking can make this choice.'; end if;
    if v_f.resolution is not null then return public.get_combat_fight(v_f.id); end if;
    v_loser:=v_f.loser_id;

    if v_choice='steal' then
        for r in
            with backpack as (
                select inv.item_id,sum(inv.quantity)::integer qty
                from public.inventory inv
                join public.items i on i.id=inv.item_id
                where inv.player_id=v_loser and inv.quantity>0 and i.equipment_category is null
                group by inv.item_id
            ), cart as (
                select ci.item_id,sum(ci.quantity)::integer qty
                from public.player_carts pc
                join public.cart_items ci on ci.cart_id=pc.id
                join public.items i on i.id=ci.item_id
                where pc.player_id=v_loser and pc.is_active=true and ci.quantity>0 and i.equipment_category is null
                group by ci.item_id
            )
            select i.id item_id,i.name,coalesce(b.qty,0) backpack_qty,coalesce(c.qty,0) cart_qty,
                   coalesce(b.qty,0)+coalesce(c.qty,0) total_qty
            from public.items i
            left join backpack b on b.item_id=i.id
            left join cart c on c.item_id=i.id
            where coalesce(b.qty,0)+coalesce(c.qty,0)>=10
            order by i.id
        loop
            v_take:=floor(r.total_qty*0.10)::integer;
            if v_take<1 then continue; end if;
            v_remaining:=v_take;
            v_from_backpack:=least(v_remaining,r.backpack_qty);
            if v_from_backpack>0 then
                update public.inventory
                set quantity=quantity-v_from_backpack
                where player_id=v_loser and item_id=r.item_id;
                delete from public.inventory where player_id=v_loser and item_id=r.item_id and quantity<=0;
                v_remaining:=v_remaining-v_from_backpack;
            end if;

            v_from_cart:=v_remaining;
            if v_from_cart>0 then
                update public.cart_items ci
                set quantity=ci.quantity-v_from_cart
                from public.player_carts pc
                where ci.cart_id=pc.id and pc.player_id=v_loser and pc.is_active=true and ci.item_id=r.item_id;
                delete from public.cart_items ci using public.player_carts pc
                where ci.cart_id=pc.id and pc.player_id=v_loser and pc.is_active=true and ci.item_id=r.item_id and ci.quantity<=0;
            end if;

            v_destination:=public.grant_gathered_item(v_me,r.item_id,v_take);
            v_loot:=v_loot||jsonb_build_array(jsonb_build_object(
                'item_id',r.item_id,'name',r.name,'quantity',v_take,
                'source',case when v_from_backpack>0 and v_from_cart>0 then 'Backpack + cart' when v_from_cart>0 then 'active cart' else 'Backpack' end,
                'destination',v_destination
            ));
        end loop;
    end if;

    update public.combat_fights
    set resolution=v_choice,resolved_at=now(),stolen_loot=v_loot
    where id=v_f.id;
    return public.get_combat_fight(v_f.id);
end;
$$;

revoke all on function public.resolve_combat_victory(bigint,text) from public,anon;
grant execute on function public.resolve_combat_victory(bigint,text) to authenticated;

-- ============================================================
-- SERVER-ENFORCED MELEE WEAPON RULE
-- ============================================================

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
    v_actor_melee bigint;
    v_target_melee bigint;
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
    v_actor_melee:=public.combat_equipped_item_id(v_f.attacker_id,'main_hand');

    if p_action in ('slash','stab','shoot') then
        if p_action in ('slash','stab') and v_actor_melee is null then
            raise exception 'Equip a melee weapon before using Slash or Stab.';
        end if;
        v_courage_cost:=case when v_is_donator then 25 else 50 end;
        if coalesce(v_courage,0)<v_courage_cost then raise exception 'You need % Courage for another attack.',v_courage_cost; end if;
        update public.players set courage=greatest(0,courage-v_courage_cost),last_action=now() where id=v_f.attacker_id;

        v_attack_body:=(array['head','torso','left_arm','right_arm','left_hand','right_hand','left_leg','right_leg','left_foot','right_foot'])[1+floor(random()*10)::int];
        v_strike:=public.combat_resolve_strike(v_f.id,v_f.attacker_id,v_f.defender_id,p_action,v_attack_body,v_turn);
        v_target_hp:=greatest(1,v_f.defender_health-coalesce((v_strike->>'damage')::integer,0));
        update public.combat_fights set defender_health=v_target_hp,turn_number=v_turn,last_action_at=now() where id=v_f.id;
        if v_target_hp<=1 then
            perform public.combat_finish_fight(v_f.id,v_f.attacker_id,v_f.defender_id,'attacker_won');
            return public.get_combat_fight(v_f.id);
        end if;
        select count(*)::integer into v_attack_count from public.combat_turns where fight_id=v_f.id and action_type in ('slash','stab','shoot');
        if v_attack_count>=30 then perform public.combat_finish_by_crowd(v_f.id); return public.get_combat_fight(v_f.id); end if;
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
        raise exception 'That action is not available during a fight.';
    end if;

    -- An offline defender may counter with a bow or equipped melee weapon. An
    -- unarmed defender does not magically Slash or Stab with bare hands.
    select public.combat_equipped_item_id(v_f.defender_id,'ranged'),
           public.combat_inventory_count(v_f.defender_id,'Arrow'),
           public.combat_equipped_item_id(v_f.defender_id,'main_hand')
      into v_target_ranged,v_target_arrows,v_target_melee;
    if v_target_ranged is not null and v_target_arrows>0 and random()<0.35 then
        v_counter_action:='shoot';
    elsif v_target_melee is not null then
        v_counter_action:=case when random()<0.50 then 'slash' else 'stab' end;
    else
        v_counter_action:=null;
    end if;

    v_turn:=v_turn+1;
    if v_counter_action is null then
        insert into public.combat_turns(fight_id,turn_number,actor_id,target_id,action_type,hit,message)
        values(v_f.id,v_turn,v_f.defender_id,v_f.attacker_id,'unarmed',false,v_target_name||' had no weapon equipped and could not counterattack.');
        update public.combat_fights set turn_number=v_turn,last_action_at=now() where id=v_f.id;
    else
        v_counter_body:=(array['head','torso','left_arm','right_arm','left_hand','right_hand','left_leg','right_leg','left_foot','right_foot'])[1+floor(random()*10)::int];
        v_counter:=public.combat_resolve_strike(v_f.id,v_f.defender_id,v_f.attacker_id,v_counter_action,v_counter_body,v_turn);
        select attacker_health into v_actor_hp from public.combat_fights where id=v_f.id;
        v_actor_hp:=greatest(1,v_actor_hp-coalesce((v_counter->>'damage')::integer,0));
        update public.combat_fights set attacker_health=v_actor_hp,turn_number=v_turn,last_action_at=now() where id=v_f.id;
        if v_actor_hp<=1 then
            perform public.combat_finish_fight(v_f.id,v_f.defender_id,v_f.attacker_id,'defender_won');
            return public.get_combat_fight(v_f.id);
        end if;
    end if;

    select count(*)::integer into v_attack_count from public.combat_turns where fight_id=v_f.id and action_type in ('slash','stab','shoot');
    if v_attack_count>=30 then perform public.combat_finish_by_crowd(v_f.id); end if;
    return public.get_combat_fight(v_f.id);
end;
$$;

revoke all on function public.perform_combat_action(bigint,text,text) from public,anon;
grant execute on function public.perform_combat_action(bigint,text,text) to authenticated;

-- ============================================================
-- VILLAGE PATRONS + SILVER ADVANCES
-- ============================================================

create table if not exists public.player_viking_patron_accounts (
    player_id uuid not null references public.players(id) on delete cascade,
    contact_id bigint not null references public.viking_mission_contacts(id) on delete cascade,
    advance_count integer not null default 0 check (advance_count>=0),
    jobs_owed integer not null default 0 check (jobs_owed between 0 and 10),
    total_silver_advanced bigint not null default 0 check (total_silver_advanced>=0),
    last_advance_at timestamptz,
    updated_at timestamptz not null default now(),
    primary key(player_id,contact_id)
);

create index if not exists player_viking_patron_accounts_contact_idx
on public.player_viking_patron_accounts(contact_id);

alter table public.player_viking_patron_accounts enable row level security;
drop policy if exists "own patron account readable" on public.player_viking_patron_accounts;
create policy "own patron account readable"
on public.player_viking_patron_accounts for select to authenticated
using ((select auth.uid())=player_id);

update public.viking_mission_contacts set
    role_title=case contact_no
        when 1 then 'Keeper of Winter Debts' when 2 then 'Master of Coin and Favours'
        when 3 then 'Mistress of the Grain Stores' when 4 then 'Lord of the Docks'
        when 5 then 'Mistress of the Wild Paths' when 6 then 'Master of Iron Debts'
        when 7 then 'Keeper of Secrets' when 8 then 'The Jarl''s Fixer'
        when 9 then 'Mistress of Ships and Smuggling' else 'The Jarl''s Shadow' end,
    personality=case contact_no
        when 1 then 'Protective, calculating and never forgets a favour'
        when 2 then 'Charming, sharp-eyed and always knows who owes whom'
        when 3 then 'Fiercely loyal to her people and ruthless with shortages'
        when 4 then 'Loud, connected and obeyed on every jetty'
        when 5 then 'Quiet, watchful and dangerous to disappoint'
        when 6 then 'Gruff, proud and feared by anyone owing iron or silver'
        when 7 then 'Soft-spoken, secretive and impossible to deceive'
        when 8 then 'Polite, political and able to make problems disappear'
        when 9 then 'Inventive, stubborn and connected across every sea route'
        else 'Calm, respected and trusted with the Jarl''s hardest business' end,
    intro_text=case contact_no
        when 1 then 'When winter leaves a household without silver for food, cloth or a roof, they come to me. I help them now. In return, reliable Vikings settle the favours later.'
        when 2 then 'Every trader has a bad season. I provide silver when the market turns against them, then collect useful work once they are standing again.'
        when 3 then 'A failed harvest can ruin a family. I open my stores before children go hungry, but the village repays what it owes through honest work.'
        when 4 then 'Sailors lose cargo, ships and wages. I keep their families fed and their berths safe. My people repay me by keeping these docks moving.'
        when 5 then 'Hunters vanish and widows still need meat and firewood. I make sure help arrives. Those under my protection return the favour when called.'
        when 6 then 'Broken tools stop wages and empty purses do not buy iron. I advance what a worker needs, then put capable hands to work in my network.'
        when 7 then 'People come to me with troubles they cannot speak aloud. Sometimes silver solves them. Sometimes a quiet favour does.'
        when 8 then 'When taxes, debts or powerful enemies corner someone, I arrange a way out. Afterwards, that person works for the network that saved them.'
        when 9 then 'A lost ship can bankrupt three families before sunset. I cover the loss and keep them afloat. My favours travel farther than any longship.'
        else 'The Jarl cannot openly help everyone who needs him. I can. Take support when you need it, but understand that important favours will follow.' end
where is_active=true;

update public.viking_mission_catalog m set
    title=(case ((m.mission_no-1)/10)+1
        when 1 then 'Repay a Small Favour' when 2 then 'Word from the Patron'
        when 3 then 'Protect the Winter Stores' when 4 then 'A Household Needs Help'
        when 5 then 'No Questions Asked' when 6 then 'Collect What Is Owed'
        when 7 then 'A Quiet Delivery' when 8 then 'Trusted Work'
        when 9 then 'Serious Business' else 'Settle the Account' end)||' #'||m.mission_no,
    story_text=case (m.mission_no%6)
        when 0 then c.name||' says, “A family came to me with no silver left for food or shelter. I covered what they owed. Bring these supplies and help me keep them standing.”'
        when 1 then c.name||' says, “I helped someone before their children went hungry. They owe me a favour, and today I am asking you to carry part of it.”'
        when 2 then c.name||' says, “One of my people could not pay what was due. I settled the account. Now bring me what I need and we will call this job done.”'
        when 3 then c.name||' says, “Protection is more than carrying a weapon. It means making sure people under my name survive the winter. Get these supplies.”'
        when 4 then c.name||' says, “Do not ask who needs this or why. They asked me for help, I gave it, and now I am asking you.”'
        else c.name||' says, “When you needed support, my door stayed open. Keep proving that my trust in you was worth the silver.”' end
from public.viking_mission_contacts c
where c.id=m.contact_id;

update public.viking_mission_bonus_catalog b set
    title='Private Patron Favour #'||(b.after_mission_no/10),
    story_text=c.name||' lowers their voice. “Someone under my protection has a problem that cannot become public. Handle it quietly and the extra payment is yours.”'
from public.viking_mission_contacts c
where c.id=b.contact_id;

create or replace function public.accept_viking_patron_advance(p_contact_no integer)
returns jsonb
language plpgsql
security definer
set search_path='public','pg_temp'
as $$
declare
    v_player uuid:=auth.uid();
    v_contact public.viking_mission_contacts%rowtype;
    v_progress public.player_viking_mission_progress%rowtype;
    v_previous integer:=100;
    v_existing_owed integer:=0;
    v_jobs integer;
    v_advance integer;
begin
    if v_player is null then raise exception 'Sign in required.'; end if;
    select * into v_contact from public.viking_mission_contacts where contact_no=p_contact_no and is_active=true;
    if not found then raise exception 'Patron not found.'; end if;
    if p_contact_no>1 then
        select coalesce(pr.main_completed,0) into v_previous
        from public.viking_mission_contacts c
        left join public.player_viking_mission_progress pr on pr.contact_id=c.id and pr.player_id=v_player
        where c.contact_no=p_contact_no-1;
        if coalesce(v_previous,0)<100 then raise exception 'This patron is still locked.'; end if;
    end if;
    insert into public.player_viking_mission_progress(player_id,contact_id) values(v_player,v_contact.id) on conflict do nothing;
    select * into v_progress from public.player_viking_mission_progress where player_id=v_player and contact_id=v_contact.id for update;
    if v_progress.next_mission_no>100 then raise exception 'You have finished every favour for this patron.'; end if;
    insert into public.player_viking_patron_accounts(player_id,contact_id) values(v_player,v_contact.id) on conflict do nothing;
    select jobs_owed into v_existing_owed from public.player_viking_patron_accounts where player_id=v_player and contact_id=v_contact.id for update;
    if coalesce(v_existing_owed,0)>0 then raise exception 'You still owe % jobs to this patron.',v_existing_owed; end if;

    v_jobs:=least(10,101-v_progress.next_mission_no);
    v_advance:=v_contact.base_silver*10;
    update public.player_viking_patron_accounts set
        advance_count=advance_count+1,jobs_owed=v_jobs,
        total_silver_advanced=total_silver_advanced+v_advance,
        last_advance_at=now(),updated_at=now()
    where player_id=v_player and contact_id=v_contact.id;
    update public.players set silver=coalesce(silver,0)+v_advance where id=v_player;
    return jsonb_build_object('patron_name',v_contact.name,'advance_silver',v_advance,'jobs_owed',v_jobs);
end;
$$;

revoke all on function public.accept_viking_patron_advance(integer) from public,anon;
grant execute on function public.accept_viking_patron_advance(integer) to authenticated;

create or replace function public.get_my_viking_missions()
returns jsonb language plpgsql security definer set search_path='public','pg_temp' as $$
declare
  v_player uuid:=auth.uid(); v_daily integer:=0; v_contacts jsonb;
begin
  if v_player is null then raise exception 'Sign in required.'; end if;
  insert into public.player_viking_mission_daily(player_id,mission_date,main_completed) values(v_player,current_date,0) on conflict do nothing;
  select main_completed into v_daily from public.player_viking_mission_daily where player_id=v_player and mission_date=current_date;
  insert into public.player_viking_mission_progress(player_id,contact_id) select v_player,id from public.viking_mission_contacts c where c.is_active=true on conflict do nothing;
  insert into public.player_viking_patron_accounts(player_id,contact_id) select v_player,id from public.viking_mission_contacts c where c.is_active=true on conflict do nothing;

  select coalesce(jsonb_agg(contact_payload order by contact_no),'[]'::jsonb) into v_contacts from (
    select c.contact_no,jsonb_build_object(
      'contact_no',c.contact_no,'name',c.name,'role_title',c.role_title,'personality',c.personality,'intro_text',c.intro_text,
      'base_silver',c.base_silver,'icon',c.icon,
      'unlocked',case when c.contact_no=1 then true else coalesce(prev.main_completed,0)>=100 end,
      'main_completed',coalesce(pr.main_completed,0),'next_mission_no',coalesce(pr.next_mission_no,1),
      'patron_advance_amount',c.base_silver*10,'patron_jobs_per_advance',least(10,greatest(0,101-coalesce(pr.next_mission_no,1))),
      'patron_jobs_owed',coalesce(pa.jobs_owed,0),'patron_advance_count',coalesce(pa.advance_count,0),
      'patron_advance_available',coalesce(pa.jobs_owed,0)=0 and coalesce(pr.next_mission_no,1)<=100,
      'current_mission',case when coalesce(pr.next_mission_no,1)<=100 then (
        select jsonb_build_object('mission_no',m.mission_no,'title',m.title,'story_text',m.story_text,
          'request_item_name',m.request_item_name,'request_quantity',m.request_quantity,
          'owned_quantity',public.tutorial_named_item_quantity(v_player,m.request_item_name),
          'reward_silver',m.reward_silver,'reward_item_name',m.reward_item_name,'reward_item_quantity',m.reward_item_quantity)
        from public.viking_mission_catalog m where m.contact_id=c.id and m.mission_no=pr.next_mission_no
      ) else null end,
      'available_bonuses',coalesce((select jsonb_agg(jsonb_build_object(
        'after_mission_no',b.after_mission_no,'title',bc.title,
        'story_text',case when cameo.username is not null then bc.story_text||' Ask for '||cameo.username||' when you are ready.' else bc.story_text end,
        'cameo_username',cameo.username,'request_item_name',bc.request_item_name,'request_quantity',bc.request_quantity,
        'owned_quantity',public.tutorial_named_item_quantity(v_player,bc.request_item_name),
        'reward_silver',bc.reward_silver,'reward_item_name',bc.reward_item_name,'reward_item_quantity',bc.reward_item_quantity))
        from public.player_viking_mission_bonus b
        join public.viking_mission_bonus_catalog bc on bc.contact_id=b.contact_id and bc.after_mission_no=b.after_mission_no
        left join public.players cameo on cameo.id=b.cameo_player_id
        where b.player_id=v_player and b.contact_id=c.id and b.status='available'),'[]'::jsonb)
    ) contact_payload
    from public.viking_mission_contacts c
    join public.player_viking_mission_progress pr on pr.player_id=v_player and pr.contact_id=c.id
    join public.player_viking_patron_accounts pa on pa.player_id=v_player and pa.contact_id=c.id
    left join public.viking_mission_contacts pc on pc.contact_no=c.contact_no-1
    left join public.player_viking_mission_progress prev on prev.player_id=v_player and prev.contact_id=pc.id
    where c.is_active=true
  ) q;
  return jsonb_build_object('daily_completed',v_daily,'daily_limit',5,'reset_at',(current_date+1)::timestamptz,'contacts',v_contacts);
end;
$$;

revoke all on function public.get_my_viking_missions() from public,anon;
grant execute on function public.get_my_viking_missions() to authenticated;

create or replace function public.complete_viking_mission(p_contact_no integer)
returns jsonb language plpgsql security definer set search_path='public','pg_temp' as $$
declare
  v_player uuid:=auth.uid(); v_contact public.viking_mission_contacts%rowtype; v_progress public.player_viking_mission_progress%rowtype;
  v_mission public.viking_mission_catalog%rowtype; v_daily integer; v_prev_completed integer:=100; v_cameo uuid; v_destination text;
  v_repaid boolean:=false; v_jobs_after integer:=0;
begin
  if v_player is null then raise exception 'Sign in required.'; end if;
  select * into v_contact from public.viking_mission_contacts where contact_no=p_contact_no and is_active=true;
  if not found then raise exception 'Patron not found.'; end if;
  if p_contact_no>1 then
    select coalesce(pr.main_completed,0) into v_prev_completed from public.viking_mission_contacts c
    left join public.player_viking_mission_progress pr on pr.contact_id=c.id and pr.player_id=v_player where c.contact_no=p_contact_no-1;
    if coalesce(v_prev_completed,0)<100 then raise exception 'This patron is still locked.'; end if;
  end if;
  insert into public.player_viking_mission_progress(player_id,contact_id) values(v_player,v_contact.id) on conflict do nothing;
  insert into public.player_viking_patron_accounts(player_id,contact_id) values(v_player,v_contact.id) on conflict do nothing;
  select * into v_progress from public.player_viking_mission_progress where player_id=v_player and contact_id=v_contact.id for update;
  if v_progress.next_mission_no>100 then raise exception 'You have completed every favour for this patron.'; end if;
  select * into v_mission from public.viking_mission_catalog where contact_id=v_contact.id and mission_no=v_progress.next_mission_no;
  insert into public.player_viking_mission_daily(player_id,mission_date,main_completed) values(v_player,current_date,0) on conflict do nothing;
  select main_completed into v_daily from public.player_viking_mission_daily where player_id=v_player and mission_date=current_date for update;
  if v_daily>=5 then raise exception 'You have completed your five main favours for today. Come back after midnight.'; end if;

  perform public.consume_named_shared_item(v_player,v_mission.request_item_name,v_mission.request_quantity);
  update public.players set silver=coalesce(silver,0)+v_mission.reward_silver where id=v_player;
  v_destination:=public.grant_named_mission_reward(v_player,v_mission.reward_item_name,v_mission.reward_item_quantity);
  update public.player_viking_mission_progress set next_mission_no=next_mission_no+1,main_completed=main_completed+1,updated_at=now() where player_id=v_player and contact_id=v_contact.id;
  update public.player_viking_mission_daily set main_completed=main_completed+1 where player_id=v_player and mission_date=current_date;
  insert into public.player_viking_mission_history(player_id,contact_id,mission_no,reward_silver,reward_item_name,reward_item_quantity)
    values(v_player,v_contact.id,v_mission.mission_no,v_mission.reward_silver,v_mission.reward_item_name,v_mission.reward_item_quantity);

  update public.player_viking_patron_accounts set jobs_owed=greatest(0,jobs_owed-1),updated_at=now()
  where player_id=v_player and contact_id=v_contact.id and jobs_owed>0
  returning true,jobs_owed into v_repaid,v_jobs_after;
  v_repaid:=coalesce(v_repaid,false);
  if not v_repaid then select coalesce(jobs_owed,0) into v_jobs_after from public.player_viking_patron_accounts where player_id=v_player and contact_id=v_contact.id; end if;

  if v_mission.mission_no%10=0 then
    select p.id into v_cameo from public.players p where p.id<>v_player and p.last_online<now()-interval '30 days' order by random() limit 1;
    insert into public.player_viking_mission_bonus(player_id,contact_id,after_mission_no,cameo_player_id)
      values(v_player,v_contact.id,v_mission.mission_no,v_cameo) on conflict(player_id,contact_id,after_mission_no) do nothing;
  end if;
  return jsonb_build_object('completed',true,'mission_no',v_mission.mission_no,'reward_silver',v_mission.reward_silver,
    'reward_item_name',v_mission.reward_item_name,'reward_item_quantity',v_mission.reward_item_quantity,
    'reward_destination',v_destination,'daily_completed',v_daily+1,'bonus_unlocked',(v_mission.mission_no%10=0),
    'favour_job_repaid',v_repaid,'patron_jobs_owed',coalesce(v_jobs_after,0));
end;
$$;

revoke all on function public.complete_viking_mission(integer) from public,anon;
grant execute on function public.complete_viking_mission(integer) to authenticated;

commit;
