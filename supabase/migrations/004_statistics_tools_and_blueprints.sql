-- Midgard Legacy
-- Atomic statistics, readable usernames, tool progression and mentor blueprints.
-- Run once in Supabase SQL Editor.

begin;

-- ---------------------------------------------------------
-- Readable statistics and future achievement counters
-- ---------------------------------------------------------

alter table public.statistics
    add column if not exists username text,
    add column if not exists resources_gathered bigint not null default 0,
    add column if not exists mining_actions bigint not null default 0,
    add column if not exists items_crafted bigint not null default 0,
    add column if not exists carpentry_items_crafted bigint not null default 0,
    add column if not exists blacksmith_items_crafted bigint not null default 0,
    add column if not exists planks_sawn bigint not null default 0,
    add column if not exists bars_forged bigint not null default 0,
    add column if not exists nails_forged bigint not null default 0,
    add column if not exists hoops_forged bigint not null default 0,
    add column if not exists buckets_crafted bigint not null default 0,
    add column if not exists barrels_crafted bigint not null default 0,
    add column if not exists beehives_built bigint not null default 0,
    add column if not exists honey_collected bigint not null default 0,
    add column if not exists mead_brewed bigint not null default 0,
    add column if not exists drinks_brewed bigint not null default 0,
    add column if not exists food_cooked bigint not null default 0,
    add column if not exists food_burnt bigint not null default 0,
    add column if not exists arrows_shot bigint not null default 0,
    add column if not exists arrows_hit bigint not null default 0,
    add column if not exists arrows_missed bigint not null default 0,
    add column if not exists critical_hits bigint not null default 0,
    add column if not exists attacks_missed bigint not null default 0,
    add column if not exists tool_uses bigint not null default 0,
    add column if not exists tool_durability_lost bigint not null default 0,
    add column if not exists tools_broken bigint not null default 0,
    add column if not exists tools_repaired bigint not null default 0,
    add column if not exists trades_completed bigint not null default 0,
    add column if not exists messages_sent bigint not null default 0,
    add column if not exists quests_completed bigint not null default 0;

update public.statistics s
set username = p.username
from public.players p
where p.id = s.player_id
  and s.username is distinct from p.username;

create or replace function public.sync_statistics_username()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    update public.statistics
    set username = new.username
    where player_id = new.id;

    return new;
end;
$$;

drop trigger if exists sync_statistics_username_trigger
on public.players;

create trigger sync_statistics_username_trigger
after insert or update of username
on public.players
for each row
execute function public.sync_statistics_username();

-- Atomic JSON counter update. This avoids race conditions and lets future
-- features add approved counters without creating a new RPC every time.
create or replace function public.increment_player_statistics_json(
    p_player_id uuid,
    p_changes jsonb
)
returns public.statistics
language plpgsql
security definer
set search_path = public
as $$
declare
    v_key text;
    v_value bigint;
    v_allowed constant text[] := array[
        'trees_chopped',
        'logs_collected',
        'trees_planted',
        'ore_mined',
        'fish_caught',
        'animals_hunted',
        'silver_earned',
        'silver_spent',
        'damage_done',
        'damage_taken',
        'times_jailed',
        'resources_gathered',
        'mining_actions',
        'items_crafted',
        'carpentry_items_crafted',
        'blacksmith_items_crafted',
        'planks_sawn',
        'bars_forged',
        'nails_forged',
        'hoops_forged',
        'buckets_crafted',
        'barrels_crafted',
        'beehives_built',
        'honey_collected',
        'mead_brewed',
        'drinks_brewed',
        'food_cooked',
        'food_burnt',
        'arrows_shot',
        'arrows_hit',
        'arrows_missed',
        'critical_hits',
        'attacks_missed',
        'tool_uses',
        'tool_durability_lost',
        'tools_broken',
        'tools_repaired',
        'trades_completed',
        'messages_sent',
        'quests_completed'
    ];
    v_result public.statistics;
begin
    if auth.uid() is not null and auth.uid() <> p_player_id then
        raise exception 'Players may update only their own statistics';
    end if;

    insert into public.statistics (player_id, username)
    select p.id, p.username
    from public.players p
    where p.id = p_player_id
    on conflict (player_id)
    do update set username = excluded.username;

    for v_key, v_value in
        select key, greatest(0, floor(value::text::numeric))::bigint
        from jsonb_each(p_changes)
    loop
        if not (v_key = any(v_allowed)) then
            raise exception 'Unsupported statistic: %', v_key;
        end if;

        execute format(
            'update public.statistics
             set %I = coalesce(%I, 0) + $1
             where player_id = $2',
            v_key,
            v_key
        )
        using v_value, p_player_id;
    end loop;

    select *
    into v_result
    from public.statistics
    where player_id = p_player_id;

    return v_result;
end;
$$;

grant execute on function public.increment_player_statistics_json(uuid, jsonb)
to authenticated;

-- ---------------------------------------------------------
-- Tool progression
-- ---------------------------------------------------------

alter table public.items
    add column if not exists tool_tier integer not null default 0,
    add column if not exists tool_power bigint not null default 0,
    add column if not exists durability_loss_per_use integer not null default 1,
    add column if not exists is_divine boolean not null default false;

update public.items
set
    tool_tier = 1,
    tool_power = 1,
    durability_loss_per_use = 1,
    is_divine = false
where lower(name) = 'rusty axe';

update public.items
set
    tool_tier = 2,
    tool_power = 5,
    durability_loss_per_use = 1,
    is_divine = false
where lower(name) in ('iron axe', 'iron pickaxe');

-- Future final-tier tools can be inserted later with is_divine = true.
-- Every normal tree/mine can use Iron tools; the final hidden node should
-- explicitly require a divine tool.

-- ---------------------------------------------------------
-- Mentor blueprint unlocks
-- ---------------------------------------------------------

create table if not exists public.player_blueprints (
    id bigint generated by default as identity primary key,
    player_id uuid not null references public.players(id) on delete cascade,
    blueprint_key text not null,
    unlocked_at timestamptz not null default now(),
    source text,
    message_seen boolean not null default false,
    unique (player_id, blueprint_key)
);

alter table public.player_blueprints enable row level security;

drop policy if exists "Players can read own blueprints"
on public.player_blueprints;

create policy "Players can read own blueprints"
on public.player_blueprints
for select
to authenticated
using (auth.uid() = player_id);

create or replace function public.unlock_level_ten_mentor_blueprints()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    if coalesce(new.blacksmithing_level, 1) >= 10 then
        insert into public.player_blueprints (
            player_id,
            blueprint_key,
            source
        )
        values (
            new.player_id,
            'personal_smithy',
            'Village Blacksmith'
        )
        on conflict (player_id, blueprint_key) do nothing;
    end if;

    if coalesce(new.carpentry_level, 1) >= 10 then
        insert into public.player_blueprints (
            player_id,
            blueprint_key,
            source
        )
        values (
            new.player_id,
            'carpentry_workshop',
            'Village Carpenter'
        )
        on conflict (player_id, blueprint_key) do nothing;
    end if;

    return new;
end;
$$;

drop trigger if exists unlock_level_ten_mentor_blueprints_trigger
on public.skills;

create trigger unlock_level_ten_mentor_blueprints_trigger
after insert or update of blacksmithing_level, carpentry_level
on public.skills
for each row
execute function public.unlock_level_ten_mentor_blueprints();

commit;
