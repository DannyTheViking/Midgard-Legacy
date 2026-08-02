# Update 026 Installation

1. Back up the current Supabase project and deployed game.
2. Run `supabase/migrations/026_tasks_bedroom_hunting_preparation.sql` in the Supabase SQL Editor after migration 025.
3. Upload the complete `update026` web folder, replacing matching files.
4. Hard refresh the browser.

## Tester checklist

- The scroll icon beside Messages and Notifications opens Tasks.
- Daily, weekly and monthly tabs each show ten tasks.
- Gathered logs and sticks increase broad task counters regardless of wood type.
- Crafted outputs increase counters when collected and remain counted after being used or sold.
- All ten completed tasks unlock Claim Reward.
- The Bedroom card opens from Property.
- Owned weapons and equipment can be equipped; equipped names turn green.
- Hunting Knife costs 5 Job Points and Hunting Trap costs 5 Job Points.
- Bows, arrows, spears and bark quivers appear at the Workbench where requirements are met.
- World Map opens and clearly says Mystic Beasts are coming soon; attacking is not active.

## Deliberately not added

Creature combat is not active in this release. Testers can build supplies, stats, arrows and equipment first.

## Revised Cooking and Property additions

This ZIP already contains the original Update 026 features, so do **not** install the older Update 026 ZIP first.

After migration `026_tasks_bedroom_hunting_preparation.sql`, run:

```text
supabase/migrations/027_property_cooking_skill_and_coal.sql
```

The revision adds:

- Cooking Fire card inside Property; the separate sidebar link has been removed.
- Forge/Workbench-style three-column Cooking Fire screen.
- Cooking as a levelled skill.
- High burn chance at low levels, reducing as Cooking improves.
- Burnt Food from failed meals; Burnt Food gives 30 seconds of Forge fuel.
- Fire expiration converts the burned logs into 5 Coal.
- Players must press **Collect 5 Coal** before relighting the empty fire pit.
- Iron Pot recipe requirements are supported for advanced cooking recipes.
