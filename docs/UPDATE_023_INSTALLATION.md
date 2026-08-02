# Update 023 installation

## Install order

1. Back up the Supabase database and current website.
2. Run `supabase/migrations/022_level_only_woodcutting_and_mining.sql` if it has not already been run.
3. Run `supabase/migrations/023_profession_equipment_and_notifications.sql` in the Supabase SQL Editor.
4. Upload the complete project files from this update, preserving the folder structure.
5. Sign out and back in, then hard-refresh the browser.

## What this update adds

- Permanent Job Point profession equipment records.
- Durability values for axe, pickaxe, fishing net, fishing rod, bow, knife and spear.
- Fishing bait bucket state with four uses per bucket.
- Contextual gathering equipment panel.
- Supabase-created skill level-up notifications.
- Permanent equipment purchase notifications.
- Notification bell with unread count.
- Full Notifications page with filters, mark-all-read and delete-read actions.

## Important behaviour

Permanent tools are never deleted when durability reaches zero. Future repair recipes should update `player_profession_equipment.current_durability`; they should not insert another copy into ordinary inventory.
