begin;

grant execute on function public.spawn_random_npc_patient() to authenticated;
revoke execute on function public.spawn_random_npc_patient() from anon;

grant execute on function public.recalculate_player_net_worth(uuid) to authenticated;
revoke execute on function public.recalculate_player_net_worth(uuid) from anon;

commit;
