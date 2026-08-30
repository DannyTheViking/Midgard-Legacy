# Update 056 - Combat Rules + Healer Revive Privacy

## Combat
- Hit location is random on every strike.
- Mid-fight Herbal Bandages / medicine removed.
- PvP cannot reduce a player below 1 HP.
- A player reaching 1 HP loses and is sent to the Healer Hut for 30 minutes.
- A fight is stopped by a crowd after 30 actual attack strikes if neither player has been defeated.
- Slash, Stab and Shoot cost Courage, not Energy.
- Normal player: 50 Courage per attack action.
- Donator: 25 Courage per attack action.
- Defender counterattacks do not drain their Courage because they may be offline.
- Arrow ammunition is still consumed on every shot.

## Village Healer
- Patient list simplified to Name / Reason / Revive.
- Players can disable player revives using the new preference toggle.
- Revive opt-out is enforced in Supabase, not only in the UI.
- The old Village Tool Repair and Yrsa Skills Shop panels are not included on the healer page.

## Changed files
- pages/combat.html
- js/combat.js
- css/combat.css
- pages/village-healer.html
- js/village-healer.js
- css/village-healer.css
- supabase/migrations/056_combat_rules_and_revive_privacy.sql
