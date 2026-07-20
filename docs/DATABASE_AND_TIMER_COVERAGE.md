# Database and timer coverage

## Central timers

All live timers now come from `js/config.js`.

- Honey: `GAME_TIMERS.honey_seconds`
- Young Mead: `GAME_TIMERS.young_mead_seconds`

Future timer placeholders are also defined for smelting, crops, cooking and hospital stays.

## Database-connected gameplay

The build includes statistics and/or activity logging for:

- Forest
- Mining
- Sawmill
- Forge
- Carpenter
- Blacksmith
- Apiary
- Mead Hall
- Storage cart unloading
- King's freedom reward
- Lottery entries

Activity logging is fail-soft. A gameplay action is not rolled back merely because the optional log is unavailable.

## Notification groundwork

Migration 006 creates:

- `player_activity_log`
- `player_notifications`
- `achievement_definitions`
- `player_achievements`

The Freeman reward creates the first notification automatically.

## Important

Run:

`supabase/migrations/006_central_timers_activity_notifications.sql`

after migrations 004 and 005.
