-- Midgard Legacy - restore the intended tutorial tool progression.
-- 1) No starter axe before speaking to the King.
-- 2) The King gives a temporary Rusty Axe when the challenge is accepted.
-- 3) Bog Iron is gathered by hand.
-- 4) Iron Veins require a crafted Iron Pickaxe later.
-- 5) Tutorial completion awards the permanent Iron Axe only.

begin;

alter table public.players
    alter column has_rusty_axe set default false,
    alter column rusty_axe_durability set default 0;

-- Accounts that have not spoken to the King yet should not already own the axe.
update public.players
set has_rusty_axe = false,
    rusty_axe_durability = 0
where tutorial_complete is not true
  and coalesce(tutorial_step, 0) = 0;

create or replace function public.accept_kings_tutorial_challenge()
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
    v_player uuid := auth.uid();
    v_row public.players%rowtype;
begin
    if v_player is null then
        raise exception 'Sign in required.';
    end if;

    select * into v_row
    from public.players
    where id = v_player
    for update;

    if not found then
        raise exception 'Player profile not found.';
    end if;

    if v_row.tutorial_complete then
        return jsonb_build_object('advanced', false, 'reason', 'tutorial_complete');
    end if;

    if coalesce(v_row.tutorial_step, 0) <> 0 then
        return jsonb_build_object('advanced', false, 'reason', 'already_accepted');
    end if;

    update public.players
    set tutorial_step = 1,
        has_rusty_axe = true,
        rusty_axe_durability = 100
    where id = v_player;

    return jsonb_build_object(
        'advanced', true,
        'tutorial_step', 1,
        'tool', 'Rusty Axe',
        'durability', 100
    );
end;
$$;

grant execute on function public.accept_kings_tutorial_challenge() to authenticated;

-- Bog Iron is deliberately hand-gathered. Iron Veins are the first mining node
-- that require the crafted Iron Pickaxe.
update public.gathering_resource_nodes
set required_item_id = null
where node_key = 'bog_iron';

update public.gathering_resource_nodes
set required_item_id = (
    select i.id
    from public.items i
    where lower(i.name) = 'iron pickaxe'
    order by i.id
    limit 1
)
where node_key = 'iron_vein';

create or replace function public.gather_resource_stats_core(p_node_key text, p_actions integer default 1)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
    v_player uuid := auth.uid();
    v_profession text;
    v_tool text;
    v_owned record;
    v_player_row public.players%rowtype;
    v_result jsonb;
    v_primary_quantity bigint;
    v_bonus_quantity bigint;
    v_total_quantity bigint;
    v_primary_name text;
    v_bonus_name text;
    v_roll numeric;
    v_severe_chance numeric;
    v_minor_chance numeric;
    v_damage integer;
    v_reason text;
    v_hospital jsonb;
