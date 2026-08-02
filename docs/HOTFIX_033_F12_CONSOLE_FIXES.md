# Hotfix 033 — F12 console fixes

Fixed the four errors reported during the local Live Server audit:

1. Warrior Tasks no longer calls the removed `loadGameComponents()` function.
2. Property safely handles the optional `return-current-property` button instead of trying to set `hidden` on `null`.
3. Authenticated players may call `spawn_random_npc_patient()`.
4. Authenticated players may refresh their own net worth through `recalculate_player_net_worth(uuid)`.

The Supabase permission migration was applied directly to the connected project on 31 July 2026.
The included SQL file is retained for project history only.

The Property Forge card now correctly requires Property Level 3.
