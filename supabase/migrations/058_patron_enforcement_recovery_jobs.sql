-- Midgard Legacy Update 058
-- Varied patron/client favours plus mission-only enforcement fights.
-- Run after 057_character_dolls_patron_favours_weapon_rules.sql.

begin;

-- ============================================================
-- MISSION TYPES AND CLIENT STORIES
-- ============================================================

alter table public.viking_mission_catalog
    add column if not exists mission_type text not null default 'delivery',
    add column if not exists client_name text,
    add column if not exists deal_item_name text,
    add column if not exists deal_item_quantity integer,
    add column if not exists recovery_item_name text,
    add column if not exists recovery_quantity integer;

alter table public.viking_mission_catalog
    drop constraint if exists viking_mission_catalog_mission_type_check;
alter table public.viking_mission_catalog
    add constraint viking_mission_catalog_mission_type_check
    check (mission_type in ('delivery','enforcement'));

alter table public.viking_mission_catalog
    drop constraint if exists viking_mission_catalog_deal_quantity_check;
alter table public.viking_mission_catalog
    add constraint viking_mission_catalog_deal_quantity_check
    check (deal_item_quantity is null or deal_item_quantity > 0);

alter table public.viking_mission_catalog
    drop constraint if exists viking_mission_catalog_recovery_quantity_check;
alter table public.viking_mission_catalog
    add constraint viking_mission_catalog_recovery_quantity_check
    check (recovery_quantity is null or recovery_quantity > 0);

-- Patrons are underworld problem-solvers. Helping someone through a hard winter
-- is one possible favour, rather than the theme of every mission.
update public.viking_mission_contacts
set role_title=case contact_no
        when 1 then 'Mistress of Cloth and Favours'
        when 2 then 'Broker of Coin and Debts'
        when 3 then 'Mistress of Stores and Protection'
        when 4 then 'Lord of the Docks'
        when 5 then 'Mistress of the Wild Paths'
        when 6 then 'Master of Iron Debts'
        when 7 then 'Keeper of Secrets'
        when 8 then 'The Jarl''s Fixer'
        when 9 then 'Mistress of Ships and Smuggling'
        else 'The Jarl''s Shadow' end,
    intro_text=case contact_no
        when 1 then 'People bring me broken bargains, missing goods and problems they cannot settle alone. I provide help, silver or protection. You make sure my favours are respected.'
        when 2 then 'Traders come to me when a deal fails or a debtor disappears. I keep their businesses alive, then send reliable Vikings to balance the account.'
        when 3 then 'Farmers, brewers and families under my protection bring their troubles here. Sometimes they need supplies. Sometimes someone needs a harder reminder.'
        when 4 then 'Every dockside bargain leaves a winner and a liar. My clients pay for cargo, protection and problems handled before the next tide.'
        when 5 then 'People disappear into the wild with goods that are not theirs. I know the paths they use, and I know who can bring those goods back.'
        when 6 then 'A promise over iron is still a promise. I fund tools and work when needed, then collect from anyone foolish enough to break their word.'
        when 7 then 'Clients tell me what they cannot tell the Jarl. I arrange quiet deliveries, private help and the occasional forceful collection.'
        when 8 then 'Merchants, workers and minor nobles come to me when ordinary rules fail them. I arrange a solution and decide who carries it out.'
        when 9 then 'Cargo vanishes, captains lie and families lose everything. I keep my clients afloat and recover what others try to steal from them.'
        else 'The Jarl cannot openly solve every dispute. I can. My clients receive help; the people who cross them receive a visit.' end
where is_active=true;