begin
    if v_player is null then raise exception 'Sign in required.'; end if;
    if coalesce(p_actions,0) < 1 then raise exception 'Actions must be at least 1.'; end if;

    select profession into v_profession
    from public.gathering_resource_nodes
    where node_key = p_node_key and is_active = true;

    if v_profession is null then
        raise exception 'Gathering location not found.';
    end if;

    -- Woodcutting uses the temporary Rusty Axe during the tutorial,
    -- then the permanent profession Iron Axe after freedom.
    if v_profession = 'woodcutting' then
        select * into v_player_row
        from public.players
        where id = v_player
        for update;

        if coalesce(v_player_row.tutorial_complete, false) = false then
            if coalesce(v_player_row.has_rusty_axe, false) = false then
                raise exception 'The King has not given you the Rusty Axe yet.';
            end if;
            if coalesce(v_player_row.rusty_axe_durability, 0) < p_actions then
                raise exception 'Your Rusty Axe is broken. Repair it before chopping again.';
            end if;
        else
            v_tool := 'iron_axe';
        end if;
    -- Bog Iron is collected by hand. Iron Veins require the crafted pickaxe.
    elsif v_profession = 'mining' and p_node_key = 'iron_vein' then
        v_tool := 'iron_pickaxe';
    end if;

    if v_tool is not null then
        select * into v_owned
        from public.player_profession_equipment
        where player_id = v_player and equipment_key = v_tool
        for update;

        if not found then
            raise exception 'You need an % in your tool belt.',
                case when v_tool = 'iron_axe' then 'Iron Axe' else 'Iron Pickaxe' end;
        end if;

        if v_owned.current_durability < p_actions then
            raise exception 'Your tool is too damaged. Repair it before doing % actions.', p_actions;
        end if;
    end if;

    v_result := public.gather_resource_025_core(p_node_key, p_actions);

    if v_profession = 'woodcutting' and coalesce(v_player_row.tutorial_complete, false) = false then
        update public.players
        set rusty_axe_durability = greatest(0, rusty_axe_durability - p_actions)
        where id = v_player;

        v_result := v_result || jsonb_build_object(
            'tool_name', 'Rusty Axe',
            'tool_durability_remaining',
                (select rusty_axe_durability from public.players where id = v_player)
        );
    elsif v_tool is not null then
        update public.player_profession_equipment
        set current_durability = greatest(0, current_durability - p_actions),
            updated_at = now()
        where player_id = v_player and equipment_key = v_tool;

        v_result := v_result || jsonb_build_object(
            'tool_durability_remaining',
            (select current_durability
             from public.player_profession_equipment
             where player_id = v_player and equipment_key = v_tool)
        );
    end if;

    v_primary_quantity := coalesce((v_result->>'primary_quantity')::bigint,0);
    v_bonus_quantity := coalesce((v_result->>'bonus_quantity')::bigint,0);
    v_total_quantity := v_primary_quantity + v_bonus_quantity;
    v_primary_name := lower(coalesce(v_result->>'primary_item',''));
    v_bonus_name := lower(coalesce(v_result->>'bonus_item',''));

    perform public.record_task_event(v_player,'gather_actions',greatest(1,p_actions));
    perform public.record_task_event(v_player,'gather_any',v_total_quantity);
    if v_primary_name like '%log%' then perform public.record_task_event(v_player,'gather_logs',v_primary_quantity); end if;
    if v_bonus_name like '%log%' then perform public.record_task_event(v_player,'gather_logs',v_bonus_quantity); end if;
    if v_primary_name like '%stick%' then perform public.record_task_event(v_player,'gather_sticks',v_primary_quantity); end if;
    if v_bonus_name like '%stick%' then perform public.record_task_event(v_player,'gather_sticks',v_bonus_quantity); end if;
    if v_profession='woodcutting' then perform public.record_task_event(v_player,'gather_woodcutting',v_total_quantity);
    elsif v_profession='mining' then perform public.record_task_event(v_player,'gather_mining',v_total_quantity);
    elsif v_profession='foraging' then perform public.record_task_event(v_player,'gather_foraging',v_total_quantity);
    elsif v_profession='hunting' then perform public.record_task_event(v_player,'gather_hunting',v_total_quantity); end if;

    v_severe_chance := 1-power(0.99,greatest(1,p_actions));
    v_minor_chance := 1-power(0.90,greatest(1,p_actions));
    v_roll := random();

    if v_roll < v_severe_chance then
        v_damage := 20+floor(random()*21)::integer;
        v_reason := case v_profession
            when 'woodcutting' then 'A heavy branch crashed down and badly injured you.'
            when 'mining' then 'Loose rock collapsed from the mine wall and badly injured you.'
            when 'foraging' then 'You slipped down a steep bank while gathering.'
            when 'hunting' then 'A wounded animal turned on you during the hunt.'
            else 'You suffered a serious gathering accident.' end;
        v_hospital := public.admit_myself_to_hospital(v_reason,v_damage,30+floor(random()*61)::integer,v_reason);
        v_result := v_result || jsonb_build_object('accident_type','hospital','accident_message',v_reason,'damage_taken',v_damage,'hospital',v_hospital);
    elsif v_roll < v_severe_chance + ((1-v_severe_chance)*v_minor_chance) then
        v_damage := 1+floor(random()*10)::integer;
        v_reason := case v_profession
            when 'woodcutting' then (array['A branch struck your shoulder.','A splinter cut your hand.','Your axe slipped and grazed you.'])[1+floor(random()*3)::integer]
            when 'mining' then (array['A loose stone struck you.','You strained your back lifting ore.','Rock dust made you stumble.'])[1+floor(random()*3)::integer]
            when 'foraging' then (array['Thorns scratched your arms.','You slipped in the mud.','An angry bee stung you.'])[1+floor(random()*3)::integer]
            when 'hunting' then (array['The animal scratched you.','You tripped while tracking prey.','Your weapon recoiled into you.'])[1+floor(random()*3)::integer]
            else 'You suffered a minor accident.' end;
        perform public.damage_player_health(v_player,v_damage);
        v_result := v_result || jsonb_build_object('accident_type','minor','accident_message',v_reason,'damage_taken',v_damage);
    else
        v_result := v_result || jsonb_build_object('accident_type','none');
    end if;

    return v_result;
end;
$$;

-- Statistics should only count mining tool use when a mining tool was actually used.
create or replace function public.gather_resource(p_node_key text, p_actions integer default 1)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_player uuid := auth.uid();
  v_result jsonb;
  v_profession text;
  v_primary_name text;
  v_bonus_name text;
  v_primary bigint := 0;
  v_bonus bigint := 0;
  v_total bigint := 0;
  v_actions bigint := greatest(1,coalesce(p_actions,1));
  v_damage bigint := 0;
  v_changes jsonb := '{}'::jsonb;
  v_used_tool boolean := false;
