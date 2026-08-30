-- Midgard Legacy - Personal task wording
-- Daily, weekly and monthly Warrior Tasks are personal objectives.
-- This migration changes wording only: targets, progress, rewards, events and reset rules stay unchanged.

create or replace function public.personal_task_label(p_event_key text, p_target bigint)
returns text
language sql
immutable
set search_path = public
as $$
    select case p_event_key
        when 'complete_job'       then 'Complete ' || p_target || ' Local ' || case when p_target = 1 then 'Job' else 'Jobs' end
        when 'craft_any'          then 'Craft ' || p_target || ' Items'
        when 'craft_arrowheads'   then 'Craft ' || p_target || ' Iron Arrowheads'
        when 'craft_arrows'       then 'Craft ' || p_target || ' Arrows'
        when 'craft_cordage'      then 'Craft ' || p_target || ' Nettle Cordage'
        when 'gather_actions'     then 'Complete ' || p_target || ' Gathering ' || case when p_target = 1 then 'Action' else 'Actions' end
        when 'gather_any'         then 'Gather ' || p_target || ' Resources'
        when 'gather_foraging'    then 'Gather ' || p_target || ' Foraging Resources'
        when 'gather_logs'        then 'Gather ' || p_target || ' Logs'
        when 'gather_mining'      then 'Gather ' || p_target || ' Mining Resources'
        when 'gather_sticks'      then 'Gather ' || p_target || ' Sticks'
        when 'gather_woodcutting' then 'Gather ' || p_target || ' Woodcutting Resources'
        when 'repair'             then 'Repair ' || p_target || ' ' || case when p_target = 1 then 'Tool or Equipment Item' else 'Tools or Equipment Items' end
        else 'Complete ' || p_target || ' ' || initcap(replace(p_event_key, '_', ' '))
    end;
$$;

-- Future task sets use simple personal objective labels.
update public.warrior_task_catalog
set label = public.personal_task_label(event_key, target)
where is_active = true;

-- Existing current task sets are updated too, without resetting progress.
update public.player_tasks
set label = public.personal_task_label(event_key, target);

grant execute on function public.personal_task_label(text,bigint) to authenticated;
