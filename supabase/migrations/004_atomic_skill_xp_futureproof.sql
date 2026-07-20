-- Midgard Legacy
-- Atomic, race-condition-safe skill XP.
-- Run this once in Supabase SQL Editor.

begin;

-- Skill XP can safely grow well beyond normal integer limits.
alter table public.skills
    alter column woodcutting_xp type bigint using coalesce(woodcutting_xp, 0)::bigint,
    alter column mining_xp type bigint using coalesce(mining_xp, 0)::bigint,
    alter column fishing_xp type bigint using coalesce(fishing_xp, 0)::bigint,
    alter column hunting_xp type bigint using coalesce(hunting_xp, 0)::bigint,
    alter column farming_xp type bigint using coalesce(farming_xp, 0)::bigint,
    alter column blacksmithing_xp type bigint using coalesce(blacksmithing_xp, 0)::bigint,
    alter column carpentry_xp type bigint using coalesce(carpentry_xp, 0)::bigint,
    alter column cooking_xp type bigint using coalesce(cooking_xp, 0)::bigint,
    alter column brewing_xp type bigint using coalesce(brewing_xp, 0)::bigint;

create or replace function public.midgard_skill_level(p_xp bigint)
returns integer
language sql
immutable
as $$
    select greatest(
        1,
        least(
            100,
            floor(
                power(
                    greatest(coalesce(p_xp, 0), 0)::numeric / 100,
                    1.0 / 3.0
                )
            )::integer + 1
        )
    );
$$;

create or replace function public.add_skill_xp(
    p_skill_name text,
    p_amount bigint
)
returns table (
    new_xp bigint,
    new_level integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
    v_column text;
begin
    if auth.uid() is null then
        raise exception 'Authentication required';
    end if;

    if coalesce(p_amount, 0) <= 0 then
        raise exception 'XP amount must be greater than zero';
    end if;

    -- Explicit whitelist prevents SQL injection and keeps gym/combat
    -- stats separate from Level 1-100 profession skills.
    v_column := case p_skill_name
        when 'woodcutting' then 'woodcutting_xp'
        when 'mining' then 'mining_xp'
        when 'fishing' then 'fishing_xp'
        when 'hunting' then 'hunting_xp'
        when 'farming' then 'farming_xp'
        when 'blacksmithing' then 'blacksmithing_xp'
        when 'carpentry' then 'carpentry_xp'
        when 'cooking' then 'cooking_xp'
        when 'brewing' then 'brewing_xp'
        else null
    end;

    if v_column is null then
        raise exception 'Unsupported levelled skill: %', p_skill_name;
    end if;

    execute format(
        'update public.skills
         set %1$I = greatest(coalesce(%1$I, 0), 0) + $1
         where player_id = auth.uid()
         returning %1$I, public.midgard_skill_level(%1$I)',
        v_column
    )
    into new_xp, new_level
    using p_amount;

    if not found then
        insert into public.skills (player_id)
        values (auth.uid())
        on conflict (player_id) do nothing;

        execute format(
            'update public.skills
             set %1$I = greatest(coalesce(%1$I, 0), 0) + $1
             where player_id = auth.uid()
             returning %1$I, public.midgard_skill_level(%1$I)',
            v_column
        )
        into new_xp, new_level
        using p_amount;
    end if;

    return next;
end;
$$;

revoke all on function public.add_skill_xp(text, bigint) from public;
grant execute on function public.add_skill_xp(text, bigint) to authenticated;

commit;