with shaped as (
    select m.id,m.mission_no,c.contact_no,c.name patron_name,
        case ((m.mission_no+c.contact_no)%12)
            when 0 then 'Alva the Dyer' when 1 then 'Bjarni the Tanner'
            when 2 then 'Cnut the Brewer' when 3 then 'Dagrun the Baker'
            when 4 then 'Eydis the Chandler' when 5 then 'Finn the Cooper'
            when 6 then 'Gudrun the Midwife' when 7 then 'Hallvard the Drover'
            when 8 then 'Inga the Potter' when 9 then 'Jorund the Miller'
            when 10 then 'Kari the Fisher' else 'Liv the Alewife' end client_name,
        case when c.contact_no=1 and m.mission_no=5 then 'Birch Log'
            else (array['Birch Log','Wool','Iron Bar','Bog Iron','Nettle Cordage','Arrow'])[1+((m.mission_no+c.contact_no)%6)] end deal_item,
        case when c.contact_no=1 and m.mission_no=5 then 10
            else 5+(((m.mission_no-1)/10)+1)*2+c.contact_no end deal_quantity,
        case when c.contact_no=1 and m.mission_no=5 then 'Feather'
            else (array['Feather','Egg','Wool','Arrow','Bog Iron','Nettle Cordage'])[1+((m.mission_no+c.contact_no*2)%6)] end recovery_item,
        case when c.contact_no=1 and m.mission_no=5 then 100
            else 40+(((m.mission_no-1)/10)+1)*10+c.contact_no*5 end recovery_quantity
    from public.viking_mission_catalog m
    join public.viking_mission_contacts c on c.id=m.contact_id
)
update public.viking_mission_catalog m
set mission_type=case when m.mission_no%5=0 then 'enforcement' else 'delivery' end,
    client_name=s.client_name,
    deal_item_name=case when m.mission_no%5=0 then s.deal_item else null end,
    deal_item_quantity=case when m.mission_no%5=0 then s.deal_quantity else null end,
    recovery_item_name=case when m.mission_no%5=0 then s.recovery_item else null end,
    recovery_quantity=case when m.mission_no%5=0 then s.recovery_quantity else null end,
    request_item_name=case when m.mission_no%5=0 then s.recovery_item else m.request_item_name end,
    request_quantity=case when m.mission_no%5=0 then s.recovery_quantity else m.request_quantity end,
    title=case when m.mission_no%5=0
        then 'Collect What Is Owed #'||m.mission_no
        else (case (m.mission_no%8)
            when 0 then 'A Client Needs Supplies' when 1 then 'A Quiet Purchase'
            when 2 then 'Replace Missing Cargo' when 3 then 'Keep a Business Moving'
            when 4 then 'A Favour for a Friend' when 6 then 'Settle a Supply Debt'
            when 7 then 'Goods for the Network' else 'Trusted Work' end)||' #'||m.mission_no end,
    story_text=case when m.mission_no%5=0 then
        s.patron_name||' has accepted a client''s complaint about a bargain that was never honoured. The goods must be recovered directly from the person who kept them.'
      else case (m.mission_no%7)
        when 0 then s.client_name||' asked '||s.patron_name||' to replace a shipment that vanished before it reached the village. Bring the requested supplies and keep the client''s business moving.'
        when 1 then s.client_name||' needs these goods but cannot be seen buying them openly. '||s.patron_name||' wants you to make the purchase and deliver it quietly.'
        when 2 then s.client_name||' paid a supplier who arrived with only half the order. '||s.patron_name||' covered the shortage and wants you to find the rest.'
        when 3 then s.client_name||' owes '||s.patron_name||' a favour and is paying it through useful goods. Collect the requested amount for the patron''s network.'
        when 4 then s.client_name||' had tools and stock ruined during a dockside argument. '||s.patron_name||' promised replacements if you can bring the materials.'
        when 5 then s.client_name||' is opening a new stall under '||s.patron_name||'''s protection. Bring the first supplies and remind everyone whose support made it possible.'
        else s.client_name||' came to '||s.patron_name||' with a private problem. No violence is needed this time—just bring the requested goods without asking unnecessary questions.' end
      end
from shaped s
where s.id=m.id;

-- ============================================================
-- PLAYER-SPECIFIC ENFORCEMENT ASSIGNMENTS AND FIGHTS
-- ============================================================

create table if not exists public.player_viking_enforcement_jobs (
    id bigserial primary key,
    player_id uuid not null references public.players(id) on delete cascade,
    contact_id bigint not null references public.viking_mission_contacts(id) on delete cascade,
    mission_no integer not null check (mission_no between 1 and 100),
    target_name text not null,
    target_body_type text not null default 'male' check (target_body_type in ('male','female')),
    recovery_item_id bigint not null references public.items(id),
    recovery_quantity integer not null check (recovery_quantity > 0),
    state text not null default 'assigned' check (state in ('assigned','fighting','recovered','completed')),
    assigned_at timestamptz not null default now(),
    recovered_at timestamptz,
    completed_at timestamptz,
    updated_at timestamptz not null default now(),
    unique(player_id,contact_id,mission_no)
);

create index if not exists player_viking_enforcement_jobs_contact_mission_idx
on public.player_viking_enforcement_jobs(contact_id,mission_no);
create index if not exists player_viking_enforcement_jobs_recovery_item_idx
on public.player_viking_enforcement_jobs(recovery_item_id);

create table if not exists public.viking_enforcement_fights (
    id bigserial primary key,
    assignment_id bigint not null references public.player_viking_enforcement_jobs(id) on delete cascade,
    player_id uuid not null references public.players(id) on delete cascade,
    target_name text not null,
    target_body_type text not null check (target_body_type in ('male','female')),
    attacker_health integer not null check (attacker_health >= 1),
    attacker_max_health integer not null check (attacker_max_health >= 1),
    target_health integer not null check (target_health >= 1),
    target_max_health integer not null check (target_max_health >= 1),
    attacker_strength bigint not null,
    attacker_defence bigint not null,
    attacker_agility bigint not null,
    attacker_accuracy bigint not null,
    target_strength bigint not null,
    target_defence bigint not null,
    target_agility bigint not null,
    target_accuracy bigint not null,
    attacker_gear_defence integer not null default 0,
    target_gear_defence integer not null default 0,
    attacker_equipment jsonb not null default '{}'::jsonb,
    target_equipment jsonb not null default '{}'::jsonb,
    status text not null default 'active' check (status in ('active','player_won','target_won','player_fled','crowd_intervened')),
    turn_number integer not null default 0,
    resolution text check (resolution is null or resolution in ('abandon','steal')),
    stolen_loot jsonb not null default '[]'::jsonb,
    started_at timestamptz not null default now(),
    ended_at timestamptz,
    resolved_at timestamptz,
    last_action_at timestamptz not null default now()
);

create index if not exists viking_enforcement_fights_assignment_idx
on public.viking_enforcement_fights(assignment_id,id desc);
create index if not exists viking_enforcement_fights_player_idx
on public.viking_enforcement_fights(player_id,id desc);
create unique index if not exists viking_enforcement_one_active_fight_idx
on public.viking_enforcement_fights(player_id) where status='active';

create table if not exists public.viking_enforcement_turns (
    id bigserial primary key,
    fight_id bigint not null references public.viking_enforcement_fights(id) on delete cascade,
    turn_number integer not null,
    actor_side text not null check (actor_side in ('player','target')),
    action_type text not null,
    body_part text,
    hit boolean not null default false,
    critical boolean not null default false,
    damage integer not null default 0,
    message text not null,
    created_at timestamptz not null default now()
);

create index if not exists viking_enforcement_turns_fight_idx
on public.viking_enforcement_turns(fight_id,id);

alter table public.player_viking_enforcement_jobs enable row level security;
alter table public.viking_enforcement_fights enable row level security;
alter table public.viking_enforcement_turns enable row level security;

revoke all on public.player_viking_enforcement_jobs from public,anon,authenticated;
revoke all on public.viking_enforcement_fights from public,anon,authenticated;
revoke all on public.viking_enforcement_turns from public,anon,authenticated;

-- All three tables are RPC-only. RLS is still enabled as defence in depth.

create schema if not exists private_api;
revoke all on schema private_api from public,anon,authenticated;

create or replace function private_api.ensure_patron_enforcement_job(
    p_player uuid,
    p_contact_id bigint,
    p_mission_no integer
)
returns bigint
language plpgsql
security definer
set search_path='public','private_api','pg_temp'
as $$
declare
    v_catalog public.viking_mission_catalog%rowtype;
    v_existing bigint;
    v_item bigint;
    v_names text[]:=array[
        'Rolf Quick-Hand','Sten Fox-Eye','Orm the Crooked','Haldor Red-Knife',
        'Ulf No-Word','Ketil Black-Tooth','Brand One-Eye','Njal the Eel',
        'Skarde Ash-Hand','Torfi the Liar','Viggo Split-Lip','Aslak Crow-Bones'
    ];
    v_target text;
    v_body text;
begin
    if (select auth.uid()) is null or (select auth.uid())<>p_player then
        raise exception 'This assignment does not belong to you.';
    end if;

    select * into v_catalog
    from public.viking_mission_catalog
    where contact_id=p_contact_id and mission_no=p_mission_no;
    if not found or v_catalog.mission_type<>'enforcement' then
        raise exception 'This is not an enforcement favour.';
    end if;

    select id into v_existing
    from public.player_viking_enforcement_jobs
    where player_id=p_player and contact_id=p_contact_id and mission_no=p_mission_no;
    if v_existing is not null then return v_existing; end if;

    select id into v_item
    from public.items
    where lower(name)=lower(v_catalog.recovery_item_name)
    order by id
    limit 1;
    if v_item is null then
        raise exception 'The recovery item % is not available in the item catalog.',v_catalog.recovery_item_name;
    end if;

    v_target:=v_names[1+floor(random()*array_length(v_names,1))::integer];
    v_body:=case when random()<0.5 then 'male' else 'female' end;

    insert into public.player_viking_enforcement_jobs(
        player_id,contact_id,mission_no,target_name,target_body_type,recovery_item_id,recovery_quantity
    ) values(
        p_player,p_contact_id,p_mission_no,v_target,v_body,v_item,v_catalog.recovery_quantity
    )
    on conflict(player_id,contact_id,mission_no) do nothing
    returning id into v_existing;

    if v_existing is null then
        select id into v_existing
        from public.player_viking_enforcement_jobs
        where player_id=p_player and contact_id=p_contact_id and mission_no=p_mission_no;
    end if;
    return v_existing;
end;
$$;

revoke all on function private_api.ensure_patron_enforcement_job(uuid,bigint,integer)
from public,anon,authenticated;

create or replace function public.get_patron_enforcement_fight(p_fight_id bigint)
returns jsonb
language plpgsql
security definer
set search_path='public','private_api','pg_temp'
as $$
declare
    v_me uuid:=(select auth.uid());
    v_f public.viking_enforcement_fights%rowtype;
    v_job public.player_viking_enforcement_jobs%rowtype;
    v_player public.players%rowtype;
    v_contact public.viking_mission_contacts%rowtype;
    v_item public.items%rowtype;
    v_logs jsonb;
    v_public_status text;
begin
    if v_me is null then raise exception 'Sign in required.'; end if;
    select * into v_f
    from public.viking_enforcement_fights
    where id=p_fight_id and player_id=v_me;
    if not found then raise exception 'Patron fight not found.'; end if;

    select * into v_job from public.player_viking_enforcement_jobs where id=v_f.assignment_id;
    select * into v_player from public.players where id=v_me;
    select * into v_contact from public.viking_mission_contacts where id=v_job.contact_id;
    select * into v_item from public.items where id=v_job.recovery_item_id;
    select coalesce(jsonb_agg(jsonb_build_object(
        'id',t.id,'turn_number',t.turn_number,'actor_side',t.actor_side,
        'action_type',t.action_type,'body_part',t.body_part,'hit',t.hit,
        'critical',t.critical,'damage',t.damage,'message',t.message,'created_at',t.created_at
    ) order by t.id),'[]'::jsonb)
    into v_logs
    from public.viking_enforcement_turns t
    where t.fight_id=v_f.id;

    v_public_status:=case v_f.status
        when 'player_won' then 'attacker_won'
        when 'target_won' then 'defender_won'
        when 'player_fled' then 'attacker_fled'
        else v_f.status end;

    return jsonb_build_object(
        'mode','patron_enforcement','fight_id',v_f.id,'status',v_public_status,
        'winner_id',case when v_f.status='player_won' then v_me else null end,
        'loser_id',null,'started_at',v_f.started_at,'ended_at',v_f.ended_at,
        'turn_number',v_f.turn_number,'resolution',v_f.resolution,
        'resolved_at',v_f.resolved_at,'stolen_loot',coalesce(v_f.stolen_loot,'[]'::jsonb),
        'job',jsonb_build_object(
            'assignment_id',v_job.id,'contact_no',v_contact.contact_no,'patron_name',v_contact.name,
            'mission_no',v_job.mission_no,'target_name',v_job.target_name,'state',v_job.state,
            'recovery_item_name',v_item.name,'recovery_quantity',v_job.recovery_quantity
        ),
        'attacker',jsonb_build_object(
            'id',v_player.id,'player_number',v_player.player_number,'username',v_player.username,
            'avatar_url',v_player.avatar_url,'character_body_type',coalesce(v_player.character_body_type,'male'),
            'health',v_f.attacker_health,'max_health',v_f.attacker_max_health,
            'strength',v_f.attacker_strength,'defence',v_f.attacker_defence,
            'agility',v_f.attacker_agility,'accuracy',v_f.attacker_accuracy,
            'equipment',v_f.attacker_equipment
        ),
        'defender',jsonb_build_object(
            'id','patron-target-'||v_job.id,'player_number',null,'username',v_f.target_name,
            'avatar_url',null,'character_body_type',v_f.target_body_type,
            'health',v_f.target_health,'max_health',v_f.target_max_health,
            'strength',v_f.target_strength,'defence',v_f.target_defence,
            'agility',v_f.target_agility,'accuracy',v_f.target_accuracy,
            'equipment',v_f.target_equipment
        ),
        'logs',v_logs
    );
end;
$$;

revoke all on function public.get_patron_enforcement_fight(bigint) from public,anon;
grant execute on function public.get_patron_enforcement_fight(bigint) to authenticated;

create or replace function public.start_patron_enforcement(p_contact_no integer)
returns jsonb
language plpgsql
security definer
set search_path='public','private_api','pg_temp'
as $$
declare
    v_me uuid:=(select auth.uid());
    v_player public.players%rowtype;
    v_contact public.viking_mission_contacts%rowtype;
    v_progress public.player_viking_mission_progress%rowtype;
    v_mission public.viking_mission_catalog%rowtype;
    v_job public.player_viking_enforcement_jobs%rowtype;
    v_previous integer:=100;
    v_job_id bigint;
    v_fight_id bigint;
    v_existing_fight_id bigint;
    v_existing_assignment_id bigint;
    v_player_equipment jsonb;
    v_target_equipment jsonb;
    v_start_health integer;
begin
    if v_me is null then raise exception 'Sign in required.'; end if;
    select * into v_contact
    from public.viking_mission_contacts
    where contact_no=p_contact_no and is_active=true;
    if not found then raise exception 'Patron not found.'; end if;

    if p_contact_no>1 then
        select coalesce(pr.main_completed,0) into v_previous
        from public.viking_mission_contacts c
        left join public.player_viking_mission_progress pr
          on pr.contact_id=c.id and pr.player_id=v_me
        where c.contact_no=p_contact_no-1;
        if coalesce(v_previous,0)<100 then raise exception 'This patron is still locked.'; end if;
    end if;

    insert into public.player_viking_mission_progress(player_id,contact_id)
    values(v_me,v_contact.id) on conflict do nothing;
    select * into v_progress
    from public.player_viking_mission_progress
    where player_id=v_me and contact_id=v_contact.id
    for update;
    select * into v_mission
    from public.viking_mission_catalog
    where contact_id=v_contact.id and mission_no=v_progress.next_mission_no;
    if not found or v_mission.mission_type<>'enforcement' then
        raise exception 'Your current favour for this patron is not an enforcement job.';
    end if;

    v_job_id:=private_api.ensure_patron_enforcement_job(v_me,v_contact.id,v_mission.mission_no);
    select * into v_job
    from public.player_viking_enforcement_jobs
    where id=v_job_id for update;
    if v_job.state='recovered' then raise exception 'You already recovered the client''s goods. Return them to your patron.'; end if;
    if v_job.state='completed' then raise exception 'This enforcement job is already complete.'; end if;

    select id,assignment_id into v_existing_fight_id,v_existing_assignment_id
    from public.viking_enforcement_fights
    where player_id=v_me and status='active'
    order by id desc limit 1;
    if v_existing_fight_id is not null then
        if v_existing_assignment_id=v_job.id then return public.get_patron_enforcement_fight(v_existing_fight_id); end if;
        raise exception 'Finish your current patron fight first.';
    end if;
    if exists(select 1 from public.combat_fights where attacker_id=v_me and status='active') then
        raise exception 'Finish your current player battle first.';
    end if;

    select * into v_player from public.players where id=v_me for update;
    if coalesce(v_player.is_free_man,false)=false then raise exception 'Earn your freedom before taking enforcement jobs.'; end if;
    if v_player.hospital_until is not null and v_player.hospital_until>now() then raise exception 'You cannot fight while in the healer hut.'; end if;
    if coalesce(v_player.health,0)<=1 then raise exception 'You are too injured to fight.'; end if;

    v_start_health:=greatest(2,coalesce(v_player.health,1));
    v_player_equipment:=public.combat_equipment_json(v_me);
    v_target_equipment:=jsonb_build_object(
        'main_hand',jsonb_build_object('id',null,'name','Iron Hand Axe','slot','main_hand','damage',11,'defence',0,'accuracy',0),
        'head',null,'body',null,'armour',null,'legs',null,'feet',null,
        'off_hand',null,'defence',null,'ranged',null,'ammo',null,
        'accessory',null,'utility',null,'arrow_count',0
    );

    insert into public.viking_enforcement_fights(
        assignment_id,player_id,target_name,target_body_type,
        attacker_health,attacker_max_health,target_health,target_max_health,
        attacker_strength,attacker_defence,attacker_agility,attacker_accuracy,
        target_strength,target_defence,target_agility,target_accuracy,
        attacker_gear_defence,target_gear_defence,attacker_equipment,target_equipment
    ) values(
        v_job.id,v_me,v_job.target_name,v_job.target_body_type,
        v_start_health,greatest(v_start_health,coalesce(v_player.max_health,v_start_health)),
        v_start_health,greatest(v_start_health,coalesce(v_player.max_health,v_start_health)),
        greatest(1,coalesce(v_player.strength,100)),greatest(1,coalesce(v_player.defence,100)),
        greatest(1,coalesce(v_player.agility,100)),greatest(1,coalesce(v_player.accuracy,100)),
        greatest(1,coalesce(v_player.strength,100)),greatest(1,coalesce(v_player.defence,100)),
        greatest(1,coalesce(v_player.agility,100)),greatest(1,coalesce(v_player.accuracy,100)),
        public.combat_total_gear_defence(v_me),0,v_player_equipment,v_target_equipment
    ) returning id into v_fight_id;

    update public.player_viking_enforcement_jobs
    set state='fighting',updated_at=now()
    where id=v_job.id;
    insert into public.viking_enforcement_turns(fight_id,turn_number,actor_side,action_type,hit,message)
    values(v_fight_id,0,'player','start',true,
        v_contact.name||' sent you to confront '||v_job.target_name||' and recover the client''s goods.');

    return public.get_patron_enforcement_fight(v_fight_id);
end;
$$;

revoke all on function public.start_patron_enforcement(integer) from public,anon;
grant execute on function public.start_patron_enforcement(integer) to authenticated;

create or replace function private_api.resolve_patron_enforcement_strike(
    p_fight_id bigint,
    p_actor_side text,
    p_action text,
    p_turn integer
)
returns jsonb
language plpgsql
security definer
set search_path='public','private_api','pg_temp'
as $$
declare
    v_me uuid:=(select auth.uid());
    v_f public.viking_enforcement_fights%rowtype;
    v_player public.players%rowtype;
    v_equipment jsonb;
    v_weapon_json jsonb;
    v_weapon_id bigint;
    v_weapon_name text;
    v_weapon_damage integer;
    v_weapon_accuracy integer;
    v_actor_strength bigint;
    v_actor_accuracy bigint;
    v_target_defence bigint;
    v_target_agility bigint;
    v_target_gear_defence integer;
    v_target_health integer;
    v_actor_name text;
    v_target_name text;
    v_body text;
    v_body_label text;
    v_body_damage numeric:=1.0;
    v_body_accuracy numeric:=0;
    v_action_damage numeric:=1.0;
    v_action_accuracy numeric:=0;
    v_hit_chance numeric;
    v_hit boolean;
    v_critical boolean:=false;
    v_damage integer:=0;
    v_message text;
begin
    select * into v_f from public.viking_enforcement_fights where id=p_fight_id;
    if not found or v_me is null or v_f.player_id<>v_me then raise exception 'Patron fight not found.'; end if;
    if p_actor_side not in ('player','target') then raise exception 'Invalid fight actor.'; end if;
    select * into v_player from public.players where id=v_f.player_id;

    if p_actor_side='player' then
        v_equipment:=v_f.attacker_equipment;
        v_actor_strength:=v_f.attacker_strength;
        v_actor_accuracy:=v_f.attacker_accuracy;
        v_target_defence:=v_f.target_defence;
        v_target_agility:=v_f.target_agility;
        v_target_gear_defence:=v_f.target_gear_defence;
        v_target_health:=v_f.target_health;
        v_actor_name:=v_player.username;
        v_target_name:=v_f.target_name;
    else
        v_equipment:=v_f.target_equipment;
        v_actor_strength:=v_f.target_strength;
        v_actor_accuracy:=v_f.target_accuracy;
        v_target_defence:=v_f.attacker_defence;
        v_target_agility:=v_f.attacker_agility;
        v_target_gear_defence:=v_f.attacker_gear_defence;
        v_target_health:=v_f.attacker_health;
        v_actor_name:=v_f.target_name;
        v_target_name:=v_player.username;
    end if;

    if p_action='shoot' then
        v_weapon_json:=v_equipment->'ranged';
        if v_weapon_json is null or v_weapon_json='null'::jsonb then raise exception 'Equip a bow before shooting.'; end if;
        if p_actor_side='player' then perform public.combat_take_inventory_item(v_f.player_id,'Arrow',1); end if;
        v_action_damage:=1.0;
        v_action_accuracy:=3;
    elsif p_action in ('slash','stab') then
        v_weapon_json:=v_equipment->'main_hand';
        if v_weapon_json is null or v_weapon_json='null'::jsonb then raise exception 'Equip a melee weapon before using Slash or Stab.'; end if;
        if p_action='stab' then v_action_damage:=0.92; v_action_accuracy:=7;
        else v_action_damage:=1.08; v_action_accuracy:=-1;
        end if;
    else
        raise exception 'That action is not available during a patron fight.';
    end if;

    v_weapon_id:=nullif(v_weapon_json->>'id','')::bigint;
    v_weapon_name:=coalesce(v_weapon_json->>'name',case when p_action='shoot' then 'Bow' else 'Weapon' end);
    v_weapon_damage:=greatest(1,coalesce((v_weapon_json->>'damage')::integer,public.combat_item_damage(v_weapon_id),2));
    v_weapon_accuracy:=coalesce((v_weapon_json->>'accuracy')::integer,0);

    v_body:=(array['head','torso','left_arm','right_arm','left_hand','right_hand','left_leg','right_leg','left_foot','right_foot'])[1+floor(random()*10)::integer];
    v_body_label:=replace(v_body,'_',' ');
    case
        when v_body='head' then v_body_damage:=1.30; v_body_accuracy:=-16;
        when v_body='torso' then v_body_damage:=1.00; v_body_accuracy:=8;
        when v_body like '%arm' then v_body_damage:=0.90; v_body_accuracy:=-4;
        when v_body like '%hand' then v_body_damage:=0.80; v_body_accuracy:=-10;
        when v_body like '%leg' then v_body_damage:=0.95; v_body_accuracy:=-3;
        else v_body_damage:=0.75; v_body_accuracy:=-12;
    end case;

    v_hit_chance:=greatest(18,least(96,
        68+((sqrt(v_actor_accuracy::numeric)-sqrt(v_target_agility::numeric))*2.0)
        +(v_weapon_accuracy*1.5)+v_body_accuracy+v_action_accuracy
    ));
    v_hit:=(random()*100)<v_hit_chance;
    if v_hit then
        v_critical:=(random()*100)<greatest(5,least(18,5+sqrt(v_actor_accuracy::numeric)/4));
        v_damage:=greatest(1,round((
            v_weapon_damage+sqrt(v_actor_strength::numeric)*0.70
            -sqrt(v_target_defence::numeric)*0.25-v_target_gear_defence*0.35
        )*v_body_damage*v_action_damage*(case when v_critical then 1.55 else 1 end))::integer);
        v_damage:=least(v_damage,greatest(0,v_target_health-1));
        v_message:=v_actor_name||case when p_action='shoot' then ' shot ' when p_action='stab' then ' stabbed ' else ' slashed ' end
            ||v_target_name||' in the '||v_body_label||' with '||v_weapon_name||', dealing '||v_damage||' damage'
            ||case when v_critical then ' — critical hit!' else '.' end;
    else
        v_message:=v_actor_name||' tried to '||p_action||' '||v_target_name||' but missed.';
    end if;

    insert into public.viking_enforcement_turns(
        fight_id,turn_number,actor_side,action_type,body_part,hit,critical,damage,message
    ) values(
        v_f.id,p_turn,p_actor_side,p_action,v_body,v_hit,v_critical,v_damage,v_message
    );

    if p_actor_side='player' then
        update public.statistics set
            damage_done=coalesce(damage_done,0)+v_damage,
            attacks_missed=coalesce(attacks_missed,0)+(case when v_hit then 0 else 1 end),
            critical_hits=coalesce(critical_hits,0)+(case when v_critical then 1 else 0 end),
            arrows_shot=coalesce(arrows_shot,0)+(case when p_action='shoot' then 1 else 0 end),
            arrows_hit=coalesce(arrows_hit,0)+(case when p_action='shoot' and v_hit then 1 else 0 end),
            arrows_missed=coalesce(arrows_missed,0)+(case when p_action='shoot' and not v_hit then 1 else 0 end)
        where player_id=v_f.player_id;
    else
        update public.statistics
        set damage_taken=coalesce(damage_taken,0)+v_damage
        where player_id=v_f.player_id;
    end if;

    return jsonb_build_object('hit',v_hit,'critical',v_critical,'damage',v_damage,'message',v_message,'body_part',v_body);
end;
$$;

revoke all on function private_api.resolve_patron_enforcement_strike(bigint,text,text,integer)
from public,anon,authenticated;

create or replace function public.perform_patron_enforcement_action(
    p_fight_id bigint,
    p_action text,
    p_body_part text default null
)
returns jsonb
language plpgsql
security definer
set search_path='public','private_api','pg_temp'
as $$
declare
    v_me uuid:=(select auth.uid());
    v_f public.viking_enforcement_fights%rowtype;
    v_player public.players%rowtype;
    v_action text:=lower(trim(coalesce(p_action,'')));
    v_turn integer;
    v_result jsonb;
    v_damage integer;
    v_target_hp integer;
    v_player_hp integer;
    v_counter_action text;
    v_attack_count integer;
    v_flee_chance numeric;
    v_courage_cost integer;
begin
    if v_me is null then raise exception 'Sign in required.'; end if;
    select * into v_f
    from public.viking_enforcement_fights
    where id=p_fight_id and player_id=v_me
    for update;
    if not found then raise exception 'Patron fight not found.'; end if;
    if v_f.status<>'active' then return public.get_patron_enforcement_fight(v_f.id); end if;
    select * into v_player from public.players where id=v_me for update;
    v_turn:=v_f.turn_number+1;

    if v_action in ('slash','stab','shoot') then
        if v_action in ('slash','stab') and (
            v_f.attacker_equipment->'main_hand' is null or v_f.attacker_equipment->'main_hand'='null'::jsonb
        ) then raise exception 'Equip a melee weapon before using Slash or Stab.'; end if;
        if v_action='shoot' and (
            v_f.attacker_equipment->'ranged' is null or v_f.attacker_equipment->'ranged'='null'::jsonb
        ) then raise exception 'Equip a bow before shooting.'; end if;

        v_courage_cost:=case when coalesce(v_player.is_donator,false) then 25 else 50 end;
        if coalesce(v_player.courage,0)<v_courage_cost then raise exception 'You need % Courage for another attack.',v_courage_cost; end if;
        update public.players
        set courage=greatest(0,courage-v_courage_cost),last_action=now()
        where id=v_me;

        v_result:=private_api.resolve_patron_enforcement_strike(v_f.id,'player',v_action,v_turn);
        v_damage:=coalesce((v_result->>'damage')::integer,0);
        v_target_hp:=greatest(1,v_f.target_health-v_damage);
        update public.viking_enforcement_fights
        set target_health=v_target_hp,turn_number=v_turn,last_action_at=now()
        where id=v_f.id;
        if v_target_hp<=1 then
            update public.viking_enforcement_fights
            set status='player_won',ended_at=now(),last_action_at=now()
            where id=v_f.id;
            return public.get_patron_enforcement_fight(v_f.id);
        end if;
    elsif v_action='flee' then
        v_flee_chance:=50;
        if random()*100<v_flee_chance then
            update public.viking_enforcement_fights
            set status='player_fled',ended_at=now(),turn_number=v_turn,last_action_at=now()
            where id=v_f.id;
            update public.player_viking_enforcement_jobs
            set state='assigned',updated_at=now()
            where id=v_f.assignment_id;
            insert into public.viking_enforcement_turns(fight_id,turn_number,actor_side,action_type,hit,message)
            values(v_f.id,v_turn,'player','flee',true,v_player.username||' escaped from '||v_f.target_name||'.');
            return public.get_patron_enforcement_fight(v_f.id);
        end if;
        insert into public.viking_enforcement_turns(fight_id,turn_number,actor_side,action_type,hit,message)
        values(v_f.id,v_turn,'player','flee',false,v_player.username||' tried to flee, but '||v_f.target_name||' blocked the way.');
        update public.viking_enforcement_fights
        set turn_number=v_turn,last_action_at=now()
        where id=v_f.id;
    else
        raise exception 'That action is not available during a patron fight.';
    end if;

    v_turn:=v_turn+1;
    v_counter_action:=case when random()<0.5 then 'slash' else 'stab' end;
    v_result:=private_api.resolve_patron_enforcement_strike(v_f.id,'target',v_counter_action,v_turn);
    v_damage:=coalesce((v_result->>'damage')::integer,0);
    select attacker_health into v_player_hp
    from public.viking_enforcement_fights where id=v_f.id;
    v_player_hp:=greatest(1,v_player_hp-v_damage);
    update public.viking_enforcement_fights
    set attacker_health=v_player_hp,turn_number=v_turn,last_action_at=now()
    where id=v_f.id;

    if v_player_hp<=1 then
        update public.viking_enforcement_fights
        set status='target_won',ended_at=now(),last_action_at=now()
        where id=v_f.id;
        update public.player_viking_enforcement_jobs
        set state='assigned',updated_at=now()
        where id=v_f.assignment_id;
        update public.players set
            health=1,hospital_started_at=now(),hospital_until=now()+interval '30 minutes',
            hospital_reason='Defeated by '||v_f.target_name||' during a patron job',hospital_start_health=1
        where id=v_me;
        return public.get_patron_enforcement_fight(v_f.id);
    end if;

    select count(*)::integer into v_attack_count
    from public.viking_enforcement_turns
    where fight_id=v_f.id and action_type in ('slash','stab','shoot');
    if v_attack_count>=30 then
        update public.viking_enforcement_fights
        set status='crowd_intervened',ended_at=now(),last_action_at=now()
        where id=v_f.id;
        update public.player_viking_enforcement_jobs
        set state='assigned',updated_at=now()
        where id=v_f.assignment_id;
        insert into public.viking_enforcement_turns(fight_id,turn_number,actor_side,action_type,hit,message)
        values(v_f.id,v_turn+1,'target','crowd',false,'A crowd rushed in and pulled both fighters apart before the goods could be recovered.');
    end if;
    return public.get_patron_enforcement_fight(v_f.id);
end;
$$;

revoke all on function public.perform_patron_enforcement_action(bigint,text,text) from public,anon;
grant execute on function public.perform_patron_enforcement_action(bigint,text,text) to authenticated;

create or replace function public.resolve_patron_enforcement_victory(
    p_fight_id bigint,
    p_choice text
)
returns jsonb
language plpgsql
security definer
set search_path='public','private_api','pg_temp'
as $$
declare
    v_me uuid:=(select auth.uid());
    v_f public.viking_enforcement_fights%rowtype;
    v_job public.player_viking_enforcement_jobs%rowtype;
    v_item public.items%rowtype;
    v_choice text:=lower(trim(coalesce(p_choice,'')));
    v_destination text;
    v_loot jsonb:='[]'::jsonb;
begin
    if v_me is null then raise exception 'Sign in required.'; end if;
    if v_choice not in ('abandon','steal') then raise exception 'Choose Abandon or Steal.'; end if;
    select * into v_f
    from public.viking_enforcement_fights
    where id=p_fight_id and player_id=v_me
    for update;
    if not found then raise exception 'Patron fight not found.'; end if;
    if v_f.status<>'player_won' then raise exception 'Win this patron fight before choosing what to do.'; end if;
    if v_f.resolution is not null then return public.get_patron_enforcement_fight(v_f.id); end if;

    select * into v_job
    from public.player_viking_enforcement_jobs
    where id=v_f.assignment_id
    for update;
    select * into v_item from public.items where id=v_job.recovery_item_id;

    if v_choice='steal' then
        v_destination:=public.grant_gathered_item(v_me,v_job.recovery_item_id,v_job.recovery_quantity);
        v_loot:=jsonb_build_array(jsonb_build_object(
            'item_id',v_item.id,'name',v_item.name,'quantity',v_job.recovery_quantity,
            'source','assigned target','destination',v_destination
        ));
        update public.player_viking_enforcement_jobs
        set state='recovered',recovered_at=now(),updated_at=now()
        where id=v_job.id;
    else
        update public.player_viking_enforcement_jobs
        set state='assigned',updated_at=now()
        where id=v_job.id;
    end if;

    update public.viking_enforcement_fights
    set resolution=v_choice,resolved_at=now(),stolen_loot=v_loot
    where id=v_f.id;
    return public.get_patron_enforcement_fight(v_f.id);
end;
$$;

revoke all on function public.resolve_patron_enforcement_victory(bigint,text) from public,anon;
grant execute on function public.resolve_patron_enforcement_victory(bigint,text) to authenticated;

create or replace function public.get_my_patron_enforcement_jobs()
returns jsonb
language plpgsql
security definer
set search_path='public','private_api','pg_temp'
as $$
declare
    v_me uuid:=(select auth.uid());
    v_result jsonb;
    r record;
begin
    if v_me is null then raise exception 'Sign in required.'; end if;

    insert into public.player_viking_mission_progress(player_id,contact_id)
    select v_me,c.id
    from public.viking_mission_contacts c
    where c.is_active=true
    on conflict do nothing;

    for r in
        select c.id contact_id,m.mission_no
        from public.viking_mission_contacts c
        join public.player_viking_mission_progress pr
          on pr.player_id=v_me and pr.contact_id=c.id
        join public.viking_mission_catalog m
          on m.contact_id=c.id and m.mission_no=pr.next_mission_no
        left join public.viking_mission_contacts previous_contact
          on previous_contact.contact_no=c.contact_no-1
        left join public.player_viking_mission_progress previous_progress
          on previous_progress.player_id=v_me and previous_progress.contact_id=previous_contact.id
        where c.is_active=true and m.mission_type='enforcement'
          and (c.contact_no=1 or coalesce(previous_progress.main_completed,0)>=100)
    loop
        perform private_api.ensure_patron_enforcement_job(v_me,r.contact_id,r.mission_no);
    end loop;

    select coalesce(jsonb_agg(jsonb_build_object(
        'contact_no',q.contact_no,'mission_no',q.mission_no,'mission_type','enforcement',
        'client_name',q.client_name,'target_name',q.target_name,'target_body_type',q.target_body_type,
        'deal_item_name',q.deal_item_name,'deal_item_quantity',q.deal_item_quantity,
        'request_item_name',q.recovery_item_name,'request_quantity',q.recovery_quantity,
        'owned_quantity',public.tutorial_named_item_quantity(v_me,q.recovery_item_name),
        'enforcement_state',q.state,'enforcement_fight_id',q.fight_id,
        'story_text',q.client_name||' told '||q.patron_name||', “I gave '||q.target_name||' '
            ||q.deal_item_quantity||' '||q.deal_item_name||' for '||q.recovery_quantity||' '
            ||q.recovery_item_name||', but the goods were never delivered.” '
            ||q.patron_name||' says, “Find '||q.target_name||', rough them up and recover exactly '
            ||q.recovery_quantity||' '||q.recovery_item_name||' for my client.”'
    ) order by q.contact_no),'[]'::jsonb)
    into v_result
    from (
        select c.contact_no,c.name patron_name,m.mission_no,m.client_name,m.deal_item_name,
            m.deal_item_quantity,m.recovery_item_name,m.recovery_quantity,
            j.target_name,j.target_body_type,j.state,
            (
                select f.id
                from public.viking_enforcement_fights f
                where f.assignment_id=j.id
                  and (f.status='active' or (f.status='player_won' and f.resolution is null))
                order by f.id desc limit 1
            ) fight_id
        from public.viking_mission_contacts c
        join public.player_viking_mission_progress pr
          on pr.player_id=v_me and pr.contact_id=c.id
        join public.viking_mission_catalog m
          on m.contact_id=c.id and m.mission_no=pr.next_mission_no and m.mission_type='enforcement'
        join public.player_viking_enforcement_jobs j
          on j.player_id=v_me and j.contact_id=c.id and j.mission_no=m.mission_no
        left join public.viking_mission_contacts previous_contact
          on previous_contact.contact_no=c.contact_no-1
        left join public.player_viking_mission_progress previous_progress
          on previous_progress.player_id=v_me and previous_progress.contact_id=previous_contact.id
        where c.is_active=true
          and (c.contact_no=1 or coalesce(previous_progress.main_completed,0)>=100)
    ) q;
    return v_result;
end;
$$;

revoke all on function public.get_my_patron_enforcement_jobs() from public,anon;
grant execute on function public.get_my_patron_enforcement_jobs() to authenticated;

-- Main favour completion now requires proof of recovery for enforcement jobs.
create or replace function public.complete_viking_mission(p_contact_no integer)
returns jsonb
language plpgsql
security definer
set search_path='public','private_api','pg_temp'
as $$
declare
    v_player uuid:=(select auth.uid());
    v_contact public.viking_mission_contacts%rowtype;
    v_progress public.player_viking_mission_progress%rowtype;
    v_mission public.viking_mission_catalog%rowtype;
    v_job public.player_viking_enforcement_jobs%rowtype;
    v_daily integer;
    v_prev_completed integer:=100;
    v_cameo uuid;
    v_destination text;
    v_repaid boolean:=false;
    v_jobs_after integer:=0;
begin
    if v_player is null then raise exception 'Sign in required.'; end if;
    select * into v_contact
    from public.viking_mission_contacts
    where contact_no=p_contact_no and is_active=true;
    if not found then raise exception 'Patron not found.'; end if;

    if p_contact_no>1 then
        select coalesce(pr.main_completed,0) into v_prev_completed
        from public.viking_mission_contacts c
        left join public.player_viking_mission_progress pr
          on pr.contact_id=c.id and pr.player_id=v_player
        where c.contact_no=p_contact_no-1;
        if coalesce(v_prev_completed,0)<100 then raise exception 'This patron is still locked.'; end if;
    end if;

    insert into public.player_viking_mission_progress(player_id,contact_id)
    values(v_player,v_contact.id) on conflict do nothing;
    insert into public.player_viking_patron_accounts(player_id,contact_id)
    values(v_player,v_contact.id) on conflict do nothing;
    select * into v_progress
    from public.player_viking_mission_progress
    where player_id=v_player and contact_id=v_contact.id
    for update;
    if v_progress.next_mission_no>100 then raise exception 'You have completed every favour for this patron.'; end if;
    select * into v_mission
    from public.viking_mission_catalog
    where contact_id=v_contact.id and mission_no=v_progress.next_mission_no;

    insert into public.player_viking_mission_daily(player_id,mission_date,main_completed)
    values(v_player,current_date,0) on conflict do nothing;
    select main_completed into v_daily
    from public.player_viking_mission_daily
    where player_id=v_player and mission_date=current_date
    for update;
    if v_daily>=5 then raise exception 'You have completed your five main favours for today. Come back after midnight.'; end if;

    if v_mission.mission_type='enforcement' then
        perform private_api.ensure_patron_enforcement_job(v_player,v_contact.id,v_mission.mission_no);
        select * into v_job
        from public.player_viking_enforcement_jobs
        where player_id=v_player and contact_id=v_contact.id and mission_no=v_mission.mission_no
        for update;
        if v_job.state<>'recovered' then
            raise exception 'Defeat the assigned target and choose Steal before returning to your patron.';
        end if;
        perform public.consume_named_shared_item(v_player,v_mission.recovery_item_name,v_mission.recovery_quantity);
        update public.player_viking_enforcement_jobs
        set state='completed',completed_at=now(),updated_at=now()
        where id=v_job.id;
    else
        perform public.consume_named_shared_item(v_player,v_mission.request_item_name,v_mission.request_quantity);
    end if;

    update public.players
    set silver=coalesce(silver,0)+v_mission.reward_silver
    where id=v_player;
    v_destination:=public.grant_named_mission_reward(
        v_player,v_mission.reward_item_name,v_mission.reward_item_quantity
    );
    update public.player_viking_mission_progress
    set next_mission_no=next_mission_no+1,main_completed=main_completed+1,updated_at=now()
    where player_id=v_player and contact_id=v_contact.id;
    update public.player_viking_mission_daily
    set main_completed=main_completed+1
    where player_id=v_player and mission_date=current_date;
    insert into public.player_viking_mission_history(
        player_id,contact_id,mission_no,reward_silver,reward_item_name,reward_item_quantity
    ) values(
        v_player,v_contact.id,v_mission.mission_no,v_mission.reward_silver,
        v_mission.reward_item_name,v_mission.reward_item_quantity
    );

    update public.player_viking_patron_accounts
    set jobs_owed=greatest(0,jobs_owed-1),updated_at=now()
    where player_id=v_player and contact_id=v_contact.id and jobs_owed>0
    returning true,jobs_owed into v_repaid,v_jobs_after;
    v_repaid:=coalesce(v_repaid,false);
    if not v_repaid then
        select coalesce(jobs_owed,0) into v_jobs_after
        from public.player_viking_patron_accounts
        where player_id=v_player and contact_id=v_contact.id;
    end if;

    if v_mission.mission_no%10=0 then
        select p.id into v_cameo
        from public.players p
        where p.id<>v_player and p.last_online<now()-interval '30 days'
        order by random() limit 1;
        insert into public.player_viking_mission_bonus(
            player_id,contact_id,after_mission_no,cameo_player_id
        ) values(
            v_player,v_contact.id,v_mission.mission_no,v_cameo
        ) on conflict(player_id,contact_id,after_mission_no) do nothing;
    end if;

    return jsonb_build_object(
        'completed',true,'mission_no',v_mission.mission_no,'mission_type',v_mission.mission_type,
        'reward_silver',v_mission.reward_silver,'reward_item_name',v_mission.reward_item_name,
        'reward_item_quantity',v_mission.reward_item_quantity,'reward_destination',v_destination,
        'daily_completed',v_daily+1,'bonus_unlocked',(v_mission.mission_no%10=0),
        'favour_job_repaid',v_repaid,'patron_jobs_owed',coalesce(v_jobs_after,0)
    );
end;
$$;

revoke all on function public.complete_viking_mission(integer) from public,anon;
grant execute on function public.complete_viking_mission(integer) to authenticated;

commit;
