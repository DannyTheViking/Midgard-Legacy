# Hotfix 030 — Profession Tools and Hunting Knife

## Installed directly in Supabase

- Hunting Knife added to Eirik the Hunter's Job Point market.
- Cost: **5 Job Points**.
- Buying it deducts 5 Job Points and permanently unlocks the tool.
- Iron Axe and Iron Pickaxe now appear under Bedroom → Tools.
- Permanent profession tools appear in Bedroom even though they are stored in `player_profession_equipment`.
- Tool durability is displayed on the Bedroom card.
- Each profession tool uses its own equipment slot, so equipping an axe does not remove a pickaxe or Hunting Knife.
- Hunting Trap is recognised by the Job Point market as an owned tool after purchase.

## Website files changed

- `js/bedroom.js`
- `js/job-yard.js`
- `pages/bedroom.html`
- `pages/job-yard.html`

No SQL needs to be run manually because the live database migration is already installed.
