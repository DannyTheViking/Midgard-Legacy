# Update 025 Installation

## What this update adds

- Hunting Knife in the Hunter's Job Point Market for **1 Job Point**.
- Every tree can randomly drop its own typed **Large Stick**.
- Random Bird Nest finds containing eggs, feathers, or both.
- Bird Nests remain as inventory resources and are used to start the Cooking Fire.
- Eight craftable bows, each requiring **1 matching Large Stick + 1 Nettle Cordage**.
- Better wood gives bows higher damage and durability values.
- Hunting now requires a crafted bow and one Arrow per action.
- Successful hunts recover each Arrow at a 60% chance.
- Hides and pelts require an owned, usable Hunting Knife; meat can still be collected without it.
- Arrow recipe changed to **1 Stick + 1 Iron Arrowhead + 3 Feathers = 1 Arrow**.
- Cooking Fire page:
  - 1 Bird Nest starts a 60-second timer.
  - Each log adds 600 seconds to the time already remaining.
  - When the timer reaches zero, another Bird Nest is required.

## Install order

1. Back up the Supabase database and deployed project.
2. Open Supabase SQL Editor.
3. Run:

   `supabase/migrations/025_hunting_bows_bird_nests_and_cooking_fire.sql`

4. Upload the full project files, keeping the existing folder structure.
5. Hard refresh the browser or clear the site cache.
6. Push/deploy the game for testers.

## Tester checks

1. Complete a Hunter job and confirm the Hunter's market shows a Hunting Knife costing 1 Job Point.
2. Chop several tree types and confirm ordinary Sticks still drop.
3. Confirm each tree can randomly drop its matching Large Stick.
4. Confirm a Bird Nest can randomly include eggs, feathers, or both.
5. Craft a bow using one matching Large Stick and one Nettle Cordage.
6. Confirm hunting refuses to start without a crafted bow or enough Arrows.
7. Hunt without a Hunting Knife and confirm meat is kept but hides/pelts are discarded.
8. Buy the Hunting Knife and confirm hides/pelts can then be collected.
9. Open Cooking Fire, use one Bird Nest, wait roughly 30 seconds, then add a log. The timer should become roughly 10:30.
10. Let the timer expire and confirm logs cannot be added until another Bird Nest is used.

## Files changed

- `supabase/migrations/025_hunting_bows_bird_nests_and_cooking_fire.sql`
- `js/gathering.js`
- `js/job-yard.js`
- `js/cooking-fire.js`
- `pages/job-yard.html`
- `pages/cooking-fire.html`
- `css/cooking-fire.css`
- `components/sidebar.html`
