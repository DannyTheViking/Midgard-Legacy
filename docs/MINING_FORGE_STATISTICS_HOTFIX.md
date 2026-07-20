# Mining and Forge statistics hotfix

Successful Bog Iron actions now increment:

- ore_mined by the amount gathered
- resources_gathered by the amount gathered
- mining_actions by 1

Successful Iron Bar forging increments:

- items_crafted
- blacksmith_items_crafted
- bars_forged

Migration 004 must already have been run in Supabase.
The `bars_forged` column may be farther to the right in the Table Editor.
