-- Midgard Legacy Hotfix 028
-- Fixes Bedroom loading/ownership and makes the Royal Raffle draw reliably.

begin;

-- ============================================================
-- BEDROOM / EQUIPMENT
-- ============================================================

create or replace function public.get_bedroom_equipment()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_player uuid := auth.uid();
begin
    if v_player is null then
        raise exception 'Sign in required.';
    end if;

    return jsonb_build_object(
        'items', coalesce((
            with owned as (
                select item_id, sum(quantity)::bigint as quantity
                from (
                    select item_id, quantity::bigint
                    from public.inventory
                    where player_id = v_player and quantity > 0

                    union all

                    select item_id, quantity::bigint
                    from public.player_storage
                    where player_id = v_player and quantity > 0
                ) source_items
                group by item_id
            )
            select jsonb_agg(
                jsonb_build_object(
                    'item_id', i.id,
                    'name', i.name,
                    'description', i.description,
                    'category', i.equipment_category,
                    'slot_key', coalesce(i.equipment_slot, i.equipment_category),
                    'quantity', owned.quantity,
                    'damage', coalesce(i.damage, 0),
                    'defence', coalesce(i.defence, 0),
                    'accuracy', coalesce(i.accuracy, 0),
                    'equipped', exists (
                        select 1
                        from public.player_equipment_slots equipment
                        where equipment.player_id = v_player
                          and equipment.item_id = i.id
                    )
                )
                order by i.name
            )
            from owned
            join public.items i on i.id = owned.item_id
            where i.equipment_category is not null
        ), '[]'::jsonb),

        'equipped', coalesce((
            select jsonb_agg(
                jsonb_build_object(
                    'slot_key', equipment.slot_key,
                    'slot_label', initcap(replace(equipment.slot_key, '_', ' ')),
                    'name', item.name
                )
                order by equipment.slot_key
            )
            from public.player_equipment_slots equipment
            join public.items item on item.id = equipment.item_id
            where equipment.player_id = v_player
        ), '[]'::jsonb),

        'total_damage', coalesce((
            select sum(coalesce(item.damage, 0))
            from public.player_equipment_slots equipment
            join public.items item on item.id = equipment.item_id
            where equipment.player_id = v_player
        ), 0),

        'total_defence', coalesce((
            select sum(coalesce(item.defence, 0))
            from public.player_equipment_slots equipment
            join public.items item on item.id = equipment.item_id
            where equipment.player_id = v_player
        ), 0),

        'total_accuracy', coalesce((
            select sum(coalesce(item.accuracy, 0))
            from public.player_equipment_slots equipment
            join public.items item on item.id = equipment.item_id
            where equipment.player_id = v_player
        ), 0)
    );
end;
$$;

