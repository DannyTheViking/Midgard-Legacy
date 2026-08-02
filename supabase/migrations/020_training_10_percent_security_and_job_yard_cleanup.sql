-- =========================================================
-- MIDGARD LEGACY
-- 020 - 10% TRAINING, SECURITY HARDENING AND JOB YARD CLEANUP
-- =========================================================

begin;

-- ---------------------------------------------------------
-- TRAINING GROUNDS
-- Every session costs 250 Silver Pieces and increases the
-- selected current battle stat by exactly 10%.
-- ---------------------------------------------------------

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
begin
    if v_player is null then
        raise exception 'You must be logged in.';
    end if;

    target_stat := lower(trim(target_stat));

    if target_stat not in ('strength', 'defence', 'agility', 'accuracy') then
        raise exception 'Choose Strength, Defence, Agility or Accuracy.';
    end if;

    perform 1
    from public.players
    where id = v_player
      and coalesce(silver, 0) >= 250
    for update;

    if not found then
        raise exception 'You need 250 Silver Pieces to train.';
    end if;

    execute format(
        'select %I from public.players where id = $1',
        target_stat
    )
    into v_before
    using v_player;

    v_before := greatest(100, coalesce(v_before, 100));
    v_gain := greatest(1, floor(v_before * 0.10)::bigint);
    v_after := v_before + v_gain;

    execute format(
        'update public.players
         set silver = silver - 250,
             %I = $1
         where id = $2',
        target_stat
    )
    using v_after, v_player;

    insert into public.training_sessions(
        player_id,
        stat_name,
        stat_before,
        stat_gain,
        stat_after,
        silver_cost
    )
    values(
        v_player,
        target_stat,
        v_before,
        v_gain,
        v_after,
        250
    );

    return jsonb_build_object(
        'stat_name', target_stat,
        'stat_before', v_before,
        'stat_gain', v_gain,
        'stat_after', v_after,
        'gain_percent', 10,
        'silver_cost', 250
    );
end;
$$;

-- ---------------------------------------------------------
-- REFERENCE TABLE POLICIES
-- These tables contain shared gathering configuration. They
-- are readable by signed-in players but never writable from
-- the browser.
-- ---------------------------------------------------------

alter table public.gathering_nodes enable row level security;
alter table public.gathering_loot enable row level security;

drop policy if exists "Authenticated players read gathering nodes"
on public.gathering_nodes;

create policy "Authenticated players read gathering nodes"
on public.gathering_nodes
for select
to authenticated
using (true);

drop policy if exists "Authenticated players read gathering loot"
on public.gathering_loot;

create policy "Authenticated players read gathering loot"
on public.gathering_loot
for select
to authenticated
using (true);

-- ---------------------------------------------------------
-- STORAGE VIEW
-- SECURITY INVOKER makes the view respect the querying
-- player's permissions and RLS instead of the view owner.
-- ---------------------------------------------------------

create or replace view public.player_storage_with_names
with (security_invoker = true)
as
select
    ps.id,
    p.username,
    ps.player_id,
    ps.item_id,
    i.name as item_name,
    ps.quantity
from public.player_storage ps
join public.players p
  on p.id = ps.player_id
join public.items i
  on i.id = ps.item_id;

-- ---------------------------------------------------------
-- RPC PERMISSIONS
-- Anonymous visitors cannot execute gameplay functions.
-- Internal helper functions cannot be called directly by a
-- browser client. Only the intended authenticated endpoints
-- remain exposed.
-- ---------------------------------------------------------

revoke execute on all functions in schema public from anon;

revoke execute on function public.consume_player_item(uuid, bigint, bigint) from public, anon, authenticated;
revoke execute on function public.consume_shared_item(uuid, bigint, bigint) from public, anon, authenticated;
revoke execute on function public.grant_gathered_item(uuid, bigint, bigint) from public, anon, authenticated;
revoke execute on function public.player_item_quantity(uuid, bigint) from public, anon, authenticated;
revoke execute on function public.process_forge_queue(uuid) from public, anon, authenticated;
revoke execute on function public.shared_item_quantity(uuid, bigint) from public, anon, authenticated;
revoke execute on function public.station_level_for(uuid, text) from public, anon, authenticated;

grant execute on function public.add_station_fuel(bigint, bigint) to authenticated;
grant execute on function public.buy_profession_shop_item(bigint) to authenticated;
grant execute on function public.claim_workstation_job(bigint) to authenticated;
grant execute on function public.complete_npc_barter(bigint) to authenticated;
grant execute on function public.gather_resource(text, integer) to authenticated;
grant execute on function public.get_workstation_screen(text) to authenticated;
grant execute on function public.hand_in_village_job(bigint) to authenticated;
grant execute on function public.queue_workstation_recipe(text, integer) to authenticated;
grant execute on function public.train_battle_stat(text) to authenticated;
grant execute on function public.use_hospital_medicine(text) to authenticated;

commit;
