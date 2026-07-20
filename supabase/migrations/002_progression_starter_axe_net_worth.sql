-- Midgard Legacy: progression, starter axe and complete wealth
-- Run once in Supabase SQL Editor after deploying this build.

begin;

alter table public.players
    alter column level set default 1,
    alter column has_rusty_axe set default true,
    alter column rusty_axe_durability set default 100,
    alter column oak_unlocked set default false;

update public.players
set
    has_rusty_axe = true,
    rusty_axe_durability = greatest(coalesce(rusty_axe_durability, 0), 100)
where tutorial_complete is not true
  and (
      has_rusty_axe is distinct from true
      or coalesce(rusty_axe_durability, 0) <= 0
  );

create or replace function public.midgard_skill_level(p_xp bigint)
returns integer
language sql
immutable
as $$
    select greatest(
        1,
        least(
            100,
            floor(power(greatest(coalesce(p_xp, 0), 0)::numeric / 100, 1.0 / 3.0))::integer + 1
        )
    );
$$;

update public.skills
set
    woodcutting_level = public.midgard_skill_level(woodcutting_xp),
    mining_level = public.midgard_skill_level(mining_xp),
    fishing_level = public.midgard_skill_level(fishing_xp),
    hunting_level = public.midgard_skill_level(hunting_xp),
    farming_level = public.midgard_skill_level(farming_xp),
    blacksmithing_level = public.midgard_skill_level(blacksmithing_xp),
    carpentry_level = public.midgard_skill_level(carpentry_xp),
    cooking_level = public.midgard_skill_level(cooking_xp),
    brewing_level = public.midgard_skill_level(brewing_xp),
    combat_level = public.midgard_skill_level(combat_xp);

create or replace function public.sync_skill_levels_from_xp()
returns trigger
language plpgsql
as $$
begin
    new.woodcutting_level := public.midgard_skill_level(new.woodcutting_xp);
    new.mining_level := public.midgard_skill_level(new.mining_xp);
    new.fishing_level := public.midgard_skill_level(new.fishing_xp);
    new.hunting_level := public.midgard_skill_level(new.hunting_xp);
    new.farming_level := public.midgard_skill_level(new.farming_xp);
    new.blacksmithing_level := public.midgard_skill_level(new.blacksmithing_xp);
    new.carpentry_level := public.midgard_skill_level(new.carpentry_xp);
    new.cooking_level := public.midgard_skill_level(new.cooking_xp);
    new.brewing_level := public.midgard_skill_level(new.brewing_xp);
    new.combat_level := public.midgard_skill_level(new.combat_xp);
    return new;
end;
$$;

drop trigger if exists sync_skill_levels_from_xp_trigger on public.skills;
create trigger sync_skill_levels_from_xp_trigger
before insert or update on public.skills
for each row
execute function public.sync_skill_levels_from_xp();

create or replace function public.recalculate_player_net_worth(p_player_id uuid)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
    v_total bigint := 0;
begin
    select coalesce(p.silver, 0)
    into v_total
    from public.players p
    where p.id = p_player_id;

    if not found then
        return 0;
    end if;

    v_total := v_total + coalesce((
        select sum(i.quantity::bigint * coalesce(iv.silver_value, it.base_value, it.value, 0))
        from public.inventory i
        join public.items it on it.id = i.item_id
        left join public.item_values iv on iv.item_id = i.item_id
        where i.player_id = p_player_id
    ), 0);

    v_total := v_total + coalesce((
        select sum(s.quantity::bigint * coalesce(iv.silver_value, it.base_value, it.value, 0))
        from public.player_storage s
        join public.items it on it.id = s.item_id
        left join public.item_values iv on iv.item_id = s.item_id
        where s.player_id = p_player_id
    ), 0);

    v_total := v_total + coalesce((
        select sum(ci.quantity::bigint * coalesce(iv.silver_value, it.base_value, it.value, 0))
        from public.player_carts pc
        join public.cart_items ci on ci.cart_id = pc.id
        join public.items it on it.id = ci.item_id
        left join public.item_values iv on iv.item_id = ci.item_id
        where pc.player_id = p_player_id
    ), 0);

    v_total := v_total + coalesce((
        select sum(coalesce(iv.silver_value, it.base_value, it.value, 0))
        from public.equipment e
        join public.items it on it.id = e.item_id
        left join public.item_values iv on iv.item_id = e.item_id
        where e.player_id = p_player_id
    ), 0);

    update public.players
    set net_worth = v_total
    where id = p_player_id;

    return v_total;
end;
$$;

grant execute on function public.recalculate_player_net_worth(uuid) to authenticated;

do $$
declare
    r record;
begin
    for r in select id from public.players loop
        perform public.recalculate_player_net_worth(r.id);
    end loop;
end;
$$;

commit;