create or replace function public.set_equipped_item(
    p_slot_key text,
    p_item_id bigint
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_player uuid := auth.uid();
    v_item public.items%rowtype;
    v_expected_slot text;
begin
    if v_player is null then
        raise exception 'Sign in required.';
    end if;

    select *
    into v_item
    from public.items
    where id = p_item_id;

    if not found then
        raise exception 'Item not found.';
    end if;

    if v_item.equipment_category is null then
        raise exception 'That item cannot be equipped.';
    end if;

    v_expected_slot := coalesce(v_item.equipment_slot, v_item.equipment_category);

    if p_slot_key is null or p_slot_key <> v_expected_slot then
        raise exception 'That item cannot be equipped in this slot.';
    end if;

    if coalesce(public.shared_item_quantity(v_player, p_item_id), 0) <= 0 then
        raise exception 'You do not own this item.';
    end if;

    if exists (
        select 1
        from public.player_equipment_slots
        where player_id = v_player
          and slot_key = p_slot_key
          and item_id = p_item_id
    ) then
        delete from public.player_equipment_slots
        where player_id = v_player
          and slot_key = p_slot_key;

        return jsonb_build_object('equipped', false, 'slot_key', p_slot_key);
    end if;

    insert into public.player_equipment_slots (
        player_id,
        slot_key,
        item_id,
        equipped_at
    )
    values (
        v_player,
        p_slot_key,
        p_item_id,
        now()
    )
    on conflict (player_id, slot_key)
    do update set
        item_id = excluded.item_id,
        equipped_at = now();

    return jsonb_build_object('equipped', true, 'slot_key', p_slot_key);
end;
$$;

grant execute on function public.get_bedroom_equipment() to authenticated;
grant execute on function public.set_equipped_item(text, bigint) to authenticated;

-- ============================================================
-- ROYAL RAFFLE PERIODS
-- Every draw is Thursday at 15:00 Europe/London.
-- ============================================================

alter table public.lottery_entries
    add column if not exists draw_key date;

alter table public.lottery_draws
    add column if not exists draw_key date;

create unique index if not exists lottery_draws_draw_key_unique
    on public.lottery_draws(draw_key)
    where draw_key is not null;

create index if not exists lottery_entries_draw_key_index
    on public.lottery_entries(draw_key);

create or replace function public.raffle_draw_key_for_time(p_at timestamptz)
returns date
language plpgsql
stable
set search_path = public
as $$
declare
    v_local timestamp := p_at at time zone 'Europe/London';
    v_date date := v_local::date;
    v_dow integer := extract(dow from v_local)::integer;
    v_days integer;
begin
    v_days := (4 - v_dow + 7) % 7;

    if v_dow = 4 and v_local::time >= time '15:00:00' then
        v_days := 7;
    end if;

    return v_date + v_days;
end;
$$;

create or replace function public.raffle_latest_due_draw_key(p_at timestamptz default now())
returns date
language plpgsql
stable
set search_path = public
as $$
declare
    v_local timestamp := p_at at time zone 'Europe/London';
    v_date date := v_local::date;
    v_dow integer := extract(dow from v_local)::integer;
    v_days_since_thursday integer;
    v_candidate date;
begin
    v_days_since_thursday := (v_dow - 4 + 7) % 7;
    v_candidate := v_date - v_days_since_thursday;

    if v_dow = 4 and v_local::time < time '15:00:00' then
        v_candidate := v_candidate - 7;
    end if;

    return v_candidate;
end;
$$;

update public.lottery_entries
set draw_key = public.raffle_draw_key_for_time(coalesce(created_at, entry_date::timestamptz))
where draw_key is null;

alter table public.lottery_entries
    alter column draw_key set not null;

-- Ensure every new row receives the correct draw period, including writes
-- outside the normal entry RPC.
create or replace function public.set_lottery_entry_draw_key()
returns trigger
language plpgsql
set search_path = public
as $$
begin
    if new.draw_key is null then
        new.draw_key := public.raffle_draw_key_for_time(coalesce(new.created_at, now()));
    end if;

    return new;
end;
$$;

drop trigger if exists lottery_entries_set_draw_key on public.lottery_entries;
create trigger lottery_entries_set_draw_key
before insert or update of created_at, draw_key
on public.lottery_entries
for each row
execute function public.set_lottery_entry_draw_key();

-- Entry RPC now stores the period explicitly and uses London dates for the
-- once-per-day check.
create or replace function private_api.enter_weekly_lottery(
    p_item_id bigint,
    p_quantity bigint,
    p_entry_count integer
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_uid uuid := auth.uid();
    v_current_silver bigint;
    v_inventory record;
    v_contribution_value bigint;
    v_unit_value bigint;
    v_calculated_entries integer;
    v_today date := (now() at time zone 'Europe/London')::date;
    v_draw_key date := public.raffle_draw_key_for_time(now());
begin
    if v_uid is null then
        raise exception 'Not signed in';
    end if;

    if p_quantity is null or p_quantity < 1 then
        raise exception 'Quantity must be at least one';
    end if;

    if exists (
        select 1
        from public.lottery_entries
        where player_id = v_uid
          and entry_date = v_today
    ) then
        raise exception 'You already entered today';
    end if;

    if p_item_id is null then
        v_contribution_value := p_quantity;

        select silver
        into v_current_silver
        from public.players
        where id = v_uid
        for update;

        if coalesce(v_current_silver, 0) < p_quantity then
            raise exception 'Not enough silver';
        end if;

        if v_contribution_value < 1000 then
            raise exception 'Entry must be worth at least 1,000 silver';
        end if;

        update public.players
        set silver = silver - p_quantity
        where id = v_uid;
    else
        select silver_value
        into v_unit_value
        from public.item_values
        where item_id = p_item_id;

        if v_unit_value is null then
            raise exception 'This resource cannot be used in the raffle yet';
        end if;

        v_contribution_value := v_unit_value * p_quantity;

        if v_contribution_value < 1000 then
            raise exception 'Entry must be worth at least 1,000 silver';
        end if;

        select *
        into v_inventory
        from public.inventory
        where player_id = v_uid
          and item_id = p_item_id
        for update;

        if v_inventory is null or v_inventory.quantity < p_quantity then
            raise exception 'Not enough resources';
        end if;

        update public.inventory
        set quantity = quantity - p_quantity
        where id = v_inventory.id;

        delete from public.inventory
        where id = v_inventory.id
          and quantity <= 0;
    end if;

    v_calculated_entries := floor(v_contribution_value / 1000.0)::integer;

    insert into public.lottery_entries (
        player_id,
        entry_date,
        item_id,
        quantity,
        entry_count,
        draw_key
    )
    values (
        v_uid,
        v_today,
        p_item_id,
        p_quantity,
        v_calculated_entries,
        v_draw_key
    );
end;
$$;

create or replace function public.run_raffle_draw(p_draw_key date)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_total_tickets bigint;
    v_winning_number bigint;
    v_running_total bigint := 0;
    v_winner uuid;
    v_rec record;
    v_prize_quantity bigint;
    v_prize jsonb := '{}'::jsonb;
    v_total_value bigint := 0;
    v_winner_inventory record;
    v_silver_total bigint;
begin
    if p_draw_key is null then
        raise exception 'Draw key is required.';
    end if;

    perform pg_advisory_xact_lock(hashtext('midgard_raffle_' || p_draw_key::text));

    if exists (
        select 1
        from public.lottery_draws
        where draw_key = p_draw_key
    ) then
        select winner_id
        into v_winner
        from public.lottery_draws
        where draw_key = p_draw_key;

        return v_winner;
    end if;

    select coalesce(sum(entry_count), 0)
    into v_total_tickets
    from public.lottery_entries
    where draw_key = p_draw_key;

    if v_total_tickets <= 0 then
        return null;
    end if;

    v_winning_number := floor(random() * v_total_tickets)::bigint + 1;

    for v_rec in
        select player_id, entry_count
        from public.lottery_entries
        where draw_key = p_draw_key
        order by id
    loop
        v_running_total := v_running_total + v_rec.entry_count;

        if v_running_total >= v_winning_number then
            v_winner := v_rec.player_id;
            exit;
        end if;
    end loop;

    if v_winner is null then
        raise exception 'The raffle could not select a winner.';
    end if;

    select coalesce(sum(quantity), 0)
    into v_silver_total
    from public.lottery_entries
    where draw_key = p_draw_key
      and item_id is null;

    v_prize_quantity := floor(v_silver_total * 0.90)::bigint;

    if v_prize_quantity > 0 then
        update public.players
        set silver = silver + v_prize_quantity
        where id = v_winner;

        v_prize := v_prize || jsonb_build_object('Silver', v_prize_quantity);
        v_total_value := v_total_value + v_prize_quantity;
    end if;

    for v_rec in
        select
            entry.item_id,
            item.name,
            sum(entry.quantity)::bigint as total_quantity,
            coalesce(value.silver_value, 0) as silver_value
        from public.lottery_entries entry
        join public.items item on item.id = entry.item_id
        left join public.item_values value on value.item_id = entry.item_id
        where entry.draw_key = p_draw_key
          and entry.item_id is not null
        group by entry.item_id, item.name, value.silver_value
    loop
        v_prize_quantity := floor(v_rec.total_quantity * 0.90)::bigint;

        if v_prize_quantity > 0 then
            select *
            into v_winner_inventory
            from public.inventory
            where player_id = v_winner
              and item_id = v_rec.item_id
            for update;

            if v_winner_inventory is null then
                insert into public.inventory(player_id, item_id, quantity)
                values(v_winner, v_rec.item_id, v_prize_quantity);
            else
                update public.inventory
                set quantity = quantity + v_prize_quantity
                where id = v_winner_inventory.id;
            end if;

            v_prize := v_prize || jsonb_build_object(v_rec.name, v_prize_quantity);
            v_total_value := v_total_value + (v_prize_quantity * v_rec.silver_value);
        end if;
    end loop;

    insert into public.lottery_draws (
        winner_id,
        total_value,
        drawn_at,
        prize_summary,
        draw_key
    )
    values (
        v_winner,
        v_total_value,
        now(),
        v_prize,
        p_draw_key
    );

    insert into public.player_notifications (
        player_id,
        notification_type,
        title,
        message,
        icon,
        link,
        unique_key
    )
    values (
        v_winner,
        'raffle_win',
        'Royal Raffle Winner!',
        'The gods favoured you in the draw for ' || to_char(p_draw_key, 'DD Mon YYYY') || '. Your prize has been added to your account.',
        '🍀',
        '../pages/lottery.html',
        'raffle_win_' || p_draw_key::text
    )
    on conflict do nothing;

    delete from public.lottery_entries
    where draw_key = p_draw_key;

    return v_winner;
end;
$$;

create or replace function public.run_due_weekly_raffles()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_latest_due date := public.raffle_latest_due_draw_key(now());
    v_draw_key date;
    v_count integer := 0;
begin
    for v_draw_key in
        select distinct entry.draw_key
        from public.lottery_entries entry
        where entry.draw_key <= v_latest_due
        order by entry.draw_key
    loop
        perform public.run_raffle_draw(v_draw_key);
        v_count := v_count + 1;
    end loop;

    return v_count;
end;
$$;

-- Keep the old function name working for any existing admin button.
create or replace function public.draw_weekly_lottery()
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_latest_due date := public.raffle_latest_due_draw_key(now());
    v_winner uuid;
begin
    perform public.run_due_weekly_raffles();

    select winner_id
    into v_winner
    from public.lottery_draws
    where draw_key <= v_latest_due
    order by draw_key desc
    limit 1;

    return v_winner;
end;
$$;

revoke all on function public.run_raffle_draw(date) from public, anon, authenticated;
revoke all on function public.run_due_weekly_raffles() from public, anon, authenticated;
revoke all on function public.draw_weekly_lottery() from public, anon, authenticated;

-- Schedule an hourly safety check. The function itself only draws periods that
-- have reached Thursday 15:00 in Europe/London, so daylight-saving changes are
-- handled safely and a temporary outage is caught up automatically.
create extension if not exists pg_cron with schema extensions;

do $$
declare
    v_job_id bigint;
begin
    select jobid
    into v_job_id
    from cron.job
    where jobname = 'midgard_weekly_raffle_draw';

    if v_job_id is not null then
        perform cron.unschedule(v_job_id);
    end if;

    perform cron.schedule(
        'midgard_weekly_raffle_draw',
        '0 * * * *',
        'select public.run_due_weekly_raffles();'
    );
end;
$$;

commit;