begin
  v_result := public.gather_resource_stats_core(p_node_key,p_actions);
  select profession into v_profession from public.gathering_resource_nodes where node_key=p_node_key limit 1;
  v_primary_name := lower(coalesce(v_result->>'primary_item',''));
  v_bonus_name := lower(coalesce(v_result->>'bonus_item',''));
  v_primary := coalesce((v_result->>'primary_quantity')::bigint,0);
  v_bonus := coalesce((v_result->>'bonus_quantity')::bigint,0);
  v_total := v_primary + v_bonus;
  v_damage := coalesce((v_result->>'damage_taken')::bigint,0);
  v_used_tool := (v_profession='woodcutting') or (v_profession='mining' and p_node_key='iron_vein');

  v_changes := jsonb_build_object('resources_gathered',v_total);
  if v_damage > 0 then v_changes := v_changes || jsonb_build_object('damage_taken',v_damage); end if;

  case v_profession
    when 'woodcutting' then
      v_changes := v_changes || jsonb_build_object(
        'trees_chopped',v_actions,
        'logs_collected',
          (case when v_primary_name like '%log%' then v_primary else 0 end) +
          (case when v_bonus_name like '%log%' then v_bonus else 0 end),
        'tool_uses',v_actions,
        'tool_durability_lost',v_actions
      );
    when 'mining' then
      v_changes := v_changes || jsonb_build_object(
        'ore_mined',v_total,
        'mining_actions',v_actions
      );
      if v_used_tool then
        v_changes := v_changes || jsonb_build_object('tool_uses',v_actions,'tool_durability_lost',v_actions);
      end if;
    when 'fishing' then
      v_changes := v_changes || jsonb_build_object('fish_caught',v_total);
    when 'hunting' then
      v_changes := v_changes || jsonb_build_object('animals_hunted',v_actions);
      if lower(coalesce(v_result->>'hunting_weapon',''))='bow' then
        v_changes := v_changes || jsonb_build_object('arrows_shot',v_actions);
      end if;
    else null;
  end case;

  perform public.add_statistics(v_player,v_changes);
  return v_result;
end;
$$;

create or replace function public.complete_tutorial_with_royal_tools()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
 v_player uuid:=auth.uid();
 v_row public.players%rowtype;
 v_mead_id bigint;
 v_mead_quantity integer;
 v_tool record;
 v_item_id bigint;
begin
 if v_player is null then raise exception 'Sign in required.'; end if;
 select * into v_row from public.players where id=v_player for update;
 if not found then raise exception 'Player profile not found.'; end if;
 if v_row.tutorial_complete then raise exception 'Your tutorial is already complete.'; end if;
 if coalesce(v_row.tutorial_step,0) <> 14 then raise exception 'Finish the tutorial objectives before returning to the King.'; end if;

 select id into v_mead_id from public.items where lower(name)='young mead' limit 1;
 if v_mead_id is null then raise exception 'Young Mead item is missing from the database.'; end if;
 select quantity into v_mead_quantity from public.inventory where player_id=v_player and item_id=v_mead_id for update;
 if coalesce(v_mead_quantity,0)<1 then raise exception 'You do not have the Young Mead.'; end if;
 if v_mead_quantity=1 then delete from public.inventory where player_id=v_player and item_id=v_mead_id;
 else update public.inventory set quantity=quantity-1 where player_id=v_player and item_id=v_mead_id; end if;

 update public.players set
  tutorial_step=15,
  tutorial_complete=true,
  is_free_man=true,
  kings_tax_rate=0.01,
  reputation=coalesce(reputation,0)+100,
  oak_unlocked=true,
  property_level=greatest(coalesce(property_level,0),1),
  has_rusty_axe=false,
  rusty_axe_durability=0
 where id=v_player;

 select * into v_tool
 from public.profession_equipment_definitions
 where equipment_key='iron_axe'
 limit 1;

 if found then
  insert into public.player_profession_equipment(player_id,equipment_key,current_durability)
  values(v_player,v_tool.equipment_key,v_tool.maximum_durability)
  on conflict(player_id,equipment_key) do update set
   current_durability=excluded.current_durability,
   updated_at=now();

  if to_regclass('public.equipment') is not null then
   select id into v_item_id from public.items where lower(name)=lower(v_tool.item_name) order by id limit 1;
   update public.equipment
   set item_id=v_item_id,durability=100,max_durability=100,is_equipped=true
   where player_id=v_player and slot='axe';
   if not found then
    insert into public.equipment(player_id,slot,item_id,durability,max_durability,is_equipped)
    values(v_player,'axe',v_item_id,100,100,true);
   end if;
  end if;
 end if;

 insert into public.player_notifications(player_id,notification_type,title,message,icon,link,unique_key)
 values
 (v_player,'achievement','You Are a Freeman!','Congratulations! The King has released you from thralldom. Your saga truly begins now.','👑','home.html','freeman'),
 (v_player,'equipment','A Gift from the King','The King awarded you a permanent Iron Axe for woodcutting. Your first Iron Pickaxe must be crafted later when you unlock Iron Veins.','🪓','gathering.html?profession=woodcutting','royal-tools')
 on conflict(player_id,unique_key) do nothing;

 return jsonb_build_object(
  'tutorial_complete',true,
  'is_free_man',true,
  'iron_axe_durability',100,
  'iron_pickaxe_awarded',false,
  'property_level',1
 );
end;
$$;

commit;
