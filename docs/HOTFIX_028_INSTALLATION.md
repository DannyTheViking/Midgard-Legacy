# Midgard Legacy Hotfix 028

## Fixed

- Bedroom equipment loads even when a shared page component is delayed.
- Bedroom reads equippable items from both `inventory` and `player_storage`.
- Equip/remove validates ownership and the correct equipment slot.
- Royal Raffle entries are assigned to an exact Thursday draw.
- Missed draws are caught up automatically.
- An hourly database safety check runs the draw after Thursday 3:00 PM UK time.
- The winner receives the existing 90% prize and a notification.
- The raffle page displays only entries belonging to the current draw.

## Database

The migration has already been applied directly to the connected Supabase project.
Do not run it again unless installing this hotfix into another database.

## Replace these website files

1. `js/bedroom.js`
2. `pages/bedroom.html`
3. `js/lottery.js`
4. `pages/lottery.html`

Then upload/push the website and perform a hard refresh (`Ctrl + F5`).
